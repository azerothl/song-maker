use crate::audiocpp::AudioCppServer;
use crate::form::{guidance_scale, validate_form, validate_title};
use crate::hashutil::{random_seed, sha256_file};
use crate::library::{
    default_settings, delete_library_row, load_project, load_settings, project_folder, save_project,
    save_settings, upsert_library_row, list_library,
};
use crate::mix::{
    export_flac, new_mix_from_separation, render_mix, wav_duration_ms, write_export_json,
};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso, projects_root};
use crate::pins::*;
use crate::queue::JobQueue;
use crate::resample::resample_soxr;
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct AppState {
    pub server: AudioCppServer,
    pub queue: JobQueue,
    pub undo: Mutex<UndoStacks>,
}

#[derive(Default)]
pub struct UndoStacks {
    /// project_id -> (undo, redo) of MixUpdate / form snapshots as JSON
    pub stacks: BTreeMap<String, (Vec<serde_json::Value>, Vec<serde_json::Value>)>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            server: AudioCppServer::default(),
            queue: JobQueue::default(),
            undo: Mutex::new(UndoStacks::default()),
        }
    }
}

fn push_undo(state: &AppState, project_id: &str, snapshot: serde_json::Value) {
    let mut g = state.undo.lock().unwrap();
    let entry = g.stacks.entry(project_id.to_string()).or_default();
    entry.0.push(snapshot);
    if entry.0.len() > 100 {
        entry.0.remove(0);
    }
    entry.1.clear();
}

#[tauri::command]
pub fn get_health(state: tauri::State<'_, AppState>) -> HealthSnapshot {
    let url = state.server.base_url.lock().ok().map(|u| u.clone());
    crate::health::check_health(url.as_deref())
}

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    load_settings()
}

#[tauri::command]
pub fn update_settings(settings: AppSettings) -> Result<AppSettings, String> {
    save_settings(&settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn confirm_model_pack(pack: String) -> Result<AppSettings, String> {
    let mut s = load_settings().unwrap_or_else(|_| default_settings());
    match pack.as_str() {
        "q8" => {
            s.model_pack = "q8".into();
            s.model_gguf = YUE2_Q8.into();
            s.model_sha256 = YUE2_Q8_SHA.into();
        }
        "q4" => {
            s.model_pack = "q4".into();
            s.model_gguf = YUE2_Q4.into();
            s.model_sha256 = YUE2_Q4_SHA.into();
        }
        _ => return Err("Pack invalide (q8|q4).".into()),
    }
    save_settings(&s)?;
    Ok(s)
}

#[tauri::command]
pub fn list_projects(query: Option<String>) -> Result<Vec<LibraryRow>, String> {
    list_library(query)
}

#[tauri::command]
pub fn create_project(input: CreateProjectInput) -> Result<ProjectDoc, String> {
    validate_title(&input.title).map_err(|e| e.to_string())?;
    ensure_dir(&projects_root()).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let folder = project_folder(&id);
    ensure_dir(&folder).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("generations")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("separations")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("mixes")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("exports")).map_err(|e| e.to_string())?;
    let now = now_iso();
    let doc = ProjectDoc {
        schema: SCHEMA_PROJECT.into(),
        schema_version: SCHEMA_VERSION,
        id: id.clone(),
        title: input.title.trim().to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
        sample_rate: SAMPLE_RATE,
        channels: CHANNELS,
        bit_depth: BIT_DEPTH,
        style: String::new(),
        lyrics: String::new(),
        cot: "full".into(),
        singing_language: None,
        tempo_bpm: None,
        key: None,
        meter: None,
        active_generation_id: None,
        active_separation_id: None,
        active_mix_id: None,
    };
    save_project(&folder, &doc)?;
    upsert_library_row(&LibraryRow {
        id: id.clone(),
        title: doc.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: now.clone(),
        updated_at: now,
        duration_ms: None,
        status: "empty".into(),
        cot: doc.cot.clone(),
        active_generation_id: None,
    })?;
    Ok(doc)
}

#[tauri::command]
pub fn open_project(id: String) -> Result<ProjectDoc, String> {
    load_project(&project_folder(&id))
}

#[tauri::command]
pub fn save_project_form(id: String, form: FormInput) -> Result<ProjectDoc, String> {
    validate_form(&form).map_err(|e| e.to_string())?;
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    doc.title = form.title.trim().to_string();
    doc.style = form.style.trim().to_string();
    doc.lyrics = form.lyrics.clone();
    doc.cot = form.cot.clone();
    doc.singing_language = form.singing_language.filter(|s| !s.trim().is_empty());
    doc.tempo_bpm = form.tempo_bpm;
    doc.key = form.key;
    doc.meter = form.meter;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&LibraryRow {
        id: doc.id.clone(),
        title: doc.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: doc.created_at.clone(),
        updated_at: doc.updated_at.clone(),
        duration_ms: None,
        status: "empty".into(),
        cot: doc.cot.clone(),
        active_generation_id: doc.active_generation_id.clone(),
    })?;
    Ok(doc)
}

