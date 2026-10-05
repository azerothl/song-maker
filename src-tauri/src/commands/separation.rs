use super::shared::{alias_instrumental_to_other, find_stem_file, normalize_stem_separator};
use super::AppState;
use crate::audiocpp::AudioCppServer;
use crate::hashutil::sha256_file;
use crate::library::{
    library_row_from_project, load_project, load_settings, project_folder, save_project,
    save_settings, upsert_library_row,
};
use crate::mix::{new_mix_from_separation, wav_duration_ms};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
use crate::pins::*;
use crate::resample::resample_soxr;
use serde_json::json;
use std::io::Write;
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
    let sep_started = std::time::Instant::now();
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
    }
    if separator == "mel_band_roformer" {
        let cache = PathBuf::from(&settings.cache_dir);
        if !crate::paths::mel_band_roformer_weights_present(&cache) {
            return Err(format!(
                "Mel-Band RoFormer sélectionné mais le GGUF est absent ou invalide. \
                 Installez-le dans Paramètres → Production audio (téléchargement opt-in \
                 de {MEL_BAND_ROFORMER_REMOTE}, SHA vérifié), ou revenez à HTDemucs."
            ));
        }
        crate::mel_band_roformer::verify_sha256(&cache)?;
    }

    let server = &state.server;
    let runtime_settings = settings.clone();
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
            if matches!(model_id.as_str(), "bs_roformer" | "mel_band_roformer") {
                server.shutdown();
            }
            let server_url = if model_id == "htdemucs_6s" {
                None
            } else {
                Some(server.ensure_started(&runtime_settings)?)
            };
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
        "mel_band_roformer" => (
            "mel_band_roformer",
            MEL_BAND_ROFORMER_PACKAGE,
            MEL_BAND_ROFORMER_GGUF,
            MEL_BAND_ROFORMER_SHA,
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
                "piano-bleed-mask".to_string(),
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

    // Vocal separators write instrumental.wav — alias to other before lookup.
    if separator == "bs_roformer" || separator == "mel_band_roformer" {
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
        "bs_roformer" | "mel_band_roformer" => vec!["drums", "bass", "guitar", "piano"],
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

    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    doc = load_project(&folder)?;
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

    // Record measured wall time for future « mesuré » estimates (#166).
    let wall_ms = sep_started.elapsed().as_millis() as f64;
    let audio_sec = stem_meta
        .iter()
        .map(|(_, _, _, dur)| *dur)
        .max()
        .unwrap_or(0) as f64
        / 1000.0;
    if audio_sec > 0.5 && wall_ms > 0.0 {
        if let Ok(_configuration) = super::settings::try_model_change(&state) {
            if let Ok(mut next_settings) = load_settings() {
                let sample = wall_ms / audio_sec;
                let entry = next_settings
                    .separator_time_stats
                    .entry(separator.to_string())
                    .or_insert_with(|| crate::models::SeparatorTimeStat {
                        ms_per_audio_sec: sample,
                        samples: 0,
                    });
                if entry.samples == 0 {
                    entry.ms_per_audio_sec = sample;
                    entry.samples = 1;
                } else {
                    let n = entry.samples + 1;
                    entry.ms_per_audio_sec =
                        (entry.ms_per_audio_sec * f64::from(entry.samples) + sample) / f64::from(n);
                    entry.samples = n;
                }
                let _ = save_settings(&next_settings);
            }
        }
    }

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

pub(crate) fn find_mix_id_for_separation(folder: &Path, separation_id: &str) -> Option<String> {
    let mixes_dir = folder.join("mixes");
    if !mixes_dir.is_dir() {
        return None;
    }
    for entry in std::fs::read_dir(&mixes_dir).ok()? {
        let path = entry.ok()?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(&path).ok()?;
        let mix: MixDoc = serde_json::from_str(&text).ok()?;
        if mix.separation_id == separation_id {
            return Some(mix.id);
        }
    }
    None
}

pub(crate) fn list_separation_versions(
    folder: &Path,
    doc: &ProjectDoc,
) -> Vec<SeparationVersionSummary> {
    let separations_dir = folder.join("separations");
    if !separations_dir.is_dir() {
        return Vec::new();
    }
    let active = doc.active_separation_id.as_deref();
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(&separations_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        if !entry.path().is_dir() {
            continue;
        }
        let sep_id = entry.file_name().to_string_lossy().to_string();
        let manifest = entry.path().join("separation.json");
        if !manifest.is_file() {
            continue;
        }
        let mix_id = find_mix_id_for_separation(folder, &sep_id).unwrap_or_default();
        let generation_id = std::fs::read_to_string(entry.path().join("job.json"))
            .ok()
            .and_then(|text| {
                serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| {
                        v.get("generationId")
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string())
                    })
            });
        let created_at = std::fs::read_to_string(&manifest)
            .ok()
            .and_then(|text| {
                serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| {
                        v.get("updatedAt")
                            .or_else(|| v.get("createdAt"))
                            .and_then(|x| x.as_str())
                            .map(|s| s.to_string())
                    })
            })
            .unwrap_or_else(now_iso);
        let is_active = active == Some(sep_id.as_str());
        out.push(SeparationVersionSummary {
            separation_id: sep_id,
            mix_id,
            created_at,
            is_active,
            generation_id,
        });
    }
    out.sort_by(|a, b| a.separation_id.cmp(&b.separation_id));
    out
}

