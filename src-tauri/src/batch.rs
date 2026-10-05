//! Batch import / plan (#368). Isolated from the Créer XOR engine.
//!
//! Admitted GPU capacity is 1 until two isolated audiocpp inferences are
//! measured overlapping. `allowReduction` launches at 1; `requireRequested`
//! refuses a higher demand.

use crate::form::{validate_cot, validate_key, validate_lyrics, validate_meter, validate_title};
use crate::hashutil::random_seed;
use crate::models::{FormInput, KeySig, Meter};
use crate::paths::{atomic_write_json, ensure_dir, now_iso, song_maker_documents};
use crate::pins::DURATION_SEC_DEFAULT;
use crate::profiles::{active_profile_id, profile_dir};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub const EXAMPLE_JSON: &str = include_str!("../../docs/batch-generation/example.batch.json");
pub const MAX_FILE_BYTES: u64 = 10 * 1024 * 1024;
pub const MAX_TASKS: u32 = 10_000;
pub const ADMITTED_PARALLEL: u32 = 1;
pub const ADMITTED_REASON_FR: &str =
    "Le parallélisme GPU n’est pas encore disponible : les prises sont générées une par une.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchRetry {
    #[serde(default)]
    pub max_attempts: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BatchOptionSet {
    pub generations: Option<u32>,
    pub cot: Option<String>,
    pub target_duration_sec: Option<u32>,
    pub prefer_full_lyrics: Option<bool>,
    pub instrumental_mode: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_opt_null_string")]
    pub singing_language: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_opt_null_u32")]
    pub tempo_bpm: Option<Option<u32>>,
    #[serde(default, deserialize_with = "deserialize_opt_null_key")]
    pub key: Option<Option<KeySig>>,
    #[serde(default, deserialize_with = "deserialize_opt_null_meter")]
    pub meter: Option<Option<Meter>>,
}

fn deserialize_opt_null_string<'de, D>(d: D) -> Result<Option<Option<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<String>::deserialize(d)?))
}

fn deserialize_opt_null_u32<'de, D>(d: D) -> Result<Option<Option<u32>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<u32>::deserialize(d)?))
}

fn deserialize_opt_null_key<'de, D>(d: D) -> Result<Option<Option<KeySig>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<KeySig>::deserialize(d)?))
}