#[tauri::command]
pub fn rename_project(id: String, title: String) -> Result<ProjectDoc, String> {
    validate_title(&title).map_err(|e| e.to_string())?;
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    doc.title = title.trim().to_string();
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    let _ = list_library(None);
    upsert_library_row(&LibraryRow {
        id: doc.id.clone(),
        title: doc.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: doc.created_at.clone(),
        updated_at: doc.updated_at.clone(),
        duration_ms: None,
        status: "ready".into(),
        cot: doc.cot.clone(),
        active_generation_id: doc.active_generation_id.clone(),
    })?;
    Ok(doc)
}

#[tauri::command]
pub fn duplicate_project(id: String) -> Result<ProjectDoc, String> {
    let src = project_folder(&id);
    let doc = load_project(&src)?;
    let new_id = Uuid::new_v4().to_string();
    let dst = project_folder(&new_id);
    copy_dir_all(&src, &dst).map_err(|e| e.to_string())?;
    let mut new_doc = doc;
    new_doc.id = new_id.clone();
    new_doc.created_at = now_iso();
    new_doc.updated_at = new_doc.created_at.clone();
    save_project(&dst, &new_doc)?;
    upsert_library_row(&LibraryRow {
        id: new_id,
        title: new_doc.title.clone(),
        folder_path: dst.display().to_string(),
        created_at: new_doc.created_at.clone(),
        updated_at: new_doc.updated_at.clone(),
        duration_ms: None,
        status: "ready".into(),
        cot: new_doc.cot.clone(),
        active_generation_id: new_doc.active_generation_id.clone(),
    })?;
    Ok(new_doc)
}

#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    let folder = project_folder(&id);
    if folder.exists() {
        std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())?;
    }
    delete_library_row(&id)
}

#[tauri::command]
pub fn reveal_project(id: String) -> Result<String, String> {
    let folder = project_folder(&id);
    Ok(folder.display().to_string())
}

#[tauri::command]
pub fn get_job_status(state: tauri::State<'_, AppState>) -> JobStatus {
    state.queue.status()
}

#[tauri::command]
pub fn cancel_job(state: tauri::State<'_, AppState>) -> String {
    state.queue.request_cancel()
}

