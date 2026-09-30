use super::separation::read_separation_info;
use super::{push_undo, AppState};
use crate::library::{load_project, project_folder, save_project};
use crate::mix::{
    downsample_wav_bit_depth, export_flac_with_bit_depth, export_mp3_with_bitrate, render_mix,
    write_export_json_with_warnings, write_interleaved_f32_wav,
};
use crate::models::*;
use crate::paths::{
    atomic_write_json, default_cache_dir, ensure_dir, file_mtime_iso, next_folder_id, now_iso,
};
use crate::pins::BIT_DEPTH;
use std::io::Write;
use std::path::{Path, PathBuf};

/// Validate optional pack (`folder` | `zip`). `None` = leave files in project exports only.
fn normalize_export_pack(pack: Option<&str>) -> Result<Option<String>, String> {
    match pack {
        None => Ok(None),
        Some(p) => {
            let p = p.trim().to_lowercase();
            if p != "folder" && p != "zip" {
                return Err("pack : folder ou zip.".into());
            }
            Ok(Some(p))
        }
    }
}

/// Copy or zip export artifacts to a concrete destination (no dialog). Used by pack delivery
/// and unit-tested for folder vs zip (#168).
pub(crate) fn write_export_pack_to_destination(
    pack: &str,
    destination: &Path,
    files: &[(PathBuf, String)],
) -> Result<(), String> {
    if pack == "folder" {
        ensure_dir(destination).map_err(|e| e.to_string())?;
        for (src, name) in files {
            std::fs::copy(src, destination.join(name)).map_err(|e| e.to_string())?;
        }
        Ok(())
    } else if pack == "zip" {
        if let Some(parent) = destination.parent() {
            ensure_dir(parent).map_err(|e| e.to_string())?;
        }
        let file = std::fs::File::create(destination).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (src, name) in files {
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("pack : folder ou zip.".into())
    }
}

/// Honor `req.pack`: dialog (or explicit destination) then folder copy / zip.
/// Returns the user-facing path when delivery ran; `None` if cancelled or pack unset.
fn deliver_export_pack(
    app: &tauri::AppHandle,
    pack: &str,
    destination: Option<String>,
    files: &[(PathBuf, String)],
    default_zip_name: &str,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let dest = if let Some(d) = destination {
        PathBuf::from(d)
    } else if pack == "folder" {
        let Some(picked) = app.dialog().file().blocking_pick_folder() else {
            return Ok(None);
        };
        picked.into_path().map_err(|e| e.to_string())?
    } else {
        let Some(picked) = app
            .dialog()
            .file()
            .set_file_name(default_zip_name)
            .add_filter("Archive ZIP", &["zip"])
            .blocking_save_file()
        else {
            return Ok(None);
        };
        picked.into_path().map_err(|e| e.to_string())?
    };

    write_export_pack_to_destination(pack, &dest, files)?;
    Ok(Some(dest.display().to_string()))
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

/// List mix snapshots for the Versions timeline (#133). Skips the first mix of
/// each separation (covered by the « Pistes séparées » event) so only later
/// saves appear as « Mix modifié ».
#[tauri::command]
pub fn list_mix_versions(id: String) -> Result<Vec<MixVersionSummary>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let mixes_dir = folder.join("mixes");
    if !mixes_dir.is_dir() {
        return Ok(vec![]);
    }
    let active = doc.active_mix_id.as_deref();
    let mut by_sep: std::collections::BTreeMap<String, Vec<(String, String)>> =
        std::collections::BTreeMap::new();
    for entry in std::fs::read_dir(&mixes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let mix_id = value
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if mix_id.is_empty() {
            continue;
        }
        let sep_id = value
            .get("separationId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let created = value
            .get("updatedAt")
            .or_else(|| value.get("createdAt"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| file_mtime_iso(&path))
            .unwrap_or_else(now_iso);
        by_sep.entry(sep_id).or_default().push((mix_id, created));
    }
    let mut out = Vec::new();
    for (sep_id, mut rows) in by_sep {
        rows.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
        for (mix_id, created) in rows.into_iter().skip(1) {
            out.push(MixVersionSummary {
                id: mix_id.clone(),
                separation_id: sep_id.clone(),
                created_at: created,
                is_active: active == Some(mix_id.as_str()),
            });
        }
    }
    out.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(out)
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
pub fn export_audio(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    req: ExportRequest,
) -> Result<String, String> {
    super::with_profile_export_busy(&state, || export_audio_inner(app, id, req))
}

fn export_audio_inner(
    app: tauri::AppHandle,
    id: String,
    req: ExportRequest,
) -> Result<String, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let exports = folder.join("exports");
    ensure_dir(&exports).map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    let format = req.format.to_lowercase();
    if format != "wav" && format != "flac" && format != "mp3" {
        return Err("Format : wav, flac ou mp3 (livraison).".into());
    }
    let pack = normalize_export_pack(req.pack.as_deref())?;

    let bit_depth = req.bit_depth.unwrap_or(BIT_DEPTH);
    let bitrate = req.bitrate_kbps.unwrap_or(320);

    let wav_primary = exports.join(format!("export-{stamp}-master.wav"));
    let peak_trim = if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let mix: MixDoc =
            serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        render_mix(&mix, &folder, &wav_primary)?
    } else if let Some(gen_id) = &doc.active_generation_id {
        let src = folder.join("generations").join(gen_id).join("audio.wav");
        std::fs::copy(&src, &wav_primary).map_err(|e| e.to_string())?;
        0.0
    } else {
        return Err("Rien à exporter.".into());
    };

    let final_path = if format == "flac" {
        let flac = exports.join(format!("export-{stamp}.flac"));
        export_flac_with_bit_depth(&wav_primary, &flac, bit_depth)?;
        let _ = std::fs::remove_file(&wav_primary);
        flac
    } else if format == "mp3" {
        let mp3 = exports.join(format!("export-{stamp}.mp3"));
        export_mp3_with_bitrate(&wav_primary, &mp3, bitrate)?;
        let _ = std::fs::remove_file(&wav_primary);
        mp3
    } else if bit_depth == 16 {
        let wav16 = exports.join(format!("export-{stamp}.wav"));
        downsample_wav_bit_depth(&wav_primary, &wav16, 16)?;
        if wav_primary != wav16 {
            let _ = std::fs::remove_file(&wav_primary);
        }
        wav16
    } else {
        let wav_out = exports.join(format!("export-{stamp}.wav"));
        if wav_primary != wav_out && std::fs::rename(&wav_primary, &wav_out).is_err() {
            std::fs::copy(&wav_primary, &wav_out).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_file(&wav_primary);
        }
        wav_out
    };

    let warnings = read_separation_info(&folder, &doc)
        .map(|info| info.warnings)
        .unwrap_or_default();
    let json_path = exports.join(format!("export-{stamp}.json"));
    write_export_json_with_warnings(
        &json_path,
        &format,
        &final_path,
        peak_trim,
        bit_depth,
        Some("rust-10.5"),
        Some("approximate"),
        &warnings,
    )?;

    let audio_name = final_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("export")
        .to_string();
    let json_name = json_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("export.json")
        .to_string();
    let files = vec![(final_path.clone(), audio_name), (json_path, json_name)];

    if let Some(pack) = pack.as_deref() {
        let zip_name = format!("export-{id}-{stamp}.zip");
        if let Some(delivered) =
            deliver_export_pack(&app, pack, req.destination, &files, &zip_name)?
        {
            return Ok(delivered);
        }
    } else if let Some(dest) = req.destination {
        std::fs::copy(&final_path, &dest).map_err(|e| e.to_string())?;
        return Ok(dest);
    }
    Ok(final_path.display().to_string())
}

/// Export a float32 mix baked by `@song-maker/mix-production` (same bake as Web Audio).
#[tauri::command]
pub fn export_pcm_audio(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    id: String,
    req: ExportPcmRequest,
) -> Result<String, String> {
    super::with_profile_export_busy(&state, || export_pcm_audio_inner(app, id, req))
}

fn export_pcm_audio_inner(
    app: tauri::AppHandle,
    id: String,
    req: ExportPcmRequest,
) -> Result<String, String> {
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
    let pack = normalize_export_pack(req.pack.as_deref())?;

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

    let wav_out = exports.join(format!("{safe_stem}-master.wav"));
    write_interleaved_f32_wav(&req.pcm_le, req.sample_rate, req.channels, &wav_out)?;
    let bit_depth = req.bit_depth.unwrap_or(BIT_DEPTH);
    let bitrate = req.bitrate_kbps.unwrap_or(320);

    let final_path = if format == "flac" {
        let flac = exports.join(format!("{safe_stem}.flac"));
        export_flac_with_bit_depth(&wav_out, &flac, bit_depth)?;
        let _ = std::fs::remove_file(&wav_out);
        flac
    } else if format == "mp3" {
        let mp3 = exports.join(format!("{safe_stem}.mp3"));
        export_mp3_with_bitrate(&wav_out, &mp3, bitrate)?;
        let _ = std::fs::remove_file(&wav_out);
        mp3
    } else if bit_depth == 16 {
        let wav16 = exports.join(format!("{safe_stem}.wav"));
        downsample_wav_bit_depth(&wav_out, &wav16, 16)?;
        if wav_out != wav16 {
            let _ = std::fs::remove_file(&wav_out);
        }
        wav16
    } else {
        let renamed = exports.join(format!("{safe_stem}.wav"));
        if wav_out != renamed && std::fs::rename(&wav_out, &renamed).is_err() {
            std::fs::copy(&wav_out, &renamed).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_file(&wav_out);
        }
        renamed
    };

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
    let json_path = exports.join(format!("{safe_stem}.json"));
    write_export_json_with_warnings(
        &json_path,
        &format,
        &final_path,
        req.peak_trim_db,
        bit_depth,
        Some(render_path),
        Some(match_mode),
        &warnings,
    )?;

    let audio_name = final_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("export")
        .to_string();
    let json_name = json_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("export.json")
        .to_string();
    let files = vec![(final_path.clone(), audio_name), (json_path, json_name)];

    if let Some(pack) = pack.as_deref() {
        let zip_name = format!("{safe_stem}.zip");
        if let Some(delivered) =
            deliver_export_pack(&app, pack, req.destination, &files, &zip_name)?
        {
            return Ok(delivered);
        }
    } else if let Some(dest) = req.destination {
        std::fs::copy(&final_path, &dest).map_err(|e| e.to_string())?;
        return Ok(dest);
    }
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

#[cfg(test)]
mod export_pack_tests {
    use super::{normalize_export_pack, write_export_pack_to_destination};
    use std::io::Read;

    #[test]
    fn normalize_pack_accepts_folder_zip_or_none() {
        assert_eq!(normalize_export_pack(None).unwrap(), None);
        assert_eq!(
            normalize_export_pack(Some("Folder")).unwrap().as_deref(),
            Some("folder")
        );
        assert_eq!(
            normalize_export_pack(Some("ZIP")).unwrap().as_deref(),
            Some("zip")
        );
        assert!(normalize_export_pack(Some("tar")).is_err());
    }

    #[test]
    fn pack_folder_and_zip_write_audio_and_json() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("song-maker-pack-{stamp}"));
        std::fs::create_dir_all(&dir).unwrap();
        let audio = dir.join("master.wav");
        let json = dir.join("master.json");
        std::fs::write(&audio, b"RIFF-fake").unwrap();
        std::fs::write(&json, br#"{"bitDepth":16}"#).unwrap();
        let files = vec![
            (audio.clone(), "master.wav".into()),
            (json.clone(), "master.json".into()),
        ];

        let folder_out = dir.join("out-folder");
        write_export_pack_to_destination("folder", &folder_out, &files).unwrap();
        assert_eq!(
            std::fs::read(folder_out.join("master.wav")).unwrap(),
            b"RIFF-fake"
        );
        assert!(folder_out.join("master.json").is_file());

        let zip_out = dir.join("out.zip");
        write_export_pack_to_destination("zip", &zip_out, &files).unwrap();
        let file = std::fs::File::open(&zip_out).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), 2);
        let mut wav_entry = archive.by_name("master.wav").unwrap();
        let mut buf = Vec::new();
        wav_entry.read_to_end(&mut buf).unwrap();
        assert_eq!(buf, b"RIFF-fake");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