#[tauri::command]
pub fn list_separation_versions_cmd(id: String) -> Result<Vec<SeparationVersionSummary>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    Ok(list_separation_versions(&folder, &doc))
}

#[tauri::command]
pub fn activate_separation_version(id: String, separation_id: String) -> Result<MixDoc, String> {
    let folder = project_folder(&id);
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    let mut doc = load_project(&folder)?;
    let sep_dir = folder.join("separations").join(&separation_id);
    if !sep_dir.join("separation.json").is_file() {
        return Err(format!("Séparation introuvable : {separation_id}"));
    }
    let mix_id = find_mix_id_for_separation(&folder, &separation_id)
        .ok_or_else(|| format!("Mix associé introuvable pour {separation_id}"))?;
    let mix_path = folder.join("mixes").join(format!("{mix_id}.json"));
    if !mix_path.is_file() {
        return Err(format!("Fichier mix manquant : {mix_id}"));
    }
    doc.active_separation_id = Some(separation_id);
    doc.active_mix_id = Some(mix_id);
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    let mix: MixDoc =
        serde_json::from_str(&std::fs::read_to_string(&mix_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    Ok(mix)
}

fn safe_export_stem_name(role: &str, display: &str) -> String {
    let base = format!("{role}_{display}");
    let cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        role.to_string()
    } else {
        cleaned
    }
}

#[tauri::command]
pub async fn export_separation_stems(
    app: tauri::AppHandle,
    id: String,
    req: ExportSeparationStemsRequest,
) -> Result<Option<String>, String> {
    let pack = req.pack.to_lowercase();
    if pack != "folder" && pack != "zip" {
        return Err("pack : folder ou zip.".into());
    }
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let mix_id = doc
        .active_mix_id
        .as_deref()
        .ok_or_else(|| "Aucun mix actif.".to_string())?;
    let mix_path = folder.join("mixes").join(format!("{mix_id}.json"));
    let mix: MixDoc =
        serde_json::from_str(&std::fs::read_to_string(&mix_path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let selected: std::collections::HashSet<&str> =
        req.track_ids.iter().map(String::as_str).collect();
    let mut files: Vec<(PathBuf, String)> = Vec::new();
    for track in &mix.tracks {
        if !selected.is_empty() && !selected.contains(track.id.as_str()) {
            continue;
        }
        if !track.ai_separated {
            continue;
        }
        let clip = track
            .clips
            .first()
            .ok_or_else(|| format!("Piste sans source : {}", track.name))?;
        let abs = if Path::new(&clip.source_path).is_absolute() {
            PathBuf::from(&clip.source_path)
        } else {
            folder.join(&clip.source_path)
        };
        if !abs.is_file() {
            return Err(format!("Fichier stem manquant : {}", abs.display()));
        }
        let name = format!("{}.wav", safe_export_stem_name(&track.role, &track.name));
        files.push((abs, name));
    }
    if files.is_empty() {
        return Err("Aucune piste IA sélectionnée à exporter.".into());
    }

    let destination = if let Some(dest) = req.destination {
        PathBuf::from(dest)
    } else {
        use tauri_plugin_dialog::DialogExt;
        if pack == "folder" {
            let Some(picked) = app.dialog().file().blocking_pick_folder() else {
                return Ok(None);
            };
            picked.into_path().map_err(|e| e.to_string())?
        } else {
            let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
            let default_name = format!("pistes-{id}-{stamp}.zip");
            let Some(picked) = app
                .dialog()
                .file()
                .set_file_name(&default_name)
                .add_filter("Archive ZIP", &["zip"])
                .blocking_save_file()
            else {
                return Ok(None);
            };
            picked.into_path().map_err(|e| e.to_string())?
        }
    };

    tokio::task::spawn_blocking(move || {
        if pack == "folder" {
            ensure_dir(&destination).map_err(|e| e.to_string())?;
            for (src, name) in &files {
                let dest = destination.join(name);
                std::fs::copy(src, &dest).map_err(|e| e.to_string())?;
            }
            Ok(Some(destination.display().to_string()))
        } else {
            let file = std::fs::File::create(&destination).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated);
            for (src, name) in &files {
                zip.start_file(name, options).map_err(|e| e.to_string())?;
                let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
                zip.write_all(&bytes).map_err(|e| e.to_string())?;
            }
            zip.finish().map_err(|e| e.to_string())?;
            Ok(Some(destination.display().to_string()))
        }
    })
    .await
    .map_err(|e| format!("Export interrompu : {e}"))?
}

#[cfg(test)]
mod separation_version_tests {
    use super::*;
    use crate::mix::new_mix_from_separation;
    use crate::paths::{atomic_write_json, ensure_dir};
    use crate::pins::{SCHEMA_PROJECT, SCHEMA_VERSION};

    #[test]
    fn find_mix_id_for_separation_matches_mix_doc() {
        let root =
            std::env::temp_dir().join(format!("song-maker-sep-test-{}", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_dir_all(&root);
        ensure_dir(&root.join("mixes")).unwrap();
        let mix = new_mix_from_separation(
            "mix-v001",
            "sep-001",
            &[(
                "vocals".into(),
                PathBuf::from("separations/sep-001/vocals-48000.wav"),
                "abc".into(),
                1000,
            )],
        );
        atomic_write_json(&root.join("mixes/mix-v001.json"), &mix).unwrap();
        assert_eq!(
            find_mix_id_for_separation(&root, "sep-001").as_deref(),
            Some("mix-v001")
        );
    }

    #[test]
    fn list_separation_versions_marks_active() {
        let root =
            std::env::temp_dir().join(format!("song-maker-sep-list-{}", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_dir_all(&root);
        let sep_dir = root.join("separations/sep-002");
        ensure_dir(&sep_dir).unwrap();
        atomic_write_json(
            &sep_dir.join("separation.json"),
            &json!({ "id": "sep-002", "updatedAt": "2026-01-01T00:00:00Z" }),
        )
        .unwrap();
        ensure_dir(&root.join("mixes")).unwrap();
        let mix = new_mix_from_separation("mix-v002", "sep-002", &[]);
        atomic_write_json(&root.join("mixes/mix-v002.json"), &mix).unwrap();
        let doc = ProjectDoc {
            schema: SCHEMA_PROJECT.into(),
            schema_version: SCHEMA_VERSION,
            id: "p1".into(),
            title: "t".into(),
            created_at: now_iso(),
            updated_at: now_iso(),
            sample_rate: 48_000,
            channels: 2,
            bit_depth: 24,
            style: "pop".into(),
            lyrics: "".into(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: false,
            active_generation_id: None,
            active_separation_id: Some("sep-002".into()),
            active_mix_id: Some("mix-v002".into()),
            active_score_id: None,
            generation_names: Default::default(),
        };
        let list = list_separation_versions(&root, &doc);
        assert_eq!(list.len(), 1);
        assert!(list[0].is_active);
        assert_eq!(list[0].mix_id, "mix-v002");
    }
}