#[tauri::command]
pub async fn start_generation(
    state: tauri::State<'_, AppState>,
    id: String,
    form: FormInput,
) -> Result<ProjectDoc, String> {
    let style_sent = validate_form(&form).map_err(|e| e.to_string())?;
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    doc.title = form.title.trim().to_string();
    doc.style = form.style.trim().to_string();
    doc.lyrics = form.lyrics.clone();
    doc.cot = form.cot.clone();
    doc.singing_language = form.singing_language.clone();
    doc.tempo_bpm = form.tempo_bpm;
    doc.key = form.key.clone();
    doc.meter = form.meter.clone();
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;

    let settings = load_settings()?;
    let seed = form.seed.unwrap_or_else(random_seed);
    let gen_id = next_folder_id(&folder.join("generations"), "gen-")?;
    let gen_dir = folder.join("generations").join(&gen_id);
    ensure_dir(&gen_dir).map_err(|e| e.to_string())?;

    let lyrics_path = gen_dir.join("lyrics.txt");
    std::fs::write(&lyrics_path, &form.lyrics).map_err(|e| e.to_string())?;

    let (archive, archive_sha) = if cfg!(target_os = "windows") {
        (ARCHIVE_WINDOWS, ARCHIVE_WINDOWS_SHA)
    } else {
        (ARCHIVE_LINUX, ARCHIVE_LINUX_SHA)
    };

    let request = json!({
        "schema": SCHEMA_GEN_REQUEST,
        "schemaVersion": SCHEMA_VERSION,
        "id": gen_id,
        "projectId": id,
        "parentGenerationId": doc.active_generation_id,
        "createdAt": now_iso(),
        "provider": "audiocpp",
        "binary": {
            "tag": AUDIOCPP_TAG,
            "commit": AUDIOCPP_COMMIT,
            "archive": archive,
            "sha256": archive_sha
        },
        "model": {
            "repo": YUE2_REPO,
            "revision": YUE2_REVISION,
            "gguf": settings.model_gguf,
            "sha256": settings.model_sha256,
            "vae": YUE2_VAE,
            "vaeSha256": YUE2_VAE_SHA
        },
        "backend": "cuda",
        "styleSent": style_sent,
        "lyricsPath": "lyrics.txt",
        "cot": form.cot,
        "abcPath": null,
        "seed": seed,
        "numInferenceSteps": NUM_INFERENCE_STEPS,
        "guidanceScale": guidance_scale(&form.cot)
    });
    atomic_write_json(&gen_dir.join("request.json"), &request)?;

    let queue = state.queue.clone();
    let queue_ref = queue.clone();
    let server_url = {
        let s = settings.clone();
        state.server.ensure_started(&s)?
    };

    let out_wav = gen_dir.join("audio.wav");
    let cot = form.cot.clone();
    let lyrics_for_req = form.lyrics.clone();
    let gen_id_for_job = gen_id.clone();
    let gen_dir_for_job = gen_dir.clone();
    let project_id_for_job = id.clone();
    let result = queue
        .run_exclusive(
            Some(id.clone()),
            "Génération en cours",
            async move {
                queue_ref.set_state(
                    "generating",
                    "Génération en cours",
                    Some(project_id_for_job.clone()),
                );
                let body = json!({
                    "model": "yue2",
                    "task": "gen",
                    "options": {
                        "style": style_sent,
                        "lyrics": lyrics_for_req,
                        "cot": cot,
                        "seed": seed,
                        "num_inference_steps": NUM_INFERENCE_STEPS,
                        "guidance_scale": guidance_scale(&cot)
                    },
                    "output": out_wav.display().to_string()
                });
                let started = now_iso();
                let api_result = AudioCppServer::run_task(&server_url, body).await;
                let finished = now_iso();
                if queue_ref.cancel_requested() {
                    let result = json!({
                        "schema": SCHEMA_GEN_RESULT,
                        "schemaVersion": SCHEMA_VERSION,
                        "id": gen_id_for_job,
                        "state": "cancelled",
                        "decode": "unsupported",
                        "startedAt": started,
                        "finishedAt": finished,
                        "audio": null,
                        "score": null,
                        "error": "cancel_requested"
                    });
                    atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                    return Err("cancelled".into());
                }
                match api_result {
                    Ok(_) => {
                        if !out_wav.exists() {
                            return Err("WAV de génération absent après l'appel.".into());
                        }
                        let duration = wav_duration_ms(&out_wav).unwrap_or(0);
                        let audio_sha = sha256_file(&out_wav)?;
                        let score_path = gen_dir_for_job.join("score.abc");
                        let score = if score_path.exists() {
                            json!({
                                "path": "score.abc",
                                "sha256": sha256_file(&score_path)?
                            })
                        } else {
                            json!({ "path": "score.abc", "sha256": null })
                        };
                        let result = json!({
                            "schema": SCHEMA_GEN_RESULT,
                            "schemaVersion": SCHEMA_VERSION,
                            "id": gen_id_for_job,
                            "state": "generated",
                            "decode": "unsupported",
                            "startedAt": started,
                            "finishedAt": finished,
                            "audio": {
                                "path": "audio.wav",
                                "sampleRate": SAMPLE_RATE,
                                "channels": CHANNELS,
                                "durationMs": duration,
                                "sha256": audio_sha
                            },
                            "score": score,
                            "error": null
                        });
                        atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                        write_checksums(&gen_dir_for_job)?;
                        queue_ref.set_state(
                            "generated",
                            "Génération terminée",
                            Some(project_id_for_job.clone()),
                        );
                        Ok(duration)
                    }
                    Err(e) => {
                        let result = json!({
                            "schema": SCHEMA_GEN_RESULT,
                            "schemaVersion": SCHEMA_VERSION,
                            "id": gen_id_for_job,
                            "state": "failed",
                            "decode": "unsupported",
                            "startedAt": started,
                            "finishedAt": finished,
                            "audio": null,
                            "score": null,
                            "error": e
                        });
                        atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                        Err(e)
                    }
                }
            },
        )
        .await;

    let duration = result?;
    doc.active_generation_id = Some(gen_id.clone());
    // Detach separation when new take
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&LibraryRow {
        id: doc.id.clone(),
        title: doc.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: doc.created_at.clone(),
        updated_at: doc.updated_at.clone(),
        duration_ms: Some(duration),
        status: "ready".into(),
        cot: doc.cot.clone(),
        active_generation_id: doc.active_generation_id.clone(),
    })?;
    Ok(doc)
}

