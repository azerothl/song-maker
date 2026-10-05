use super::shared::write_checksums;
use crate::abc_metadata::{write_aligned_score_abc, AbcAlignRequest};
use crate::hashutil::sha256_file;
use crate::library::{
    library_row_from_project, load_project, project_folder, save_project, upsert_library_row,
};
use crate::mix::wav_duration_ms;
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
use crate::pins::*;
use serde_json::json;

#[tauri::command]
pub fn use_generation(id: String, gen_id: String) -> Result<ProjectDoc, String> {
    let folder = project_folder(&id);
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
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
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(doc)
}

/// Persist a human-readable take name (Versions tab, #133).
#[tauri::command]
pub fn rename_generation(id: String, gen_id: String, name: String) -> Result<ProjectDoc, String> {
    let folder = project_folder(&id);
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    let mut doc = load_project(&folder)?;
    let gen_dir = folder.join("generations").join(&gen_id);
    if !gen_dir.exists() {
        return Err("Génération introuvable.".into());
    }
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        doc.generation_names.remove(&gen_id);
    } else {
        doc.generation_names.insert(gen_id, trimmed);
    }
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    Ok(doc)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImportPayload {
    pub remote_job_id: String,
    pub audio_base64: String,
    pub audio_sha256: String,
    pub score_abc: Option<String>,
    pub score_sha256: Option<String>,
    pub endpoint_base_url: String,
    pub payload_sha256: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImportResult {
    pub project: ProjectDoc,
    pub generation_id: String,
}

/// Import a remote worker WAV/score into a local gen-* folder with provenance (#65).
#[tauri::command]
pub fn import_remote_generation(
    id: String,
    payload: RemoteImportPayload,
) -> Result<RemoteImportResult, String> {
    use base64::Engine;
    let folder = project_folder(&id);
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    let mut doc = load_project(&folder)?;
    let gens = folder.join("generations");
    ensure_dir(&gens).map_err(|e| e.to_string())?;
    let gen_id = next_folder_id(&gens, "gen-")?;
    let gen_dir = gens.join(&gen_id);
    ensure_dir(&gen_dir).map_err(|e| e.to_string())?;

    let wav_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.audio_base64.as_bytes())
        .map_err(|e| format!("Décodage WAV distant: {e}"))?;
    if wav_bytes.len() < 12 || &wav_bytes[0..4] != b"RIFF" || &wav_bytes[8..12] != b"WAVE" {
        return Err("Artefact distant : octets reçus sans en-tête WAV RIFF/WAVE.".into());
    }
    let out_wav = gen_dir.join("audio.wav");
    std::fs::write(&out_wav, &wav_bytes).map_err(|e| e.to_string())?;
    let audio_sha = sha256_file(&out_wav)?;
    let expected = payload.audio_sha256.trim().to_ascii_lowercase();
    if !expected.is_empty() && expected != audio_sha {
        let _ = std::fs::remove_dir_all(&gen_dir);
        return Err(format!(
            "Checksum audio distant incorrect : attendu {expected}, obtenu {audio_sha}."
        ));
    }

    let score = if let Some(abc) = payload.score_abc.as_ref().filter(|s| !s.trim().is_empty()) {
        let score_path = gen_dir.join("score.abc");
        // Verify remote checksum on the raw bytes first, then align headers (#106).
        std::fs::write(&score_path, abc).map_err(|e| e.to_string())?;
        let raw_sha = sha256_file(&score_path)?;
        if let Some(exp) = payload
            .score_sha256
            .as_ref()
            .filter(|s| !s.trim().is_empty())
        {
            if exp.trim().to_ascii_lowercase() != raw_sha {
                let _ = std::fs::remove_dir_all(&gen_dir);
                return Err(format!(
                    "Checksum score distant incorrect : attendu {}, obtenu {raw_sha}.",
                    exp.trim().to_ascii_lowercase()
                ));
            }
        }
        let align = AbcAlignRequest::from_form(doc.tempo_bpm, doc.key.clone(), doc.meter.clone());
        write_aligned_score_abc(&score_path, abc, &align)?;
        let score_sha = sha256_file(&score_path)?;
        json!({ "path": "score.abc", "sha256": score_sha })
    } else {
        json!({ "path": "score.abc", "sha256": null })
    };

    let duration = wav_duration_ms(&out_wav).unwrap_or(0);
    let finished = now_iso();
    let result = json!({
        "schema": SCHEMA_GEN_RESULT,
        "schemaVersion": SCHEMA_VERSION,
        "id": gen_id,
        "state": "generated",
        "decode": "unsupported",
        "startedAt": finished,
        "finishedAt": finished,
        "audio": {
            "path": "audio.wav",
            "sampleRate": SAMPLE_RATE,
            "channels": CHANNELS,
            "durationMs": duration,
            "sha256": audio_sha
        },
        "score": score,
        "provenance": {
            "source": "remote_worker",
            "remoteJobId": payload.remote_job_id,
            "endpointBaseUrl": payload.endpoint_base_url,
            "payloadSha256": payload.payload_sha256
        },
        "error": null
    });
    atomic_write_json(&gen_dir.join("result.json"), &result)?;
    atomic_write_json(
        &gen_dir.join("job.json"),
        &json!({
            "id": gen_id,
            "projectId": id,
            "kind": "remote_yue2_generate",
            "remoteJobId": payload.remote_job_id,
            "state": "succeeded",
            "updatedAt": finished,
        }),
    )?;
    write_checksums(&gen_dir)?;

    doc.active_generation_id = Some(gen_id.clone());
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = finished;
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(RemoteImportResult {
        project: doc,
        generation_id: gen_id,
    })
}
