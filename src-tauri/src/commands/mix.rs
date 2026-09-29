use super::separation::read_separation_info;
use super::{push_undo, AppState};
use crate::library::{load_project, project_folder, save_project};
use crate::mix::{
    export_flac, export_mp3, render_mix, write_export_json_with_warnings, write_interleaved_f32_wav,
};
use crate::models::*;
use crate::paths::{atomic_write_json, default_cache_dir, ensure_dir, next_folder_id, now_iso};
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn load_mix(id: String) -> Result<Option<MixDoc>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let Some(mix_id) = doc.active_mix_id else {
        return Ok(None);
    };
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(
        serde_json::from_str(&text).map_err(|e| e.to_string())?,
    ))
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
    if let Some(tempo_map) = update.tempo_map {
        for ev in &tempo_map {
            if ev.start_ms < 0 || ev.quarter_bpm == 0 || ev.quarter_bpm > 400 {
                return Err("Tempo map invalide (startMs ≥ 0, BPM 1..400).".into());
            }
        }
        mix.tempo_map = tempo_map;
    }
    if let Some(time_signatures) = update.time_signatures {
        for ev in &time_signatures {
            if ev.start_ms < 0 || ev.numerator == 0 || ev.denominator == 0 {
                return Err("Métrique invalide.".into());
            }
        }
        mix.time_signatures = time_signatures;
    }
    if let Some(markers) = update.markers {
        for mk in &markers {
            if mk.start_ms < 0 || mk.id.trim().is_empty() {
                return Err("Marqueur invalide.".into());
            }
        }
        mix.markers = markers;
    }
    for t in update.tracks {
        if let Some(track) = mix.tracks.iter_mut().find(|x| x.id == t.id) {
            track.gain_db = t.gain_db;
            track.pan = t.pan.clamp(-1.0, 1.0);
            track.mute = t.mute;
            track.solo = t.solo;
            if let Some(clips) = t.clips {
                for clip in &clips {
                    if clip.duration_ms < 0
                        || clip.start_ms < 0
                        || clip.offset_ms < 0
                        || clip.fade_in_ms < 0
                        || clip.fade_out_ms < 0
                    {
                        return Err("Paramètres de clip invalides (valeurs négatives).".into());
                    }
                    if clip.fade_in_ms + clip.fade_out_ms > clip.duration_ms {
                        return Err(format!("Fondus trop longs pour le clip {}.", clip.id));
                    }
                    if clip.time_stretch_ratio <= 0.0
                        || !(0.25..=4.0).contains(&clip.time_stretch_ratio)
                    {
                        return Err(format!(
                            "Ratio d’étirement invalide pour le clip {} (0,25…4).",
                            clip.id
                        ));
                    }
                    if !(-12.0..=12.0).contains(&clip.pitch_semitones) {
                        return Err(format!(
                            "Transposition hors plage pour le clip {} (−12…+12).",
                            clip.id
                        ));
                    }
                }
                track.clips = clips;
            }
        }
    }
    atomic_write_json(&path, &mix)?;
    // La lecture live est Web Audio (stems / prise). Le rendu 24 bits reste pour l’export.
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
    // Prévisualisation = fichier source jouable (prise), pas le mix PCM 24 bits
    // (mal décodé par le WebView). Avec un mix actif, on renvoie quand même la
    // prise pour le repli ; la lecture principale utilise `playback_sources`.
    let source = if let Some(gen_id) = &doc.active_generation_id {
        folder.join("generations").join(gen_id).join("audio.wav")
    } else {
        return Err("Aucun audio à lire.".into());
    };

    if !source.is_file() {
        return Err(format!("Fichier audio manquant : {}", source.display()));
    }

    let playback_dir = default_cache_dir().join("preview");
    ensure_dir(&playback_dir).map_err(|e| e.to_string())?;
    let playback = playback_dir.join("playback.wav");
    let need_copy = match (source.metadata(), playback.metadata()) {
        (Ok(src_meta), Ok(dst_meta)) => {
            src_meta.len() != dst_meta.len()
                || src_meta
                    .modified()
                    .ok()
                    .zip(dst_meta.modified().ok())
                    .map(|(s, d)| s > d)
                    .unwrap_or(true)
        }
        _ => true,
    };
    if need_copy {
        std::fs::copy(&source, &playback).map_err(|e| format!("Préparation lecture audio: {e}"))?;
    }
    Ok(playback.display().to_string())
}

