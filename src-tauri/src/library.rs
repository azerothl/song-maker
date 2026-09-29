use crate::mix::wav_duration_ms;
use crate::models::{AppSettings, LibraryRow, ProjectDoc};
use crate::paths::{
    atomic_write_json, ensure_dir, library_db_path, pinned_archive_name, projects_root,
    settings_path,
};
use crate::pins::*;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

/// Derive library duration and status from on-disk project artifacts.
/// Status: `empty` | `score_only` | `generated` | `stems_ready`.
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
    (None, "empty".into())
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
    if !root.exists() {
        return Ok(());
    }
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
    let path = settings_path();
    if path.exists() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut settings: AppSettings = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        if migrate_binary_pin(&mut settings) {
            save_settings(&settings)?;
        }
        return Ok(settings);
    }
    let defaults = default_settings();
    save_settings(&defaults)?;
    Ok(defaults)
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
        server_host: DEFAULT_HOST.into(),
        server_port: DEFAULT_PORT,
        output_device: None,
        audio_latency_ms: 20,
        stem_separator: DEFAULT_STEM_SEPARATOR.into(),
        cc_by_nc_accepted: false,
        yue2_license_accepted: false,
        yue2_ar_lora: None,
        yue2_nar_lora: None,
        yue2_ar_lora_scale: 1.0,
        yue2_nar_lora_scale: 1.0,
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
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
    atomic_write_json(&folder.join("project.json"), doc)
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
