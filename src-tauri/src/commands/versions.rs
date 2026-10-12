use super::shared::write_checksums;
use crate::abc_metadata::{write_aligned_score_abc, AbcAlignRequest};
use crate::hashutil::sha256_file;
use crate::library::{
    library_row_from_project, load_project, project_folder, save_project, upsert_library_row,
};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso, projects_root};
use crate::pins::*;
use serde_json::json;
use std::path::Path;

const GENERATION_WAVEFORM_BUCKETS: usize = 320;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationWaveform {
    peaks: Vec<f32>,
    duration: f64,
}

fn validate_generation_id(gen_id: &str) -> Result<(), String> {
    let suffix = gen_id.strip_prefix("gen-").unwrap_or("");
    if suffix.is_empty() || !suffix.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Identifiant de prise invalide.".into());
    }
    Ok(())
}

fn generation_waveform_from_wav(path: &Path) -> Result<GenerationWaveform, String> {
    let mut reader = hound::WavReader::open(path)
        .map_err(|_| "Le fichier audio de cette prise est illisible.".to_string())?;
    let spec = reader.spec();
    let channels = usize::from(spec.channels);
    let frames = reader.duration() as usize;
    if channels == 0 || spec.sample_rate == 0 || frames == 0 {
        return Err("Le fichier audio de cette prise est vide.".into());
    }
    let expected_samples = frames
        .checked_mul(channels)
        .ok_or_else(|| "Le fichier audio de cette prise est trop volumineux.".to_string())?;
    let int_scale = 2.0_f32.powi(i32::from(spec.bits_per_sample).saturating_sub(1));
    let samples: Box<dyn Iterator<Item = Result<f32, hound::Error>> + '_> = match spec.sample_format
    {
        hound::SampleFormat::Float => Box::new(reader.samples::<f32>()),
        hound::SampleFormat::Int => Box::new(
            reader
                .samples::<i32>()
                .map(move |sample| sample.map(|value| value as f32 / int_scale)),
        ),
    };

    let mut peaks = vec![0.0_f32; GENERATION_WAVEFORM_BUCKETS];
    let mut sample_count = 0_usize;
    for (sample_index, sample) in samples.enumerate() {
        let value =
            sample.map_err(|_| "Le fichier audio de cette prise est incomplet.".to_string())?;
        if !value.is_finite() {
            return Err("Le fichier audio de cette prise contient un échantillon invalide.".into());
        }
        let frame = sample_index / channels;
        let bucket = frame
            .saturating_mul(GENERATION_WAVEFORM_BUCKETS)
            .checked_div(frames)
            .unwrap_or(0)
            .min(GENERATION_WAVEFORM_BUCKETS - 1);
        peaks[bucket] = peaks[bucket].max(value.abs().min(1.0));
        sample_count += 1;
    }
    if sample_count != expected_samples {
        return Err("Le fichier audio de cette prise est incomplet.".into());
    }

    Ok(GenerationWaveform {
        peaks,
        duration: frames as f64 / f64::from(spec.sample_rate),
    })
}

