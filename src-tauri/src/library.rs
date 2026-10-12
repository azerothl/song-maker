use crate::mix::wav_duration_ms;
use crate::models::{AppSettings, LibraryRow, ProjectDoc};
use crate::paths::{
    atomic_write_json, ensure_dir, library_db_path, pinned_archive_name, projects_root,
    settings_path,
};
use crate::pins::*;
use rusqlite::{params, Connection};
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Derive library duration and status from on-disk project artifacts.
/// Status: `empty` | `score_only` | `generated` | `versions_available` | `stems_ready`.
pub fn library_snapshot(folder: &Path, doc: &ProjectDoc) -> (Option<i64>, String) {
    if let Some(sep_id) = doc.active_separation_id.as_deref() {
        let sep_json = folder
            .join("separations")
            .join(sep_id)
            .join("separation.json");
        if sep_json.is_file() {
            let duration = duration_from_active_audio(folder, doc);
            return (duration, "stems_ready".into());
        }
    }
    if let Some(gen_id) = doc.active_generation_id.as_deref() {
        let gen_dir = folder.join("generations").join(gen_id);
        let wav = gen_dir.join("audio.wav");
        if wav.is_file() {
            let duration = wav_duration_ms(&wav).ok().filter(|&d| d > 0);
            return (duration, "generated".into());
        }
        let score = gen_dir.join("score.abc");
        if score.is_file() {
            return (None, "score_only".into());
        }
    }
    if let Some(duration) = active_mix_duration(folder, doc) {
        return (Some(duration), "arranged".into());
    }
    if let Some(duration) = latest_completed_generation_duration(folder) {
        return (Some(duration), "versions_available".into());
    }
    (None, "empty".into())
}

fn active_mix_duration(folder: &Path, doc: &ProjectDoc) -> Option<i64> {
    let mix_id = doc.active_mix_id.as_deref()?;
    let text = fs::read_to_string(folder.join("mixes").join(format!("{mix_id}.json"))).ok()?;
    let mix = serde_json::from_str::<crate::models::MixDoc>(&text).ok()?;
    let mut max_ms = 0i64;
    let mut has_audio_clips = false;
    for track in &mix.tracks {
        for clip in &track.clips {
            if clip.duration_ms > 0 && !clip.source_path.trim().is_empty() {
                has_audio_clips = true;
                max_ms = max_ms.max(clip.start_ms.saturating_add(clip.duration_ms));
            }
        }
    }
    (has_audio_clips && max_ms > 0).then_some(max_ms)
}

fn latest_completed_generation_duration(folder: &Path) -> Option<i64> {
    let generations = fs::read_dir(folder.join("generations")).ok()?;
    let mut completed = Vec::new();
    for entry in generations.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if !file_type.is_dir() {
            continue;
        }
        let generation_folder = entry.path();
        let result_path = generation_folder.join("result.json");
        let Ok(result_bytes) = fs::read(result_path) else {
            continue;
        };
        let Ok(result) = serde_json::from_slice::<Value>(&result_bytes) else {
            continue;
        };
        if result.get("state").and_then(Value::as_str) != Some("generated") {
            continue;
        }
        let audio = generation_folder.join("audio.wav");
        let Some(duration) = wav_duration_ms(&audio)
            .ok()
            .filter(|duration| *duration > 0)
        else {
            continue;
        };
        let order = result
            .get("finishedAt")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| entry.file_name().to_string_lossy().into_owned());
        completed.push((order, duration));
    }
    completed.sort_by(|left, right| left.0.cmp(&right.0));
    completed.last().map(|(_, duration)| *duration)
}

fn duration_from_active_audio(folder: &Path, doc: &ProjectDoc) -> Option<i64> {
    if let Some(mix_id) = doc.active_mix_id.as_deref() {
        if let Ok(text) =
            std::fs::read_to_string(folder.join("mixes").join(format!("{mix_id}.json")))
        {
            if let Ok(mix) = serde_json::from_str::<crate::models::MixDoc>(&text) {
                let mut max_ms = 0i64;
                for track in &mix.tracks {
                    for clip in &track.clips {
                        let end = clip.start_ms.saturating_add(clip.duration_ms);
                        if end > max_ms {
                            max_ms = end;
                        }
                    }
                }
                if max_ms > 0 {
                    return Some(max_ms);
                }
            }
        }
    }
    if let Some(gen_id) = doc.active_generation_id.as_deref() {
        let wav = folder.join("generations").join(gen_id).join("audio.wav");
        if wav.is_file() {
            return wav_duration_ms(&wav).ok().filter(|&d| d > 0);
        }
    }
    None
}

