use super::shared::write_checksums;
use crate::abc_metadata::{write_aligned_score_abc, AbcAlignRequest};
use crate::hashutil::sha256_file;
use crate::library::{
    library_row_from_project, load_project, project_folder, save_project, upsert_library_row,
};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
use crate::pins::*;
use serde_json::json;

fn remote_wav_metadata(bytes: &[u8]) -> Result<(i64, hound::WavSpec), String> {
    let mut reader = hound::WavReader::new(std::io::Cursor::new(bytes)).map_err(|_| {
        "Le fichier audio distant est illisible. Cette prise n’est pas importée.".to_string()
    })?;
    let spec = reader.spec();
    if spec.sample_rate == 0 || spec.channels == 0 || reader.duration() == 0 {
        return Err(
            "Le fichier audio distant est vide ou invalide. Cette prise n’est pas importée.".into(),
        );
    }
    let duration_ms = i64::from(reader.duration()) * 1000 / i64::from(spec.sample_rate);
    if duration_ms <= 0 {
        return Err(
            "Le fichier audio distant est trop court. Cette prise n’est pas importée.".into(),
        );
    }
    let expected = reader.len();
    let decoded = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .try_fold(0u32, |count, sample| sample.map(|_| count + 1)),
        hound::SampleFormat::Int => reader
            .samples::<i32>()
            .try_fold(0u32, |count, sample| sample.map(|_| count + 1)),
    }
    .map_err(|_| {
        "Le fichier audio distant est incomplet. Cette prise n’est pas importée.".to_string()
    })?;
    if decoded != expected {
        return Err(
            "Le fichier audio distant est incomplet. Cette prise n’est pas importée.".into(),
        );
    }
    Ok((duration_ms, spec))
}

#[cfg(test)]
mod remote_audio_tests {
    use super::remote_wav_metadata;

    #[test]
    fn measures_actual_mono_rate_and_refuses_truncated_samples() {
        let mut bytes = Vec::new();
        {
            let spec = hound::WavSpec {
                channels: 1,
                sample_rate: 22050,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let mut writer = hound::WavWriter::new(std::io::Cursor::new(&mut bytes), spec).unwrap();
            for _ in 0..22050 {
                writer.write_sample(0i16).unwrap();
            }
            writer.finalize().unwrap();
        }
        let (duration, spec) = remote_wav_metadata(&bytes).unwrap();
        assert_eq!(duration, 1000);
        assert_eq!(spec.sample_rate, 22050);
        assert_eq!(spec.channels, 1);
        assert!(remote_wav_metadata(&bytes[..bytes.len() - 4]).is_err());
        assert!(remote_wav_metadata(b"RIFFxxxxWAVE").is_err());
    }
}

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
    let wav_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.audio_base64.as_bytes())
        .map_err(|e| format!("Décodage WAV distant: {e}"))?;
    if wav_bytes.len() < 12 || &wav_bytes[0..4] != b"RIFF" || &wav_bytes[8..12] != b"WAVE" {
        return Err("Artefact distant : octets reçus sans en-tête WAV RIFF/WAVE.".into());
    }
    let (duration, audio_spec) = remote_wav_metadata(&wav_bytes)?;
    let gens = folder.join("generations");
    ensure_dir(&gens).map_err(|e| e.to_string())?;
    let gen_id = next_folder_id(&gens, "gen-")?;
    let gen_dir = gens.join(&gen_id);
    ensure_dir(&gen_dir).map_err(|e| e.to_string())?;
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
        serde_json::Value::Null
    };

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
            "sampleRate": audio_spec.sample_rate,
            "channels": audio_spec.channels,
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