#[tauri::command]
pub async fn start_separation(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<MixDoc, String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let gen_id = doc
        .active_generation_id
        .clone()
        .ok_or_else(|| "Aucune génération active.".to_string())?;
    let gen_wav = folder.join("generations").join(&gen_id).join("audio.wav");
    if !gen_wav.exists() {
        return Err("audio.wav de génération manquant.".into());
    }
    let input_sha = sha256_file(&gen_wav)?;
    let sep_id = next_folder_id(&folder.join("separations"), "sep-")?;
    let sep_dir = folder.join("separations").join(&sep_id);
    ensure_dir(&sep_dir).map_err(|e| e.to_string())?;

    let input_44100 = sep_dir.join("input-44100.wav");
    resample_soxr(&gen_wav, &input_44100, SEPARATOR_SAMPLE_RATE)?;

    let settings = load_settings()?;
    let server_url = state.server.ensure_started(&settings)?;
    let queue = state.queue.clone();
    let queue_ref = queue.clone();

    let sep_dir_clone = sep_dir.clone();
    let input_44100_clone = input_44100.clone();
    let project_id_for_job = id.clone();

    queue
        .run_exclusive(
            Some(id.clone()),
            "Séparation en cours",
            async move {
                queue_ref.set_state(
                    "separating",
                    "Séparation en cours",
                    Some(project_id_for_job),
                );
                let body = json!({
                    "model": "htdemucs",
                    "task": "sep",
                    "options": {
                        "audio": input_44100_clone.display().to_string(),
                        "output_dir": sep_dir_clone.display().to_string()
                    }
                });
                AudioCppServer::run_task(&server_url, body).await?;
                Ok(())
            },
        )
        .await?;

    if state.queue.cancel_requested() {
        return Err("Annulation demandée. L’appel GPU déjà lancé va jusqu’au bout ; les fichiers déjà écrits restent.".into());
    }

    state.queue.set_state("importing_tracks", "Import des pistes", Some(id.clone()));

    let stems_44100 = ["vocals", "drums", "bass", "other"];
    let mut stem_meta = Vec::new();
    for role in stems_44100 {
        let raw = find_stem_file(&sep_dir, role)?;
        let dest_44100 = sep_dir.join(format!("{role}-44100.wav"));
        if raw != dest_44100 {
            std::fs::copy(&raw, &dest_44100).map_err(|e| e.to_string())?;
        }
        let dest_48000 = sep_dir.join(format!("{role}-48000.wav"));
        resample_soxr(&dest_44100, &dest_48000, SAMPLE_RATE)?;
        // Ensure stereo without +3 dB: already handled if ffmpeg keeps channels; mono duplicated in mix reader
        let sha = sha256_file(&dest_48000)?;
        let dur = wav_duration_ms(&dest_48000).unwrap_or(0);
        stem_meta.push((
            role.to_string(),
            PathBuf::from(format!("separations/{sep_id}/{role}-48000.wav")),
            sha,
            dur,
        ));
    }

    let sep_json = json!({
        "schema": SCHEMA_SEPARATION,
        "schemaVersion": SCHEMA_VERSION,
        "id": sep_id,
        "generationId": gen_id,
        "provider": "audiocpp",
        "family": "htdemucs",
        "package": HTDEMUCS_PACKAGE,
        "gguf": HTDEMUCS_GGUF,
        "sha256": HTDEMUCS_SHA,
        "inputSha256": input_sha,
        "separatorInput": {
            "path": "input-44100.wav",
            "sampleRate": SEPARATOR_SAMPLE_RATE,
            "resampler": "ffmpeg-soxr-precision-28"
        },
        "stems": stem_meta.iter().map(|(role, path, sha, _)| json!({
            "role": role,
            "path": path.file_name().unwrap().to_string_lossy(),
            "sha256": sha
        })).collect::<Vec<_>>(),
        "warnings": ["estimated-separation"]
    });
    atomic_write_json(&sep_dir.join("separation.json"), &sep_json)?;

    let mix_id = next_folder_id(&folder.join("mixes"), "mix-v")?;
    // next_folder_id uses prefix "mix-v" → mix-v001
    let mix = new_mix_from_separation(&mix_id, &sep_id, &stem_meta);
    atomic_write_json(&folder.join("mixes").join(format!("{mix_id}.json")), &mix)?;

    doc.active_separation_id = Some(sep_id);
    doc.active_mix_id = Some(mix_id);
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    state.queue.set_state("completed", "Terminé", Some(id));
    state.queue.clear_current();
    Ok(mix)
}