pub fn library_row_from_project(folder: &Path, doc: &ProjectDoc) -> LibraryRow {
    let (duration_ms, status) = library_snapshot(folder, doc);
    LibraryRow {
        id: doc.id.clone(),
        title: doc.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: doc.created_at.clone(),
        updated_at: doc.updated_at.clone(),
        duration_ms,
        status,
        cot: doc.cot.clone(),
        active_generation_id: doc.active_generation_id.clone(),
    }
}

/// Refresh duration/status for every known project from disk (repairs stale rows).
pub fn reconcile_library_from_disk() -> Result<(), String> {
    let root = projects_root();
    if root.exists() {
        for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let project_json = entry.path().join("project.json");
            if !project_json.exists() {
                continue;
            }
            let text = std::fs::read_to_string(&project_json).map_err(|e| e.to_string())?;
            let doc: ProjectDoc = match serde_json::from_str(&text) {
                Ok(d) => d,
                Err(_) => continue,
            };
            if doc.schema_version != SCHEMA_VERSION {
                continue;
            }
            upsert_library_row(&library_row_from_project(&entry.path(), &doc))?;
        }
    }
    let conn = open_library()?;
    delete_missing_library_rows(&root, &conn)
}

fn delete_missing_library_rows(root: &Path, conn: &Connection) -> Result<(), String> {
    let ids = {
        let mut statement = conn
            .prepare("SELECT id FROM project")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        rows
    };

    for id in ids {
        let mut components = Path::new(&id).components();
        let is_direct_child =
            matches!(components.next(), Some(Component::Normal(_))) && components.next().is_none();
        if !is_direct_child || !root.join(&id).join("project.json").is_file() {
            conn.execute("DELETE FROM project WHERE id=?1", params![id])
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn open_library() -> Result<Connection, String> {
    let path = library_db_path();
    if let Some(parent) = path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            duration_ms INTEGER,
            status TEXT NOT NULL,
            cot TEXT NOT NULL,
            active_generation_id TEXT
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn upsert_library_row(row: &LibraryRow) -> Result<(), String> {
    let conn = open_library()?;
    conn.execute(
        "INSERT INTO project (id, title, folder_path, created_at, updated_at, duration_ms, status, cot, active_generation_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,
           folder_path=excluded.folder_path,
           updated_at=excluded.updated_at,
           duration_ms=excluded.duration_ms,
           status=excluded.status,
           cot=excluded.cot,
           active_generation_id=excluded.active_generation_id",
        params![
            row.id,
            row.title,
            row.folder_path,
            row.created_at,
            row.updated_at,
            row.duration_ms,
            row.status,
            row.cot,
            row.active_generation_id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_library_row(id: &str) -> Result<(), String> {
    let conn = open_library()?;
    conn.execute("DELETE FROM project WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_library(query: Option<String>) -> Result<Vec<LibraryRow>, String> {
    let conn = open_library()?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM project", [], |r| r.get(0))
        .unwrap_or(0);
    if count == 0 {
        rebuild_from_disk()?;
    } else {
        // Repair stale duration/status (e.g. wiped by older save_project_form).
        let _ = reconcile_library_from_disk();
    }
    list_library_only(query)
}

fn list_library_only(query: Option<String>) -> Result<Vec<LibraryRow>, String> {
    let conn = open_library()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, folder_path, created_at, updated_at, duration_ms, status, cot, active_generation_id
             FROM project ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(LibraryRow {
                id: r.get(0)?,
                title: r.get(1)?,
                folder_path: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                duration_ms: r.get(5)?,
                status: r.get(6)?,
                cot: r.get(7)?,
                active_generation_id: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        if let Some(ref q) = query {
            if !row.title.to_lowercase().contains(&q.to_lowercase()) {
                continue;
            }
        }
        out.push(row);
    }
    Ok(out)
}

pub fn rebuild_from_disk() -> Result<(), String> {
    let root = projects_root();
    if !root.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let project_json = entry.path().join("project.json");
        if project_json.exists() {
            let text = std::fs::read_to_string(&project_json).map_err(|e| e.to_string())?;
            let doc: ProjectDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            if doc.schema_version != SCHEMA_VERSION {
                continue;
            }
            upsert_library_row(&library_row_from_project(&entry.path(), &doc))?;
        }
    }
    Ok(())
}

pub fn load_settings() -> Result<AppSettings, String> {
    let mut settings = match crate::profiles::merged_settings_from_disk() {
        Ok(s) => s,
        Err(_) => {
            let path = settings_path();
            if path.exists() {
                let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
                serde_json::from_str(&text).map_err(|e| e.to_string())?
            } else {
                let defaults = default_settings();
                save_settings(&defaults)?;
                defaults
            }
        }
    };
    if migrate_binary_pin(&mut settings) {
        save_settings(&settings)?;
    }
    Ok(settings)
}

/// Mark queued/running manifests interrupted after a process restart; GPU work
/// cannot be replayed safely without the original in-memory request context.
pub fn recover_generation_jobs() -> Result<(), String> {
    let root = projects_root();
    if !root.exists() {
        return Ok(());
    }
    for project in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let project_path = project.map_err(|e| e.to_string())?.path();
        let generations = project_path.join("generations");
        if !generations.is_dir() {
            continue;
        }
        for generation in std::fs::read_dir(generations).map_err(|e| e.to_string())? {
            let generation_path = generation.map_err(|e| e.to_string())?.path();
            let job_path = generation_path.join("job.json");
            if !job_path.is_file() {
                continue;
            }
            if generation_path.join("result.json").is_file() {
                continue;
            }
            let mut job: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&job_path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let state = job.get("state").and_then(|v| v.as_str()).unwrap_or("");
            if state == "queued" || state == "running" {
                job["state"] = serde_json::Value::String("interrupted".into());
                job["updatedAt"] = serde_json::Value::String(crate::paths::now_iso());
                crate::paths::atomic_write_json(&job_path, &job)?;
            }
        }
        let separations = project_path.join("separations");
        if separations.is_dir() {
            for separation in std::fs::read_dir(separations).map_err(|e| e.to_string())? {
                let separation_path = separation.map_err(|e| e.to_string())?.path();
                let job_path = separation_path.join("job.json");
                if !job_path.is_file() || separation_path.join("separation.json").is_file() {
                    continue;
                }
                let mut job: serde_json::Value =
                    serde_json::from_slice(&std::fs::read(&job_path).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                let state = job.get("state").and_then(|v| v.as_str()).unwrap_or("");
                if state == "queued" || state == "running" || state == "preparing" {
                    job["state"] = serde_json::Value::String("interrupted".into());
                    job["updatedAt"] = serde_json::Value::String(crate::paths::now_iso());
                    crate::paths::atomic_write_json(&job_path, &job)?;
                }
            }
        }
    }
    Ok(())
}

fn migrate_binary_pin(settings: &mut AppSettings) -> bool {
    let sha = crate::paths::pinned_archive_sha256();
    let archive = pinned_archive_name();
    if settings.binary_tag == AUDIOCPP_TAG
        && settings.binary_archive == archive
        && settings.binary_sha256 == sha
    {
        return false;
    }
    settings.binary_tag = AUDIOCPP_TAG.into();
    settings.binary_archive = archive.into();
    settings.binary_sha256 = sha.into();
    true
}

pub fn default_settings() -> AppSettings {
    let cache = crate::paths::default_cache_dir();
    let archive = crate::paths::pinned_archive_name();
    let sha = crate::paths::pinned_archive_sha256();
    AppSettings {
        projects_dir: projects_root().display().to_string(),
        cache_dir: cache.display().to_string(),
        binary_tag: AUDIOCPP_TAG.into(),
        binary_archive: archive.into(),
        binary_sha256: sha.into(),
        model_pack: "q4".into(),
        model_gguf: YUE2_Q4.into(),
        model_sha256: YUE2_Q4_SHA.into(),
        generation_engine: crate::models::default_generation_engine(),
        server_host: DEFAULT_HOST.into(),
        server_port: DEFAULT_PORT,
        output_device: None,
        audio_latency_ms: 20,
        stem_separator: DEFAULT_STEM_SEPARATOR.into(),
        cc_by_nc_accepted: false,
        yue2_license_accepted: false,
        ace_step_license_accepted: false,
        ace_step_lego_license_accepted: false,
        accepted_separator_licenses: Default::default(),
        separator_time_stats: Default::default(),
        local_yue2_enabled: true,
        yue2_ar_lora: None,
        yue2_nar_lora: None,
        yue2_ar_lora_scale: 1.0,
        yue2_nar_lora_scale: 1.0,
        mix_llm_provider: crate::models::default_mix_llm_provider(),
        mix_llm_base_url: crate::models::default_mix_llm_base_url(),
        mix_llm_model_id: crate::models::default_mix_llm_model_id(),
        mix_llm_allow_remote: crate::models::default_mix_llm_allow_remote(),
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    if let Some(id) = crate::profiles::active_profile_id() {
        return crate::profiles::split_and_save_settings(&id, settings);
    }
    atomic_write_json(&settings_path(), settings)
}

pub fn project_folder(id: &str) -> PathBuf {
    projects_root().join(id)
}

pub fn load_project(folder: &Path) -> Result<ProjectDoc, String> {
    let path = folder.join("project.json");
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc: ProjectDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if doc.schema != SCHEMA_PROJECT || doc.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "schemaVersion inconnu ou schema invalide: {}",
            doc.schema_version
        ));
    }
    Ok(doc)
}

pub fn save_project(folder: &Path, doc: &ProjectDoc) -> Result<(), String> {
    crate::project_transaction::with_lock(folder, || {
        atomic_write_json(&folder.join("project.json"), doc)
    })
}

#[cfg(test)]
mod library_snapshot_tests {
    use super::{delete_missing_library_rows, library_snapshot};
    use crate::models::ProjectDoc;
    use rusqlite::Connection;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempProject(PathBuf);

    impl TempProject {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "song-maker-library-snapshot-{}-{unique}",
                std::process::id()
            ));
            std::fs::create_dir_all(&root).unwrap();
            Self(root)
        }
    }

    impl Drop for TempProject {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn project() -> ProjectDoc {
        ProjectDoc {
            schema: "songmaker.project".into(),
            schema_version: 1,
            id: "mcp-project".into(),
            title: "MCP import".into(),
            created_at: "2026-10-11T00:00:00Z".into(),
            updated_at: "2026-10-11T00:00:00Z".into(),
            sample_rate: 48_000,
            channels: 2,
            bit_depth: 24,
            style: String::new(),
            lyrics: String::new(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: false,
            active_generation_id: None,
            active_separation_id: None,
            active_mix_id: None,
            active_score_id: None,
            generation_names: Default::default(),
        }
    }

    fn write_generation(folder: &Path, id: &str, finished_at: &str, state: &str, frames: u32) {
        let generation = folder.join("generations").join(id);
        std::fs::create_dir_all(&generation).unwrap();
        let audio = generation.join("audio.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(audio, spec).unwrap();
        for _ in 0..frames {
            writer.write_sample(0i16).unwrap();
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();
        std::fs::write(
            generation.join("result.json"),
            serde_json::json!({"state": state, "finishedAt": finished_at}).to_string(),
        )
        .unwrap();
    }

    #[test]
    fn unselected_completed_generation_is_listed_with_duration() {
        let temp = TempProject::new();
        write_generation(
            &temp.0,
            "gen-001",
            "2026-10-10T00:00:00Z",
            "generated",
            24_000,
        );
        write_generation(
            &temp.0,
            "gen-002",
            "2026-10-11T00:00:00Z",
            "generated",
            48_000,
        );

        assert_eq!(
            library_snapshot(&temp.0, &project()),
            (Some(1_000), "versions_available".into())
        );
    }

    #[test]
    fn incomplete_generation_is_not_listed_as_available() {
        let temp = TempProject::new();
        write_generation(
            &temp.0,
            "gen-001",
            "2026-10-11T00:00:00Z",
            "running",
            48_000,
        );

        assert_eq!(
            library_snapshot(&temp.0, &project()),
            (None, "empty".into())
        );
    }

    fn write_mix(folder: &Path, tracks: serde_json::Value) {
        let mixes = folder.join("mixes");
        std::fs::create_dir_all(&mixes).unwrap();
        std::fs::write(
            mixes.join("mix-v001.json"),
            serde_json::json!({
                "schema": "songmaker.mix",
                "schemaVersion": 1,
                "id": "mix-v001",
                "separationId": "",
                "sampleRate": 48000,
                "masterGainDb": 0.0,
                "peakCeilingDb": -1.0,
                "tracks": tracks
            })
            .to_string(),
        )
        .unwrap();
    }

    fn audio_clip() -> serde_json::Value {
        serde_json::json!({
            "id": "clip-001",
            "trackId": "track-001",
            "sourcePath": "imports/audio.wav",
            "sourceSha256": "",
            "startMs": 500,
            "offsetMs": 0,
            "durationMs": 1500,
            "gainDb": 0.0,
            "fadeInMs": 0,
            "fadeOutMs": 0
        })
    }

    #[test]
    fn active_imported_audio_mix_is_not_reported_as_empty() {
        let temp = TempProject::new();
        write_mix(
            &temp.0,
            serde_json::json!([{
                "id": "track-001",
                "role": "audio",
                "name": "Imported audio",
                "gainDb": 0.0,
                "pan": 0.0,
                "mute": false,
                "solo": false,
                "locked": false,
                "aiSeparated": false,
                "clips": [audio_clip()]
            }]),
        );
        let mut doc = project();
        doc.active_mix_id = Some("mix-v001".into());

        assert_eq!(
            library_snapshot(&temp.0, &doc),
            (Some(2_000), "arranged".into())
        );
    }

    #[test]
    fn active_mix_without_clips_remains_empty() {
        let temp = TempProject::new();
        write_mix(
            &temp.0,
            serde_json::json!([{
                "id": "track-001",
                "role": "audio",
                "name": "Empty audio",
                "gainDb": 0.0,
                "pan": 0.0,
                "mute": false,
                "solo": false,
                "locked": false,
                "aiSeparated": false,
                "clips": []
            }]),
        );
        let mut doc = project();
        doc.active_mix_id = Some("mix-v001".into());

        assert_eq!(library_snapshot(&temp.0, &doc), (None, "empty".into()));
    }

    #[test]
    fn active_generation_keeps_its_existing_status_and_duration() {
        let temp = TempProject::new();
        write_generation(
            &temp.0,
            "gen-001",
            "2026-10-10T00:00:00Z",
            "generated",
            24_000,
        );
        write_generation(
            &temp.0,
            "gen-002",
            "2026-10-11T00:00:00Z",
            "generated",
            48_000,
        );
        let mut doc = project();
        doc.active_generation_id = Some("gen-001".into());

        assert_eq!(
            library_snapshot(&temp.0, &doc),
            (Some(500), "generated".into())
        );
    }

    #[test]
    fn reconciliation_removes_deleted_project_rows_from_library_index() {
        let temp = TempProject::new();
        let kept = temp.0.join("kept-project");
        std::fs::create_dir_all(&kept).unwrap();
        std::fs::write(kept.join("project.json"), "{}").unwrap();

        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE project (id TEXT PRIMARY KEY);")
            .unwrap();
        conn.execute("INSERT INTO project (id) VALUES (?1)", ["kept-project"])
            .unwrap();
        conn.execute("INSERT INTO project (id) VALUES (?1)", ["deleted-project"])
            .unwrap();

        delete_missing_library_rows(&temp.0, &conn).unwrap();

        let remaining = conn
            .query_row("SELECT id FROM project", [], |row| row.get::<_, String>(0))
            .unwrap();
        assert_eq!(remaining, "kept-project");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM project", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}

#[cfg(test)]
mod settings_tests {
    use super::{default_settings, migrate_binary_pin};
    use crate::paths::pinned_archive_name;
    use crate::pins::AUDIOCPP_TAG;

    #[test]
    fn upgrades_existing_settings_to_the_current_pinned_binary() {
        let mut settings = default_settings();
        settings.binary_tag = "v0.8.1".into();
        settings.binary_archive = "audio-v0.8.1-bin-windows-x64-cuda12.4.zip".into();
        settings.binary_sha256 = "old-sha".into();

        assert!(migrate_binary_pin(&mut settings));
        assert_eq!(settings.binary_tag, AUDIOCPP_TAG);
        assert_eq!(settings.binary_archive, pinned_archive_name());
    }
}
