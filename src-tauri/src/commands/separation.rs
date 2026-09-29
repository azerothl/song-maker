use super::shared::{alias_instrumental_to_other, find_stem_file, normalize_stem_separator};
use super::AppState;
use crate::audiocpp::AudioCppServer;
use crate::hashutil::sha256_file;
use crate::library::{
    library_row_from_project, load_project, load_settings, project_folder, save_project,
    upsert_library_row,
};
use crate::mix::{new_mix_from_separation, wav_duration_ms};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
use crate::pins::*;
use crate::resample::resample_soxr;
use serde_json::json;
use std::path::{Path, PathBuf};

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
    atomic_write_json(
        &sep_dir.join("job.json"),
        &json!({
            "id": sep_id,
            "projectId": id,
            "kind": "separation",
            "generationId": gen_id,
            "state": "preparing",
            "updatedAt": now_iso(),
        }),
    )?;

    let input_44100 = sep_dir.join("input-44100.wav");
    resample_soxr(&gen_wav, &input_44100, SEPARATOR_SAMPLE_RATE)?;

    let settings = load_settings()?;
    let separator = normalize_stem_separator(&settings.stem_separator);
    if separator == "bs_roformer" {
        let cache = PathBuf::from(&settings.cache_dir);
        if !crate::paths::bs_roformer_weights_present(&cache) {
            return Err(format!(
                "BS-RoFormer sélectionné mais le GGUF est absent ou invalide. \
                 Installez-le dans Paramètres → Production audio (téléchargement opt-in \
                 de {BS_ROFORMER_REMOTE}, SHA vérifié), ou revenez à HTDemucs."
            ));
        }
        // Full SHA check before real separation — no fake success on corrupt weights.
        crate::bs_roformer::verify_sha256(&cache)?;
        // Reload server config so bs_roformer is registered.
        state.server.shutdown();
    }

    let server_url = if separator == "htdemucs_6s" {
        None
    } else {
        Some(state.server.ensure_started(&settings)?)
    };
    let queue = state.queue.clone();
    let queue_ref = queue.clone();

    let sep_dir_clone = sep_dir.clone();
    let input_44100_clone = input_44100.clone();
    let project_id_for_job = id.clone();
    let sep_id_for_job = sep_id.clone();
    let generation_id_for_job = gen_id.clone();
    let model_id = separator.to_string();
    let cache_dir = PathBuf::from(&settings.cache_dir);
    atomic_write_json(
        &sep_dir.join("job.json"),
        &json!({
            "id": sep_id,
            "projectId": id,
            "kind": "separation",
            "generationId": gen_id,
            "state": "queued",
            "updatedAt": now_iso(),
        }),
    )?;

    let separator_result = queue
        .run_exclusive(Some(id.clone()), "Séparation en cours", async move {
            atomic_write_json(
                &sep_dir_clone.join("job.json"),
                &json!({
                    "id": sep_id_for_job,
                    "projectId": project_id_for_job.clone(),
                    "kind": "separation",
                    "generationId": generation_id_for_job,
                    "state": "running",
                    "updatedAt": now_iso(),
                }),
            )?;
            queue_ref.set_state(
                "separating",
                "Séparation en cours",
                Some(project_id_for_job.clone()),
            );
            if model_id == "htdemucs_6s" {
                crate::demucs_onnx::separate(cache_dir, input_44100_clone, sep_dir_clone).await?;
            } else {
                // Contrat audiocpp_server /v1/tasks/run : champ `request` avec
                // audio = chemin WAV 44,1 kHz, réponses base64 nommées.
                let body = json!({
                    "model": model_id,
                    "request": {
                        "audio": input_44100_clone.display().to_string()
                    }
                });
                let response = AudioCppServer::run_task(
                    server_url.as_deref().ok_or("Serveur audio indisponible.")?,
                    body,
                )
                .await?;
                AudioCppServer::write_named_audio_outputs(&response, &sep_dir_clone)?;
            }
            Ok(())
        })
        .await;
    if let Err(error) = separator_result {
        atomic_write_json(
            &sep_dir.join("job.json"),
            &json!({
                "id": sep_id,
                "projectId": id,
                "kind": "separation",
                "generationId": gen_id,
                "state": if error == "cancelled" { "cancelled" } else { "failed" },
                "error": error,
                "updatedAt": now_iso(),
            }),
        )?;
        return Err(error);
    }

    if state.queue.cancel_requested() {
        atomic_write_json(
            &sep_dir.join("job.json"),
            &json!({
                "id": sep_id,
                "projectId": id,
                "kind": "separation",
                "generationId": gen_id,
                "state": "cancelled",
                "updatedAt": now_iso(),
            }),
        )?;
        return Err("Annulation demandée. L’appel GPU déjà lancé va jusqu’au bout ; les fichiers déjà écrits restent.".into());
    }

    state
        .queue
        .set_state("importing_tracks", "Import des pistes", Some(id.clone()));

    let (family, package, gguf, sha, roles, warnings) = match separator {
        "bs_roformer" => (
            "bs_roformer",
            BS_ROFORMER_PACKAGE,
            BS_ROFORMER_GGUF,
            BS_ROFORMER_SHA,
            &["vocals", "other"][..],
            vec![
                "estimated-separation".to_string(),
                "bs-roformer-vocals-instrumental-only".to_string(),
                "drums-bass-guitar-piano-unavailable".to_string(),
            ],
        ),
        "htdemucs_6s" => (
            "htdemucs_6s_onnx",
            "htdemucs_6s_fp16weights",
            "htdemucs_6s_fp16weights.onnx",
            crate::demucs_onnx::MODEL_SHA256,
            &["vocals", "drums", "bass", "other", "guitar", "piano"][..],
            vec![
                "estimated-separation".to_string(),
                "experimental-guitar-piano".to_string(),
                "piano-less-reliable".to_string(),
            ],
        ),
        _ => (
            "htdemucs",
            HTDEMUCS_PACKAGE,
            HTDEMUCS_GGUF,
            HTDEMUCS_SHA,
            &["vocals", "drums", "bass", "other"][..],
            vec![
                "estimated-separation".to_string(),
                "guitar-piano-unavailable".to_string(),
            ],
        ),
    };

    // BS-RoFormer writes instrumental.wav — alias to other before lookup.
    if separator == "bs_roformer" {
        alias_instrumental_to_other(&sep_dir)?;
    }

    let mut stem_meta = Vec::new();
    for role in roles {
        let raw = find_stem_file(&sep_dir, role)?;
        let dest_44100 = sep_dir.join(format!("{role}-44100.wav"));
        if raw != dest_44100 {
            std::fs::copy(&raw, &dest_44100).map_err(|e| e.to_string())?;
        }
        let dest_48000 = sep_dir.join(format!("{role}-48000.wav"));
        resample_soxr(&dest_44100, &dest_48000, SAMPLE_RATE)?;
        let sha_stem = sha256_file(&dest_48000)?;
        let dur = wav_duration_ms(&dest_48000).unwrap_or(0);
        stem_meta.push((
            role.to_string(),
            PathBuf::from(format!("separations/{sep_id}/{role}-48000.wav")),
            sha_stem,
            dur,
        ));
    }

    let unavailable: Vec<&str> = match separator {
        "bs_roformer" => vec!["drums", "bass", "guitar", "piano"],
        "htdemucs_6s" => vec![],
        _ => vec!["guitar", "piano"],
    };

    let sep_json = json!({
        "schema": SCHEMA_SEPARATION,
        "schemaVersion": SCHEMA_VERSION,
        "id": sep_id,
        "generationId": gen_id,
        "provider": if separator == "htdemucs_6s" { "demucs-onnx" } else { "audiocpp" },
        "family": family,
        "package": package,
        "gguf": if separator == "htdemucs_6s" { serde_json::Value::Null } else { json!(gguf) },
        "modelArtifact": if separator == "htdemucs_6s" { json!(gguf) } else { serde_json::Value::Null },
        "modelFormat": if separator == "htdemucs_6s" { "onnx" } else { "gguf" },
        "sha256": sha,
        "modelRevision": if separator == "htdemucs_6s" { json!(crate::demucs_onnx::MODEL_REVISION) } else { serde_json::Value::Null },
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
        "unavailableRoles": unavailable,
        "warnings": warnings
    });
    atomic_write_json(&sep_dir.join("separation.json"), &sep_json)?;
    atomic_write_json(
        &sep_dir.join("job.json"),
        &json!({
            "id": sep_id,
            "projectId": id,
            "kind": "separation",
            "generationId": gen_id,
            "state": "completed",
            "updatedAt": now_iso(),
        }),
    )?;

    let mix_id = next_folder_id(&folder.join("mixes"), "mix-v")?;
    let mut mix = new_mix_from_separation(&mix_id, &sep_id, &stem_meta);
    // Carry over user/custom tracks from the previous active mix (import/record).
    if let Some(prev_id) = &doc.active_mix_id {
        let prev_path = folder.join("mixes").join(format!("{prev_id}.json"));
        if let Ok(text) = std::fs::read_to_string(&prev_path) {
            if let Ok(prev) = serde_json::from_str::<MixDoc>(&text) {
                for track in prev.tracks {
                    if !track.ai_separated {
                        mix.tracks.push(track);
                    }
                }
            }
        }
    }
    atomic_write_json(&folder.join("mixes").join(format!("{mix_id}.json")), &mix)?;

    doc.active_separation_id = Some(sep_id);
    doc.active_mix_id = Some(mix_id);
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    state.queue.set_state("completed", "Terminé", Some(id));
    state.queue.clear_current();
    Ok(mix)
}

#[tauri::command]
pub fn load_separation_info(id: String) -> Result<Option<SeparationInfo>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    Ok(read_separation_info(&folder, &doc))
}

pub(crate) fn read_separation_info(folder: &Path, doc: &ProjectDoc) -> Option<SeparationInfo> {
    let sep_id = doc.active_separation_id.as_deref()?;
    let path = folder
        .join("separations")
        .join(sep_id)
        .join("separation.json");
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    let warnings = value
        .get("warnings")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let family = value
        .get("family")
        .and_then(|v| v.as_str())
        .unwrap_or("htdemucs")
        .to_string();
    Some(SeparationInfo {
        id: sep_id.to_string(),
        family,
        warnings,
    })
}