#[tauri::command]
pub fn load_mix(id: String) -> Result<Option<MixDoc>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let Some(mix_id) = doc.active_mix_id else {
        return Ok(None);
    };
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::from_str(&text).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn update_mix(
    state: tauri::State<'_, AppState>,
    id: String,
    update: MixUpdate,
) -> Result<MixDoc, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let mix_id = doc
        .active_mix_id
        .ok_or_else(|| "Aucun mix actif.".to_string())?;
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut mix: MixDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    push_undo(&state, &id, serde_json::to_value(&mix).unwrap());
    mix.master_gain_db = update.master_gain_db;
    for t in update.tracks {
        if let Some(track) = mix.tracks.iter_mut().find(|x| x.id == t.id) {
            track.gain_db = t.gain_db;
            track.pan = t.pan.clamp(-1.0, 1.0);
            track.mute = t.mute;
            track.solo = t.solo;
        }
    }
    atomic_write_json(&path, &mix)?;
    // Render preview wav for Web Audio playback
    let preview = folder.join("mixes").join(format!("{mix_id}-preview.wav"));
    let _ = render_mix(&mix, &folder, &preview);
    Ok(mix)
}

#[tauri::command]
pub fn save_mix_version(id: String) -> Result<MixDoc, String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let current_id = doc
        .active_mix_id
        .clone()
        .ok_or_else(|| "Aucun mix actif.".to_string())?;
    let current_path = folder.join("mixes").join(format!("{current_id}.json"));
    let text = std::fs::read_to_string(&current_path).map_err(|e| e.to_string())?;
    let mut mix: MixDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let new_id = next_folder_id(&folder.join("mixes"), "mix-v")?;
    mix.id = new_id.clone();
    atomic_write_json(&folder.join("mixes").join(format!("{new_id}.json")), &mix)?;
    doc.active_mix_id = Some(new_id);
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    Ok(mix)
}

#[tauri::command]
pub fn render_preview(id: String) -> Result<String, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let mix: MixDoc = serde_json::from_str(
            &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let preview = folder.join("mixes").join(format!("{mix_id}-preview.wav"));
        render_mix(&mix, &folder, &preview)?;
        return Ok(preview.display().to_string());
    }
    if let Some(gen_id) = &doc.active_generation_id {
        let wav = folder.join("generations").join(gen_id).join("audio.wav");
        return Ok(wav.display().to_string());
    }
    Err("Aucun audio à lire.".into())
}

#[tauri::command]
pub fn export_audio(id: String, req: ExportRequest) -> Result<String, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let exports = folder.join("exports");
    ensure_dir(&exports).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let format = req.format.to_lowercase();
    if format != "wav" && format != "flac" {
        return Err("Format : wav ou flac uniquement (pas de MP3).".into());
    }

    let wav_out = exports.join(format!("export-{stamp}.wav"));
    let peak_trim = if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let mix: MixDoc = serde_json::from_str(
            &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        render_mix(&mix, &folder, &wav_out)?
    } else if let Some(gen_id) = &doc.active_generation_id {
        let src = folder.join("generations").join(gen_id).join("audio.wav");
        std::fs::copy(&src, &wav_out).map_err(|e| e.to_string())?;
        0.0
    } else {
        return Err("Rien à exporter.".into());
    };

    let final_path = if format == "flac" {
        let flac = exports.join(format!("export-{stamp}.flac"));
        export_flac(&wav_out, &flac)?;
        let _ = std::fs::remove_file(&wav_out);
        flac
    } else {
        wav_out
    };

    if let Some(dest) = req.destination {
        std::fs::copy(&final_path, &dest).map_err(|e| e.to_string())?;
    }
    write_export_json(
        &exports.join(format!("export-{stamp}.json")),
        &format,
        &final_path,
        peak_trim,
    )?;
    Ok(final_path.display().to_string())
}