/// Chemins absolus de la prise active et des stems / pistes utilisateur float32 pour Web Audio.
#[tauri::command]
pub fn playback_sources(id: String) -> Result<PlaybackSources, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let gen_id = doc.active_generation_id.clone();
    let gen_wav = gen_id
        .as_ref()
        .map(|gid| folder.join("generations").join(gid).join("audio.wav"));
    let gen_wav_ok = gen_wav.as_ref().is_some_and(|p| p.is_file());

    if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let mix: MixDoc =
            serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let mut stems = Vec::new();
        for track in &mix.tracks {
            let Some(clip) = track.clips.first() else {
                continue;
            };
            if clip.source_path.is_empty() {
                continue;
            }
            let abs = if Path::new(&clip.source_path).is_absolute() {
                PathBuf::from(&clip.source_path)
            } else {
                folder.join(&clip.source_path)
            };
            if !abs.is_file() {
                // AI stems must exist; skip missing user originals that were moved.
                if track.ai_separated {
                    return Err(format!("Stem manquant : {}", abs.display()));
                }
                continue;
            }
            stems.push(PlaybackStem {
                role: track.role.clone(),
                name: track.name.clone(),
                track_id: track.id.clone(),
                path: abs.display().to_string(),
            });
        }
        if !stems.is_empty() {
            let label = match (&gen_id, gen_wav_ok) {
                (Some(gid), true) => format!("{gid} · mix"),
                _ => "Mix (pistes)".into(),
            };
            return Ok(PlaybackSources {
                mode: "stems".into(),
                generation_id: gen_id.clone(),
                generation_wav: if gen_wav_ok {
                    gen_wav.map(|p| p.display().to_string())
                } else {
                    None
                },
                stems,
                label,
            });
        }
        if !gen_wav_ok {
            return Err("Mix actif sans pistes audio lisibles.".into());
        }
    }

    let Some(gid) = gen_id else {
        return Err("Aucun audio à lire.".into());
    };
    let gen_path = folder.join("generations").join(&gid).join("audio.wav");
    if !gen_path.is_file() {
        return Err(format!("Fichier audio manquant : {}", gen_path.display()));
    }
    Ok(PlaybackSources {
        mode: "generation".into(),
        generation_id: Some(gid.clone()),
        generation_wav: Some(gen_path.display().to_string()),
        stems: vec![],
        label: gid,
    })
}

/// Lit les octets du WAV de prévisualisation (repli si le protocole asset échoue).
#[tauri::command]
pub fn read_preview_audio(id: String) -> Result<Vec<u8>, String> {
    let path = render_preview(id)?;
    std::fs::read(&path).map_err(|e| format!("Lecture audio {path}: {e}"))
}

#[tauri::command]
pub fn export_audio(id: String, req: ExportRequest) -> Result<String, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let exports = folder.join("exports");
    ensure_dir(&exports).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let format = req.format.to_lowercase();
    if format != "wav" && format != "flac" && format != "mp3" {
        return Err("Format : wav, flac ou mp3 (livraison).".into());
    }

    let wav_out = exports.join(format!("export-{stamp}.wav"));
    let peak_trim = if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let mix: MixDoc =
            serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
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
    } else if format == "mp3" {
        // WAV/FLAC restent primaires ; MP3 = conversion de livraison.
        let mp3 = exports.join(format!("export-{stamp}.mp3"));
        export_mp3(&wav_out, &mp3)?;
        mp3
    } else {
        wav_out
    };

    if let Some(dest) = req.destination {
        std::fs::copy(&final_path, &dest).map_err(|e| e.to_string())?;
    }
    let warnings = read_separation_info(&folder, &doc)
        .map(|info| info.warnings)
        .unwrap_or_default();
    write_export_json_with_warnings(
        &exports.join(format!("export-{stamp}.json")),
        &format,
        &final_path,
        peak_trim,
        Some("rust-10.5"),
        Some("approximate"),
        &warnings,
    )?;
    Ok(final_path.display().to_string())
}

/// Export a float32 mix baked by `@song-maker/mix-production` (same bake as Web Audio).
#[tauri::command]
pub fn export_pcm_audio(id: String, req: ExportPcmRequest) -> Result<String, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let exports = folder.join("exports");
    ensure_dir(&exports).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let format = req.format.to_lowercase();
    if format != "wav" && format != "flac" && format != "mp3" {
        return Err("Format : wav, flac ou mp3 (livraison).".into());
    }
    if req.channels != 2 {
        return Err("Export PCM : stéréo (2 canaux) requis.".into());
    }

    let safe_stem = req
        .file_stem
        .as_deref()
        .map(|s| {
            let cleaned: String = s
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
                format!("export-{stamp}")
            } else {
                format!("{cleaned}-{stamp}")
            }
        })
        .unwrap_or_else(|| format!("export-{stamp}"));

    let wav_out = exports.join(format!("{safe_stem}.wav"));
    write_interleaved_f32_wav(&req.pcm_le, req.sample_rate, req.channels, &wav_out)?;

    let final_path = if format == "flac" {
        let flac = exports.join(format!("{safe_stem}.flac"));
        export_flac(&wav_out, &flac)?;
        let _ = std::fs::remove_file(&wav_out);
        flac
    } else if format == "mp3" {
        let mp3 = exports.join(format!("{safe_stem}.mp3"));
        export_mp3(&wav_out, &mp3)?;
        mp3
    } else {
        wav_out
    };

    if let Some(dest) = req.destination {
        std::fs::copy(&final_path, &dest).map_err(|e| e.to_string())?;
    }
    let render_path = if req.render_path.is_empty() {
        "mix-production-ts"
    } else {
        &req.render_path
    };
    let match_mode = if req.match_mode.is_empty() {
        "approximate"
    } else {
        &req.match_mode
    };
    let warnings = read_separation_info(&folder, &doc)
        .map(|info| info.warnings)
        .unwrap_or_default();
    write_export_json_with_warnings(
        &exports.join(format!("{safe_stem}.json")),
        &format,
        &final_path,
        req.peak_trim_db,
        Some(render_path),
        Some(match_mode),
        &warnings,
    )?;
    Ok(final_path.display().to_string())
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
    let current: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
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
    let current: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    entry.0.push(current);
    atomic_write_json(&path, &next)?;
    let mix: MixDoc = serde_json::from_value(next).map_err(|e| e.to_string())?;
    Ok(Some(mix))
}