fn deserialize_opt_null_meter<'de, D>(d: D) -> Result<Option<Option<Meter>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<Meter>::deserialize(d)?))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSongIn {
    pub id: String,
    pub title: String,
    pub style: String,
    pub lyrics: String,
    pub seed: Option<u64>,
    #[serde(flatten)]
    pub options: BatchOptionSet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchFile {
    pub schema_version: u32,
    pub name: Option<String>,
    pub max_parallel_generations: Option<u32>,
    pub parallelism_policy: Option<String>,
    pub on_error: Option<String>,
    pub retry: Option<BatchRetry>,
    pub defaults: Option<BatchOptionSet>,
    pub songs: Vec<BatchSongIn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchError {
    pub path: String,
    pub message_fr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedTask {
    pub task_id: String,
    pub song_id: String,
    pub variant_index: u32,
    pub seed: u64,
    pub title: String,
    pub style: String,
    pub lyrics: String,
    pub cot: String,
    pub target_duration_sec: u32,
    pub prefer_full_lyrics: bool,
    pub instrumental_mode: bool,
    pub singing_language: Option<String>,
    pub tempo_bpm: Option<u32>,
    pub key: Option<KeySig>,
    pub meter: Option<Meter>,
    pub project_id: Option<String>,
    pub generation_id: Option<String>,
    pub state: String,
    #[serde(default)]
    pub attempt: u32,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPreview {
    pub name: String,
    pub song_count: usize,
    pub task_count: u32,
    pub requested_parallel: u32,
    pub admitted_parallel: u32,
    pub effective_parallel: u32,
    pub parallelism_policy: String,
    pub capacity_reason_fr: String,
    pub on_error: String,
    pub retry_max_attempts: u32,
    pub songs: Vec<BatchSongPreview>,
    pub tasks: Vec<PlannedTask>,
    pub start_token: String,
    pub revision: u32,
    pub can_launch: bool,
    pub launch_block_fr: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PendingImport {
    pub file: BatchFile,
    pub input_raw: String,
    pub preview: BatchPreview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSongPreview {
    pub id: String,
    pub title: String,
    pub style_preview: String,
    pub generations: u32,
    pub lyrics_chars: usize,
    #[serde(default)]
    pub lyrics: String,
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub instrumental_mode: bool,
}

#[derive(Debug, Clone)]
pub struct ResolvedOptions {
    pub generations: u32,
    pub cot: String,
    pub target_duration_sec: u32,
    pub prefer_full_lyrics: bool,
    pub instrumental_mode: bool,
    pub singing_language: Option<String>,
    pub tempo_bpm: Option<u32>,
    pub key: Option<KeySig>,
    pub meter: Option<Meter>,
}

pub fn batches_root() -> PathBuf {
    if let Some(id) = active_profile_id() {
        profile_dir(&id).join("batches")
    } else {
        song_maker_documents().join("batches")
    }
}

pub fn admitted_parallel() -> u32 {
    ADMITTED_PARALLEL
}

pub fn parse_batch_bytes(raw: &[u8], file_stem: &str) -> Result<BatchFile, Vec<BatchError>> {
    if raw.len() as u64 > MAX_FILE_BYTES {
        return Err(vec![BatchError {
            path: "$".into(),
            message_fr: "Fichier trop volumineux (plafond 10 Mio).".into(),
        }]);
    }
    let text = std::str::from_utf8(raw).map_err(|_| {
        vec![BatchError {
            path: "$".into(),
            message_fr: "Le fichier n’est pas de l’UTF-8.".into(),
        }]
    })?;
    if let Err(dup) = reject_duplicate_json_keys(text) {
        return Err(vec![BatchError {
            path: "$".into(),
            message_fr: dup,
        }]);
    }
    let value: serde_json::Value = serde_json::from_str(text).map_err(|e| {
        vec![BatchError {
            path: format!("$:{}:{}", e.line(), e.column()),
            message_fr: format!(
                "JSON invalide (ligne {}, colonne {}) : {e}",
                e.line(),
                e.column()
            ),
        }]
    })?;
    reject_unknown_fields(&value)?;
    let mut file: BatchFile = serde_json::from_value(value).map_err(|e| {
        vec![BatchError {
            path: "$".into(),
            message_fr: format!("JSON invalide : {e}"),
        }]
    })?;
    if file.name.as_ref().is_none_or(|n| n.trim().is_empty()) {
        file.name = Some(file_stem.trim().to_string());
    }
    Ok(file)
}

pub fn plan_batch(
    file: &BatchFile,
    overrides: Option<&BatchOptionSet>,
    max_parallel_override: Option<u32>,
) -> Result<BatchPreview, Vec<BatchError>> {
    let mut errors = Vec::new();
    if file.schema_version != 1 {
        errors.push(BatchError {
            path: "schemaVersion".into(),
            message_fr: "schemaVersion doit valoir 1.".into(),
        });
    }
    if file.songs.is_empty() {
        errors.push(BatchError {
            path: "songs".into(),
            message_fr: "Au moins un morceau est requis.".into(),
        });
    }
    if file.songs.len() > 1000 {
        errors.push(BatchError {
            path: "songs".into(),
            message_fr: "Au plus 1000 morceaux.".into(),
        });
    }
    let policy = file
        .parallelism_policy
        .as_deref()
        .unwrap_or("allowReduction");
    if policy != "allowReduction" && policy != "requireRequested" {
        errors.push(BatchError {
            path: "parallelismPolicy".into(),
            message_fr: "parallelismPolicy : allowReduction | requireRequested.".into(),
        });
    }
    let on_error = file.on_error.as_deref().unwrap_or("continue");
    if on_error != "continue" && on_error != "pause" {
        errors.push(BatchError {
            path: "onError".into(),
            message_fr: "onError : continue | pause.".into(),
        });
    }
    let retry_max = file
        .retry
        .as_ref()
        .and_then(|r| r.max_attempts)
        .unwrap_or(1);
    if !(1..=5).contains(&retry_max) {
        errors.push(BatchError {
            path: "retry.maxAttempts".into(),
            message_fr: "retry.maxAttempts : 1 à 5.".into(),
        });
    }
    let requested = max_parallel_override
        .or(file.max_parallel_generations)
        .unwrap_or(2);
    if !(1..=32).contains(&requested) {
        errors.push(BatchError {
            path: "maxParallelGenerations".into(),
            message_fr: "maxParallelGenerations : 1 à 32.".into(),
        });
    }
    if let Some(name) = file.name.as_deref() {
        let n = name.trim();
        if n.is_empty() || n.chars().count() > 120 {
            errors.push(BatchError {
                path: "name".into(),
                message_fr: "name : 1 à 120 caractères.".into(),
            });
        }
    }

    let mut seen_ids = HashSet::new();
    let mut songs_out = Vec::new();
    let mut tasks = Vec::new();
    let mut total: u32 = 0;
    let defaults = file.defaults.clone().unwrap_or_default();

    for (i, song) in file.songs.iter().enumerate() {
        let path = format!("songs[{i}]");
        if !song
            .id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            || song.id.is_empty()
            || song.id.len() > 64
        {
            errors.push(BatchError {
                path: format!("{path}.id"),
                message_fr: format!("songs[{i}].id : 1–64 ASCII [A-Za-z0-9_-]."),
            });
        }
        if !seen_ids.insert(song.id.clone()) {
            errors.push(BatchError {
                path: format!("{path}.id"),
                message_fr: format!("songs[{i}].id dupliqué ({})", song.id),
            });
        }
        if let Err(e) = validate_title(&song.title) {
            errors.push(BatchError {
                path: format!("{path}.title"),
                message_fr: format!("songs[{i}].title : {e}"),
            });
        }
        let style = song.style.trim();
        if style.is_empty() || style.chars().count() > 4000 {
            errors.push(BatchError {
                path: format!("{path}.style"),
                message_fr: format!("songs[{i}].style : 1 à 4000 caractères."),
            });
        }
        let resolved = resolve_options(&defaults, &song.options, overrides);
        if let Err(e) = validate_cot(&resolved.cot) {
            errors.push(BatchError {
                path: format!("{path}.cot"),
                message_fr: e.to_string(),
            });
        }
        if !(30..=360).contains(&resolved.target_duration_sec)
            || !resolved.target_duration_sec.is_multiple_of(30)
        {
            errors.push(BatchError {
                path: format!("{path}.targetDurationSec"),
                message_fr: "Durée cible : 30 à 360 s, par pas de 30.".into(),
            });
        }
        if let Err(e) = validate_lyrics(&song.lyrics, resolved.instrumental_mode) {
            errors.push(BatchError {
                path: format!("{path}.lyrics"),
                message_fr: format!("songs[{i}].lyrics : {e}"),
            });
        }
        if song.lyrics.chars().count() > 4000 {
            errors.push(BatchError {
                path: format!("{path}.lyrics"),
                message_fr: "Paroles limitées à 4000 caractères.".into(),
            });
        }
        if let Some(ref lang) = resolved.singing_language {
            let l = lang.trim();
            if l.is_empty() || l.chars().count() > 40 {
                errors.push(BatchError {
                    path: format!("{path}.singingLanguage"),
                    message_fr: "Langue du chant : 1 à 40 caractères.".into(),
                });
            }
        }
        if let Some(bpm) = resolved.tempo_bpm {
            if !(40..=220).contains(&bpm) {
                errors.push(BatchError {
                    path: format!("{path}.tempoBpm"),
                    message_fr: "Tempo : 40 à 220.".into(),
                });
            }
        }
        if let Some(ref key) = resolved.key {
            if let Err(e) = validate_key(key) {
                errors.push(BatchError {
                    path: format!("{path}.key"),
                    message_fr: e.to_string(),
                });
            }
        }
        if let Some(ref meter) = resolved.meter {
            if let Err(e) = validate_meter(meter) {
                errors.push(BatchError {
                    path: format!("{path}.meter"),
                    message_fr: e.to_string(),
                });
            }
        }
        if !(1..=1000).contains(&resolved.generations) {
            errors.push(BatchError {
                path: format!("{path}.generations"),
                message_fr: "generations : 1 à 1000.".into(),
            });
            continue;
        }
        match total.checked_add(resolved.generations) {
            Some(n) if n <= MAX_TASKS => total = n,
            _ => {
                errors.push(BatchError {
                    path: "songs".into(),
                    message_fr: "Total de prises > 10 000.".into(),
                });
                break;
            }
        }
        let mut seeds = Vec::new();
        if let Some(base) = song.seed {
            if base > u32::MAX as u64 {
                errors.push(BatchError {
                    path: format!("{path}.seed"),
                    message_fr: "seed : 0 à 4294967295.".into(),
                });
            }
            for v in 1..=resolved.generations {
                seeds.push(base.wrapping_add((v - 1) as u64) & 0xFFFF_FFFF);
            }
        } else {
            let mut used = HashSet::new();
            for _ in 0..resolved.generations {
                let mut s = random_seed();
                while !used.insert(s) {
                    s = random_seed();
                }
                seeds.push(s);
            }
        }
        songs_out.push(BatchSongPreview {
            id: song.id.clone(),
            title: song.title.trim().to_string(),
            style_preview: style.chars().take(80).collect(),
            generations: resolved.generations,
            lyrics_chars: song.lyrics.chars().count(),
            lyrics: song.lyrics.clone(),
            style: style.to_string(),
            instrumental_mode: resolved.instrumental_mode,
        });
        for v in 1..=resolved.generations {
            tasks.push(PlannedTask {
                task_id: format!("{}-{}", song.id, v),
                song_id: song.id.clone(),
                variant_index: v,
                seed: seeds[(v - 1) as usize],
                title: song.title.trim().to_string(),
                style: style.to_string(),
                lyrics: song.lyrics.clone(),
                cot: resolved.cot.clone(),
                target_duration_sec: resolved.target_duration_sec,
                prefer_full_lyrics: resolved.prefer_full_lyrics,
                instrumental_mode: resolved.instrumental_mode,
                singing_language: resolved.singing_language.clone(),
                tempo_bpm: resolved.tempo_bpm,
                key: resolved.key.clone(),
                meter: resolved.meter.clone(),
                project_id: None,
                generation_id: None,
                state: "queued".into(),
                attempt: 0,
                last_error: None,
            });
        }
    }

    if !errors.is_empty() {
        return Err(errors);
    }

    // Fair order: first take of each song, then second, …
    tasks.sort_by_key(|t| {
        (
            t.variant_index,
            file.songs
                .iter()
                .position(|s| s.id == t.song_id)
                .unwrap_or(9999) as u32,
        )
    });

    let admitted = admitted_parallel();
    let effective = requested.min(admitted);
    let mut can_launch = true;
    let mut launch_block = None;
    if policy == "requireRequested" && requested > admitted {
        can_launch = false;
        launch_block = Some(format!(
            "{requested} demandées, {admitted} disponible. {ADMITTED_REASON_FR}"
        ));
    }
    let capacity_reason = if requested > admitted {
        format!("{requested} demandées, {admitted} disponible. {ADMITTED_REASON_FR}")
    } else {
        format!("{effective} génération(s) simultanée(s) admise(s).")
    };

    Ok(BatchPreview {
        name: file
            .name
            .clone()
            .unwrap_or_else(|| "Lot".into())
            .trim()
            .to_string(),
        song_count: songs_out.len(),
        task_count: total,
        requested_parallel: requested,
        admitted_parallel: admitted,
        effective_parallel: effective,
        parallelism_policy: policy.into(),
        capacity_reason_fr: capacity_reason,
        on_error: on_error.into(),
        retry_max_attempts: retry_max,
        songs: songs_out,
        tasks,
        start_token: uuid::Uuid::new_v4().to_string(),
        revision: 1,
        can_launch,
        launch_block_fr: launch_block,
    })
}

fn resolve_options(
    defaults: &BatchOptionSet,
    song: &BatchOptionSet,
    overrides: Option<&BatchOptionSet>,
) -> ResolvedOptions {
    fn pick<T: Clone>(song: &Option<T>, def: &Option<T>, product: T) -> T {
        song.clone()
            .unwrap_or_else(|| def.clone().unwrap_or(product))
    }
    fn pick_nullable<T: Clone>(
        song: &Option<Option<T>>,
        def: &Option<Option<T>>,
        product: Option<T>,
    ) -> Option<T> {
        if let Some(v) = song {
            return v.clone();
        }
        if let Some(v) = def {
            return v.clone();
        }
        product
    }
    let ov = overrides.cloned().unwrap_or_default();
    ResolvedOptions {
        generations: song
            .generations
            .or(ov.generations)
            .or(defaults.generations)
            .unwrap_or(1),
        cot: pick(&song.cot, &defaults.cot, "full".into()),
        target_duration_sec: pick(
            &song.target_duration_sec,
            &defaults.target_duration_sec,
            DURATION_SEC_DEFAULT,
        ),
        prefer_full_lyrics: pick(&song.prefer_full_lyrics, &defaults.prefer_full_lyrics, true),
        instrumental_mode: pick(&song.instrumental_mode, &defaults.instrumental_mode, false),
        singing_language: pick_nullable(&song.singing_language, &defaults.singing_language, None),
        tempo_bpm: pick_nullable(&song.tempo_bpm, &defaults.tempo_bpm, None),
        key: pick_nullable(&song.key, &defaults.key, None),
        meter: pick_nullable(&song.meter, &defaults.meter, None),
    }
}

pub fn task_to_form(task: &PlannedTask) -> FormInput {
    FormInput {
        title: task.title.clone(),
        style: task.style.clone(),
        lyrics: task.lyrics.clone(),
        cot: task.cot.clone(),
        singing_language: task.singing_language.clone(),
        tempo_bpm: task.tempo_bpm,
        key: task.key.clone(),
        meter: task.meter.clone(),
        seed: Some(task.seed),
        target_duration_sec: task.target_duration_sec,
        prefer_full_lyrics: task.prefer_full_lyrics,
        instrumental_mode: task.instrumental_mode,
        continuation_generation_id: None,
        audio_input_path: None,
        inpaint_start_ms: None,
        inpaint_end_ms: None,
    }
}

pub fn persist_new_batch(
    preview: &BatchPreview,
    input_raw: &str,
    tasks: &[PlannedTask],
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let dir = batches_root().join(&id);
    ensure_dir(&dir).map_err(|e| e.to_string())?;
    ensure_dir(&dir.join("tasks")).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("input.json"), input_raw).map_err(|e| e.to_string())?;
    atomic_write_json(
        &dir.join("plan.json"),
        &json!({
            "batchId": id,
            "name": preview.name,
            "revision": preview.revision,
            "requestedParallel": preview.requested_parallel,
            "admittedParallel": preview.admitted_parallel,
            "effectiveParallel": preview.effective_parallel,
            "parallelismPolicy": preview.parallelism_policy,
            "capacityReasonFr": preview.capacity_reason_fr,
            "onError": preview.on_error,
            "retryMaxAttempts": preview.retry_max_attempts,
            "tasks": tasks,
            "createdAt": now_iso(),
        }),
    )?;
    atomic_write_json(
        &dir.join("manifest.json"),
        &json!({
            "batchId": id,
            "name": preview.name,
            "state": "running",
            "revision": 1,
            "pauseRequested": false,
            "cancelRequested": false,
            "updatedAt": now_iso(),
        }),
    )?;
    for task in tasks {
        atomic_write_json(
            &dir.join("tasks").join(format!("{}.json", task.task_id)),
            task,
        )?;
    }
    Ok(id)
}

pub fn load_manifest(batch_id: &str) -> Result<serde_json::Value, String> {
    let path = batches_root().join(batch_id).join("manifest.json");
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn list_batch_summaries() -> Result<Vec<serde_json::Value>, String> {
    let root = batches_root();
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        let man = path.join("manifest.json");
        if man.is_file() {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(
                &std::fs::read_to_string(&man).map_err(|e| e.to_string())?,
            ) {
                out.push(v);
            }
        }
    }
    out.sort_by(|a, b| {
        b.get("updatedAt")
            .and_then(|x| x.as_str())
            .cmp(&a.get("updatedAt").and_then(|x| x.as_str()))
    });
    Ok(out)
}

pub fn recover_batches() -> Result<(), String> {
    let root = batches_root();
    if !root.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let dir = entry.map_err(|e| e.to_string())?.path();
        let man_path = dir.join("manifest.json");
        if !man_path.is_file() {
            continue;
        }
        let mut man: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&man_path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let state = man.get("state").and_then(|v| v.as_str()).unwrap_or("");
        if matches!(state, "running" | "pausing" | "cancelling") {
            man["state"] = json!("interrupted");
            man["updatedAt"] = json!(now_iso());
            atomic_write_json(&man_path, &man)?;
        }
        let tasks_dir = dir.join("tasks");
        if tasks_dir.is_dir() {
            for t in std::fs::read_dir(tasks_dir).map_err(|e| e.to_string())? {
                let p = t.map_err(|e| e.to_string())?.path();
                let mut task: serde_json::Value =
                    serde_json::from_str(&std::fs::read_to_string(&p).map_err(|e| e.to_string())?)
                        .map_err(|e| e.to_string())?;
                let st = task.get("state").and_then(|v| v.as_str()).unwrap_or("");
                if matches!(st, "running" | "preparing" | "publishing") {
                    task["state"] = json!("interrupted");
                    atomic_write_json(&p, &task)?;
                }
            }
        }
    }
    Ok(())
}

pub fn export_ready_results(batch_id: &str, dest: &Path) -> Result<PathBuf, String> {
    let dir = batches_root().join(batch_id);
    let plan: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(dir.join("plan.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let stamp = now_iso().replace(':', "");
    let out = dest.join(format!("batch-{batch_id}-{stamp}"));
    ensure_dir(&out).map_err(|e| e.to_string())?;
    let tasks = plan
        .get("tasks")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();
    let mut ready = 0u32;
    let mut failed = 0u32;
    for task in &tasks {
        let song = task
            .get("songId")
            .and_then(|v| v.as_str())
            .unwrap_or("song");
        let idx = task
            .get("variantIndex")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let state = task.get("state").and_then(|v| v.as_str()).unwrap_or("");
        let song_dir = out.join(song).join(format!("prise-{idx}"));
        if state == "succeeded" {
            ready += 1;
            if let (Some(pid), Some(gid)) = (
                task.get("projectId").and_then(|v| v.as_str()),
                task.get("generationId").and_then(|v| v.as_str()),
            ) {
                let wav = crate::library::project_folder(pid)
                    .join("generations")
                    .join(gid)
                    .join("audio.wav");
                if wav.is_file() {
                    ensure_dir(&song_dir).map_err(|e| e.to_string())?;
                    let _ = std::fs::copy(&wav, song_dir.join("audio.wav"));
                }
            }
        } else if state == "failed" || state == "interrupted" {
            failed += 1;
        }
    }
    atomic_write_json(
        &out.join("batch-summary.json"),
        &json!({
            "batchId": batch_id,
            "ready": ready,
            "failed": failed,
            "tasks": tasks,
        }),
    )?;
    Ok(out)
}

pub fn load_plan(batch_id: &str) -> Result<serde_json::Value, String> {
    let path = batches_root().join(batch_id).join("plan.json");
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn load_live_tasks(batch_id: &str) -> Result<Vec<PlannedTask>, String> {
    let plan = load_plan(batch_id)?;
    let mut tasks: Vec<PlannedTask> =
        serde_json::from_value(plan.get("tasks").cloned().unwrap_or_else(|| json!([])))
            .map_err(|e| e.to_string())?;
    for task in &mut tasks {
        let path = batches_root()
            .join(batch_id)
            .join("tasks")
            .join(format!("{}.json", task.task_id));
        if path.is_file() {
            *task =
                serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
        }
    }
    Ok(tasks)
}

pub fn save_task(batch_id: &str, task: &PlannedTask) -> Result<(), String> {
    let dir = batches_root().join(batch_id);
    let registry_lock = crate::project_transaction::lock_for(&dir);
    let _registry_guard = registry_lock.lock();
    let mut task = task.clone();
    let task_path = dir.join("tasks").join(format!("{}.json", task.task_id));
    if let Ok(text) = std::fs::read_to_string(&task_path) {
        if let Ok(current) = serde_json::from_str::<PlannedTask>(&text) {
            if current.state == "succeeded" && task.state != "succeeded" {
                return Ok(());
            }
            if matches!(current.state.as_str(), "cancelled" | "cancel_requested")
                && task.state != "cancel_requested"
            {
                task.state = if matches!(
                    task.state.as_str(),
                    "succeeded" | "failed" | "retry_wait" | "queued" | "cancelled"
                ) {
                    "cancelled"
                } else {
                    "cancel_requested"
                }
                .into();
            }
        }
    }
    atomic_write_json(
        &dir.join("tasks").join(format!("{}.json", task.task_id)),
        &task,
    )?;
    let mut plan = load_plan(batch_id)?;
    if let Some(arr) = plan.get_mut("tasks").and_then(|t| t.as_array_mut()) {
        let value = serde_json::to_value(&task).map_err(|e| e.to_string())?;
        for item in arr.iter_mut() {
            if item.get("taskId").and_then(|v| v.as_str()) == Some(&task.task_id) {
                *item = value.clone();
            }
        }
    }
    atomic_write_json(&dir.join("plan.json"), &plan)
}

pub fn patch_manifest(
    batch_id: &str,
    patch: impl FnOnce(&mut serde_json::Value),
) -> Result<serde_json::Value, String> {
    let dir = batches_root().join(batch_id);
    let registry_lock = crate::project_transaction::lock_for(&dir);
    let _registry_guard = registry_lock.lock();
    let mut man = load_manifest(batch_id)?;
    patch(&mut man);
    man["updatedAt"] = json!(now_iso());
    let rev = man.get("revision").and_then(|v| v.as_u64()).unwrap_or(1) + 1;
    man["revision"] = json!(rev);
    atomic_write_json(&batches_root().join(batch_id).join("manifest.json"), &man)?;
    Ok(man)
}

pub fn batch_snapshot(batch_id: &str) -> Result<serde_json::Value, String> {
    let man = load_manifest(batch_id)?;
    let plan = load_plan(batch_id)?;
    let tasks = load_live_tasks(batch_id)?;
    let mut ready = 0u32;
    let mut running = 0u32;
    let mut queued = 0u32;
    let mut failed = 0u32;
    let mut interrupted = 0u32;
    let mut cancelled = 0u32;
    for task in &tasks {
        match task.state.as_str() {
            "succeeded" => ready += 1,
            "running" | "preparing" | "publishing" => running += 1,
            "queued" | "retry_wait" => queued += 1,
            "failed" => failed += 1,
            "interrupted" => interrupted += 1,
            "cancelled" | "cancel_requested" => cancelled += 1,
            _ => {}
        }
    }
    let tasks_with_audio: Vec<_> = tasks
        .iter()
        .map(|task| {
            let mut value = serde_json::to_value(task).expect("serializable batch task");
            let audio = task
                .project_id
                .as_ref()
                .zip(task.generation_id.as_ref())
                .filter(|_| task.state == "succeeded")
                .map(|(project, generation)| {
                    crate::library::project_folder(project)
                        .join("generations")
                        .join(generation)
                        .join("audio.wav")
                })
                .filter(|path| path.is_file())
                .map(|path| path.display().to_string());
            value["audioPath"] = json!(audio);
            value
        })
        .collect();
    Ok(json!({
        "batchId": batch_id,
        "name": man.get("name").cloned().unwrap_or(json!("")),
        "state": man.get("state").cloned().unwrap_or(json!("")),
        "revision": man.get("revision").cloned().unwrap_or(json!(1)),
        "pauseRequested": man.get("pauseRequested").and_then(|v| v.as_bool()).unwrap_or(false),
        "cancelRequested": man.get("cancelRequested").and_then(|v| v.as_bool()).unwrap_or(false),
        "updatedAt": man.get("updatedAt").cloned(),
        "requestedParallel": plan.get("requestedParallel"),
        "admittedParallel": plan.get("admittedParallel"),
        "effectiveParallel": man.get("effectiveParallel").or_else(|| plan.get("effectiveParallel")),
        "capacityReasonFr": man.get("capacityReasonFr").or_else(|| plan.get("capacityReasonFr")),
        "onError": plan.get("onError"),
        "retryMaxAttempts": plan.get("retryMaxAttempts"),
        "counts": {
            "ready": ready,
            "running": running,
            "queued": queued,
            "failed": failed,
            "interrupted": interrupted,
            "cancelled": cancelled,
            "total": tasks.len() as u32,
        },
        "tasks": tasks_with_audio,
    }))
}

const ROOT_KEYS: &[&str] = &[
    "schemaVersion",
    "name",
    "maxParallelGenerations",
    "parallelismPolicy",
    "onError",
    "retry",
    "defaults",
    "songs",
];
const OPTION_KEYS: &[&str] = &[
    "generations",
    "cot",
    "targetDurationSec",
    "preferFullLyrics",
    "instrumentalMode",
    "singingLanguage",
    "tempoBpm",
    "key",
    "meter",
];
const SONG_KEYS: &[&str] = &[
    "id",
    "title",
    "style",
    "lyrics",
    "seed",
    "generations",
    "cot",
    "targetDurationSec",
    "preferFullLyrics",
    "instrumentalMode",
    "singingLanguage",
    "tempoBpm",
    "key",
    "meter",
];

fn reject_unknown_fields(value: &serde_json::Value) -> Result<(), Vec<BatchError>> {
    let mut errors = Vec::new();
    walk_object(value, "$", ROOT_KEYS, &mut errors);
    if let Some(retry) = value.get("retry") {
        walk_object(retry, "retry", &["maxAttempts"], &mut errors);
    }
    if let Some(defaults) = value.get("defaults") {
        walk_object(defaults, "defaults", OPTION_KEYS, &mut errors);
        walk_key_meter(defaults, "defaults", &mut errors);
    }
    if let Some(songs) = value.get("songs").and_then(|s| s.as_array()) {
        for (i, song) in songs.iter().enumerate() {
            let path = format!("songs[{i}]");
            walk_object(song, &path, SONG_KEYS, &mut errors);
            walk_key_meter(song, &path, &mut errors);
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn walk_object(
    value: &serde_json::Value,
    path: &str,
    allowed: &[&str],
    errors: &mut Vec<BatchError>,
) {
    let Some(obj) = value.as_object() else {
        errors.push(BatchError {
            path: path.into(),
            message_fr: format!("{path} doit être un objet."),
        });
        return;
    };
    for key in obj.keys() {
        if !allowed.contains(&key.as_str()) {
            errors.push(BatchError {
                path: format!("{path}.{key}"),
                message_fr: format!("Champ inconnu : {path}.{key}"),
            });
        }
    }
}

fn walk_key_meter(value: &serde_json::Value, path: &str, errors: &mut Vec<BatchError>) {
    if let Some(key) = value.get("key") {
        if !key.is_null() {
            walk_object(key, &format!("{path}.key"), &["tonic", "mode"], errors);
        }
    }
    if let Some(meter) = value.get("meter") {
        if !meter.is_null() {
            walk_object(
                meter,
                &format!("{path}.meter"),
                &["numerator", "denominator"],
                errors,
            );
        }
    }
}

/// Reject duplicate keys at any object depth. serde_json last-wins is not enough.
pub fn reject_duplicate_json_keys(input: &str) -> Result<(), String> {
    let bytes = input.as_bytes();
    let mut i = 0;
    parse_value(bytes, &mut i, "$")?;
    skip_ws(bytes, &mut i);
    if i != bytes.len() {
        return Err("JSON : données après la valeur racine.".into());
    }
    Ok(())
}

fn skip_ws(b: &[u8], i: &mut usize) {
    while *i < b.len() && b[*i].is_ascii_whitespace() {
        *i += 1;
    }
}

fn parse_value(b: &[u8], i: &mut usize, path: &str) -> Result<(), String> {
    skip_ws(b, i);
    let Some(&c) = b.get(*i) else {
        return Err("JSON tronqué.".into());
    };
    match c {
        b'{' => parse_object(b, i, path),
        b'[' => parse_array(b, i, path),
        b'"' => {
            parse_string(b, i)?;
            Ok(())
        }
        b't' | b'f' | b'n' => {
            while *i < b.len() && b[*i].is_ascii_alphabetic() {
                *i += 1;
            }
            Ok(())
        }
        b'-' | b'0'..=b'9' => {
            *i += 1;
            while *i < b.len()
                && (b[*i].is_ascii_digit() || matches!(b[*i], b'.' | b'e' | b'E' | b'+' | b'-'))
            {
                *i += 1;
            }
            Ok(())
        }
        _ => Err(format!("JSON inattendu à {path}")),
    }
}

fn parse_object(b: &[u8], i: &mut usize, path: &str) -> Result<(), String> {
    *i += 1;
    let mut keys = HashSet::new();
    loop {
        skip_ws(b, i);
        if b.get(*i) == Some(&b'}') {
            *i += 1;
            return Ok(());
        }
        let key = parse_string(b, i)?;
        if !keys.insert(key.clone()) {
            return Err(format!("clé JSON dupliquée ({path}.{key})"));
        }
        skip_ws(b, i);
        if b.get(*i) != Some(&b':') {
            return Err(format!("JSON : « : » attendu après {path}.{key}"));
        }
        *i += 1;
        parse_value(b, i, &format!("{path}.{key}"))?;
        skip_ws(b, i);
        match b.get(*i) {
            Some(&b',') => {
                *i += 1;
                skip_ws(b, i);
                if b.get(*i) == Some(&b'}') {
                    return Err("virgule finale interdite.".into());
                }
            }
            Some(&b'}') => {
                *i += 1;
                return Ok(());
            }
            _ => return Err("JSON objet mal formé.".into()),
        }
    }
}

fn parse_array(b: &[u8], i: &mut usize, path: &str) -> Result<(), String> {
    *i += 1;
    let mut idx = 0usize;
    loop {
        skip_ws(b, i);
        if b.get(*i) == Some(&b']') {
            *i += 1;
            return Ok(());
        }
        parse_value(b, i, &format!("{path}[{idx}]"))?;
        idx += 1;
        skip_ws(b, i);
        match b.get(*i) {
            Some(&b',') => {
                *i += 1;
            }
            Some(&b']') => {
                *i += 1;
                return Ok(());
            }
            _ => return Err("JSON tableau mal formé.".into()),
        }
    }
}

fn parse_string(b: &[u8], i: &mut usize) -> Result<String, String> {
    skip_ws(b, i);
    if b.get(*i) != Some(&b'"') {
        return Err("chaîne JSON attendue.".into());
    }
    *i += 1;
    let mut out = String::new();
    while *i < b.len() {
        let c = b[*i];
        *i += 1;
        match c {
            b'"' => return Ok(out),
            b'\\' => {
                let Some(&n) = b.get(*i) else {
                    return Err("échappement tronqué.".into());
                };
                *i += 1;
                out.push(n as char);
            }
            _ => out.push(c as char),
        }
    }
    Err("chaîne non terminée.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preview_example() -> BatchPreview {
        let file = parse_batch_bytes(EXAMPLE_JSON.as_bytes(), "example").unwrap();
        plan_batch(&file, None, None).unwrap()
    }

    #[test]
    fn example_expands_to_five_stable_tasks_and_seed_sequence() {
        let p = preview_example();
        assert_eq!(p.song_count, 2);
        assert_eq!(p.task_count, 5);
        assert_eq!(p.songs[0].lyrics, p.tasks[0].lyrics);
        assert_eq!(p.songs[0].style, p.tasks[0].style);
        let nuit: Vec<_> = p.tasks.iter().filter(|t| t.song_id == "nuit").collect();
        assert_eq!(nuit.len(), 3);
        assert_eq!(nuit[0].seed, 42);
        assert_eq!(nuit[1].seed, 43);
        assert_eq!(nuit[2].seed, 44);
        let route: Vec<_> = p.tasks.iter().filter(|t| t.song_id == "route").collect();
        assert_eq!(route.len(), 2);
        assert_eq!(route[0].target_duration_sec, 120);
        assert_eq!(p.tasks[0].song_id, "nuit");
        assert_eq!(p.tasks[1].song_id, "route");
        assert_eq!(p.effective_parallel, 1);
        assert!(p.can_launch);
        assert!(p.capacity_reason_fr.contains("1 disponible"));
    }

    #[test]
    fn seed_wraps_at_u32() {
        let raw = r#"{"schemaVersion":1,"songs":[{"id":"a","title":"Ok title","style":"pop","lyrics":"[Verse]\nHi","seed":4294967295,"generations":3}]}"#;
        let file = parse_batch_bytes(raw.as_bytes(), "x").unwrap();
        let p = plan_batch(&file, None, None).unwrap();
        assert_eq!(p.tasks[0].seed, 4294967295);
        assert_eq!(p.tasks[1].seed, 0);
        assert_eq!(p.tasks[2].seed, 1);
    }

    #[test]
    fn invalid_file_creates_no_plan() {
        let raw =
            r#"{"schemaVersion":1,"songs":[{"id":"a","title":"T","style":"pop","lyrics":""}]}"#;
        let file = parse_batch_bytes(raw.as_bytes(), "x").unwrap();
        let err = plan_batch(&file, None, None).unwrap_err();
        assert!(err.iter().any(|e| e.path.contains("lyrics")));
    }

    #[test]
    fn duplicate_ids_and_unknown_fields_fail() {
        let dup = r#"{"schemaVersion":1,"songs":[{"id":"a","title":"Un titre","style":"pop","lyrics":"[V]\nHi"},{"id":"a","title":"Autre","style":"pop","lyrics":"[V]\nHo"}]}"#;
        let file = parse_batch_bytes(dup.as_bytes(), "x").unwrap();
        assert!(plan_batch(&file, None, None).is_err());
        let unknown = r#"{"schemaVersion":1,"nope":true,"songs":[{"id":"a","title":"Un titre","style":"pop","lyrics":"[V]\nHi"}]}"#;
        assert!(parse_batch_bytes(unknown.as_bytes(), "x").is_err());
    }

    #[test]
    fn duplicate_json_keys_are_rejected() {
        let raw = r#"{"schemaVersion":1,"schemaVersion":2,"songs":[{"id":"a","title":"Un titre","style":"pop","lyrics":"[V]\nHi"}]}"#;
        let err = parse_batch_bytes(raw.as_bytes(), "x").unwrap_err();
        assert!(err[0].message_fr.contains("dupliqu"));
    }

    #[test]
    fn require_requested_blocks_when_capacity_is_one() {
        let raw = r#"{"schemaVersion":1,"maxParallelGenerations":2,"parallelismPolicy":"requireRequested","songs":[{"id":"a","title":"Un titre","style":"pop","lyrics":"[V]\nHi"}]}"#;
        let file = parse_batch_bytes(raw.as_bytes(), "x").unwrap();
        let p = plan_batch(&file, None, None).unwrap();
        assert!(!p.can_launch);
        assert!(p.launch_block_fr.unwrap().contains("1 disponible"));
    }

    #[test]
    fn null_clears_default_language_and_instrumental_allows_empty_lyrics() {
        let raw = r#"{"schemaVersion":1,"defaults":{"singingLanguage":"fr","instrumentalMode":true},"songs":[{"id":"a","title":"Un titre","style":"pop","lyrics":"","singingLanguage":null}]}"#;
        let file = parse_batch_bytes(raw.as_bytes(), "x").unwrap();
        let p = plan_batch(&file, None, None).unwrap();
        assert!(p.tasks[0].singing_language.is_none());
        assert!(p.tasks[0].instrumental_mode);
    }

    #[test]
    fn song_overrides_default_generations() {
        let p = preview_example();
        assert_eq!(
            p.songs
                .iter()
                .find(|s| s.id == "route")
                .unwrap()
                .generations,
            2
        );
        assert_eq!(
            p.songs.iter().find(|s| s.id == "nuit").unwrap().generations,
            3
        );
    }

    #[test]
    fn persist_and_recover_marks_running_tasks_interrupted() {
        let _docs = crate::test_docs_env::guard::TempDocs::new("batch-recover");
        let p = preview_example();
        let id = persist_new_batch(&p, EXAMPLE_JSON, &p.tasks).unwrap();
        let mut running = p.tasks[0].clone();
        running.state = "running".into();
        save_task(&id, &running).unwrap();
        recover_batches().unwrap();
        let snap = batch_snapshot(&id).unwrap();
        assert_eq!(snap["state"], "interrupted");
        let tasks = load_live_tasks(&id).unwrap();
        assert_eq!(
            tasks
                .iter()
                .find(|t| t.task_id == running.task_id)
                .unwrap()
                .state,
            "interrupted"
        );
        assert!(tasks
            .iter()
            .filter(|t| t.task_id != running.task_id)
            .all(|t| t.state == "queued"));
    }

    #[test]
    fn invalid_import_does_not_persist() {
        let _docs = crate::test_docs_env::guard::TempDocs::new("batch-invalid");
        let raw =
            r#"{"schemaVersion":1,"songs":[{"id":"a","title":"T","style":"pop","lyrics":""}]}"#;
        assert!(parse_batch_bytes(raw.as_bytes(), "x").is_ok());
        let file = parse_batch_bytes(raw.as_bytes(), "x").unwrap();
        assert!(plan_batch(&file, None, None).is_err());
        assert!(
            !batches_root().exists() || std::fs::read_dir(batches_root()).unwrap().next().is_none()
        );
    }

    #[test]
    fn concurrent_task_publications_preserve_every_plan_entry() {
        let _docs = crate::test_docs_env::guard::TempDocs::new("batch-concurrent-publish");
        let preview = preview_example();
        let id = persist_new_batch(&preview, EXAMPLE_JSON, &preview.tasks).unwrap();
        std::thread::scope(|scope| {
            for mut task in preview.tasks.clone() {
                let batch_id = &id;
                scope.spawn(move || {
                    task.state = "succeeded".into();
                    save_task(batch_id, &task).unwrap();
                });
            }
        });
        let plan = load_plan(&id).unwrap();
        assert!(plan["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .all(|task| task["state"] == "succeeded"));
    }

    #[test]
    fn stale_completion_cannot_undo_cancellation_or_cancel_a_published_take() {
        let _docs = crate::test_docs_env::guard::TempDocs::new("batch-cancel-publish");
        let preview = preview_example();
        let id = persist_new_batch(&preview, EXAMPLE_JSON, &preview.tasks).unwrap();
        let mut task = preview.tasks[0].clone();
        task.state = "cancel_requested".into();
        save_task(&id, &task).unwrap();
        task.state = "succeeded".into();
        save_task(&id, &task).unwrap();
        assert_eq!(load_live_tasks(&id).unwrap()[0].state, "cancelled");
        task = preview.tasks[1].clone();
        task.state = "succeeded".into();
        save_task(&id, &task).unwrap();
        task.state = "cancel_requested".into();
        save_task(&id, &task).unwrap();
        assert_eq!(load_live_tasks(&id).unwrap()[1].state, "succeeded");
    }
}