fn generation_waveform_for_project(
    project_id: String,
    gen_id: String,
) -> Result<GenerationWaveform, String> {
    validate_generation_id(&gen_id)?;
    let root = projects_root()
        .canonicalize()
        .map_err(|_| "Dossier des projets introuvable.".to_string())?;
    let folder = project_folder(&project_id)
        .canonicalize()
        .map_err(|_| "Projet introuvable.".to_string())?;
    if !folder.starts_with(&root) {
        return Err("Projet introuvable.".into());
    }
    let project = load_project(&folder)?;
    if project.id != project_id {
        return Err("Projet introuvable.".into());
    }

    let generation_dir = folder.join("generations").join(&gen_id);
    let canonical_generation_dir = generation_dir
        .canonicalize()
        .map_err(|_| "Cette prise n’est pas terminée.".to_string())?;
    if !canonical_generation_dir.starts_with(&folder) {
        return Err("Le chemin de cette prise est invalide.".into());
    }
    let result: serde_json::Value = serde_json::from_slice(
        &std::fs::read(canonical_generation_dir.join("result.json"))
            .map_err(|_| "Cette prise n’est pas terminée.".to_string())?,
    )
    .map_err(|_| "Le résultat de cette prise est illisible.".to_string())?;
    if result["state"] != "generated" || result["audio"]["path"] != "audio.wav" {
        return Err("Cette prise n’a pas de résultat audio utilisable.".into());
    }

    let wav = canonical_generation_dir.join("audio.wav");
    let canonical_wav = wav
        .canonicalize()
        .map_err(|_| "Le fichier audio de cette prise est introuvable.".to_string())?;
    if !canonical_wav.starts_with(&folder) {
        return Err("Le chemin audio de cette prise est invalide.".into());
    }
    generation_waveform_from_wav(&canonical_wav)
}

#[cfg(test)]
mod generation_waveform_tests {
    use super::{generation_waveform_from_wav, validate_generation_id};
    use std::path::PathBuf;

    fn temp_wav_path() -> PathBuf {
        std::env::temp_dir().join(format!("generation-waveform-{}.wav", uuid::Uuid::new_v4()))
    }

    #[test]
    fn streams_stereo_wav_into_bounded_peak_buckets() {
        let path = temp_wav_path();
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 320,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for frame in 0..320 {
            writer
                .write_sample(if frame == 0 { 16_384_i16 } else { 0_i16 })
                .unwrap();
            writer.write_sample(0_i16).unwrap();
        }
        writer.finalize().unwrap();

        let waveform = generation_waveform_from_wav(&path).unwrap();
        assert_eq!(waveform.peaks.len(), 320);
        assert_eq!(waveform.duration, 1.0);
        assert!((waveform.peaks[0] - 0.5).abs() < 0.001);
        assert!(waveform.peaks[1..].iter().all(|peak| *peak == 0.0));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn streams_float_wav_samples_for_generated_ace_audio() {
        let path = temp_wav_path();
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 320,
            bits_per_sample: 32,
            sample_format: hound::SampleFormat::Float,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        for frame in 0..320 {
            writer
                .write_sample(if frame == 0 { 0.25_f32 } else { 0.0_f32 })
                .unwrap();
            writer.write_sample(0.0_f32).unwrap();
        }
        writer.finalize().unwrap();

        let waveform = generation_waveform_from_wav(&path).unwrap();
        assert_eq!(waveform.peaks.len(), 320);
        assert_eq!(waveform.duration, 1.0);
        assert!((waveform.peaks[0] - 0.25).abs() < 0.001);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_incomplete_wav_and_unsafe_generation_ids() {
        let path = temp_wav_path();
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 48_000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&path, spec).unwrap();
        writer.write_sample(0_i16).unwrap();
        writer.write_sample(0_i16).unwrap();
        writer.finalize().unwrap();
        let bytes = std::fs::read(&path).unwrap();
        std::fs::write(&path, &bytes[..bytes.len() - 1]).unwrap();

        assert!(generation_waveform_from_wav(&path).is_err());
        assert!(validate_generation_id("../gen-001").is_err());
        assert!(validate_generation_id("gen-abc").is_err());
        assert!(validate_generation_id("gen-001").is_ok());
        std::fs::remove_file(path).unwrap();
    }
}

/// Calcule une waveform courte depuis le WAV publié, en streaming et hors du thread UI.
#[tauri::command]
pub async fn generation_waveform(id: String, gen_id: String) -> Result<GenerationWaveform, String> {
    tokio::task::spawn_blocking(move || generation_waveform_for_project(id, gen_id))
        .await
        .map_err(|error| format!("Calcul de la waveform interrompu : {error}"))?
}

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
    super::shared::published_generation_wav(&folder, &gen_id)?;
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