#[tauri::command]
pub fn list_generations(id: String) -> Result<Vec<GenerationSummary>, String> {
    let folder = project_folder(&id).join("generations");
    if !folder.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&folder)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let req_path = entry.path().join("request.json");
        let res_path = entry.path().join("result.json");
        if !req_path.exists() {
            continue;
        }
        let req: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(req_path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let (state, has_score) = if res_path.exists() {
            let res: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(&res_path).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let st = res
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let score = entry.path().join("score.abc").exists();
            (st, score)
        } else {
            ("unknown".into(), false)
        };
        out.push(GenerationSummary {
            id: req.get("id").and_then(|v| v.as_str()).unwrap_or("").into(),
            created_at: req
                .get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            seed: req.get("seed").and_then(|v| v.as_u64()).unwrap_or(0),
            cot: req
                .get("cot")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            state,
            has_score,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn read_score_abc(id: String, gen_id: String) -> Result<Option<String>, String> {
    let path = project_folder(&id)
        .join("generations")
        .join(gen_id)
        .join("score.abc");
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(
        std::fs::read_to_string(path).map_err(|e| e.to_string())?,
    ))
}

#[tauri::command]
pub fn use_generation(id: String, gen_id: String) -> Result<ProjectDoc, String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let gen_dir = folder.join("generations").join(&gen_id);
    if !gen_dir.exists() {
        return Err("Génération introuvable.".into());
    }
    doc.active_generation_id = Some(gen_id);
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    Ok(doc)
}

#[tauri::command]
pub fn undo_mix(state: tauri::State<'_, AppState>, id: String) -> Result<Option<MixDoc>, String> {
    let mut g = state.undo.lock().unwrap();
    let entry = g.stacks.entry(id.clone()).or_default();
    let Some(prev) = entry.0.pop() else {
        return Ok(None);
    };
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let mix_id = doc
        .active_mix_id
        .ok_or_else(|| "Aucun mix actif.".to_string())?;
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    let current: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    entry.1.push(current);
    atomic_write_json(&path, &prev)?;
    let mix: MixDoc = serde_json::from_value(prev).map_err(|e| e.to_string())?;
    Ok(Some(mix))
}

#[tauri::command]
pub fn redo_mix(state: tauri::State<'_, AppState>, id: String) -> Result<Option<MixDoc>, String> {
    let mut g = state.undo.lock().unwrap();
    let entry = g.stacks.entry(id.clone()).or_default();
    let Some(next) = entry.1.pop() else {
        return Ok(None);
    };
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let mix_id = doc
        .active_mix_id
        .ok_or_else(|| "Aucun mix actif.".to_string())?;
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    let current: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    entry.0.push(current);
    atomic_write_json(&path, &next)?;
    let mix: MixDoc = serde_json::from_value(next).map_err(|e| e.to_string())?;
    Ok(Some(mix))
}

fn write_checksums(dir: &Path) -> Result<(), String> {
    let mut map = BTreeMap::new();
    for entry in walkdir::WalkDir::new(dir).max_depth(1) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "checksums.json" {
                continue;
            }
            map.insert(name, sha256_file(entry.path())?);
        }
    }
    atomic_write_json(&dir.join("checksums.json"), &map)
}

fn find_stem_file(dir: &Path, role: &str) -> Result<PathBuf, String> {
    let role_l = role.to_lowercase();
    for entry in walkdir::WalkDir::new(dir).max_depth(2) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.contains(&role_l) && name.ends_with(".wav") && !name.contains("48000") {
            return Ok(entry.path().to_path_buf());
        }
    }
    Err(format!(
        "Stem inconnu ou manquant après séparation : {role}"
    ))
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    ensure_dir(dst)?;
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            ensure_dir(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                ensure_dir(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}
