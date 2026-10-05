use crate::hashutil::sha256_file;
use crate::library::{
    library_row_from_project, load_project, project_folder, save_project, upsert_library_row,
};
use crate::mix::{append_user_audio_takes, append_user_audio_track, empty_mix, wav_duration_ms};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
use crate::resample::normalize_user_audio;
use serde_json::json;
use std::path::{Path, PathBuf};
use uuid::Uuid;

const USER_AUDIO_EXTS: &[&str] = &["wav", "mp3", "flac"];

fn user_audio_ext_ok(path: &Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if USER_AUDIO_EXTS.contains(&ext.as_str()) {
        return Ok(ext);
    }
    Err(format!(
        "Format non pris en charge{}. Formats acceptés : WAV, MP3, FLAC.",
        if ext.is_empty() {
            String::new()
        } else {
            format!(" (.{ext})")
        }
    ))
}

pub(crate) fn user_audio_root(folder: &Path) -> PathBuf {
    folder.join("user-audio")
}

pub(crate) fn ensure_user_audio_dirs(folder: &Path) -> Result<(), String> {
    let root = user_audio_root(folder);
    ensure_dir(&root).map_err(|e| e.to_string())?;
    ensure_dir(&root.join("originals")).map_err(|e| e.to_string())?;
    ensure_dir(&root.join("normalized")).map_err(|e| e.to_string())?;
    ensure_dir(&root.join("capture")).map_err(|e| e.to_string())?;
    ensure_dir(&root.join("provenance")).map_err(|e| e.to_string())?;
    Ok(())
}

fn load_or_create_active_mix(
    folder: &Path,
    doc: &mut ProjectDoc,
) -> Result<(MixDoc, PathBuf), String> {
    if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mix: MixDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
        return Ok((mix, path));
    }
    ensure_dir(&folder.join("mixes")).map_err(|e| e.to_string())?;
    let mix_id = next_folder_id(&folder.join("mixes"), "mix-v")?;
    let mix = empty_mix(&mix_id);
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    atomic_write_json(&path, &mix)?;
    doc.active_mix_id = Some(mix_id);
    doc.updated_at = now_iso();
    save_project(folder, doc)?;
    upsert_library_row(&library_row_from_project(folder, doc))?;
    Ok((mix, path))
}

/// Copy (optional) + normalize user audio into project dirs. Does not touch the mix.
struct IngestedUserAudio {
    asset_id: String,
    normalized_rel: String,
    sha: String,
    duration_ms: i64,
    original_rel: Option<String>,
}

fn prepare_user_audio_asset(
    folder: &Path,
    source: &Path,
    display_name: &str,
    copy_original: bool,
    original_ext: Option<&str>,
) -> Result<IngestedUserAudio, String> {
    ensure_user_audio_dirs(folder)?;
    if !source.is_file() {
        return Err(format!("Chemin audio invalide : {}", source.display()));
    }
    let meta = std::fs::metadata(source).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        return Err("Fichier audio vide — import impossible.".into());
    }

    let asset_id = Uuid::new_v4().to_string();
    let root = user_audio_root(folder);
    let mut original_rel: Option<String> = None;
    let mut copied_original: Option<PathBuf> = None;

    if copy_original {
        let ext = original_ext
            .map(|e| e.to_string())
            .or_else(|| {
                source
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_ascii_lowercase())
            })
            .unwrap_or_else(|| "bin".into());
        let dest = root.join("originals").join(format!("{asset_id}.{ext}"));
        std::fs::copy(source, &dest)
            .map_err(|e| format!("Impossible de copier l’original dans le projet : {e}"))?;
        original_rel = Some(format!("user-audio/originals/{asset_id}.{ext}"));
        copied_original = Some(dest);
    }

    let normalized_rel = format!("user-audio/normalized/{asset_id}.wav");
    let normalized_abs = folder.join(&normalized_rel);
    let normalize_src = copied_original.as_deref().unwrap_or(source);

    if let Err(e) = normalize_user_audio(normalize_src, &normalized_abs) {
        if let Some(p) = &copied_original {
            let _ = std::fs::remove_file(p);
        }
        let _ = std::fs::remove_file(&normalized_abs);
        return Err(e);
    }

    let sha = match sha256_file(&normalized_abs) {
        Ok(s) => s,
        Err(e) => {
            let _ = std::fs::remove_file(&normalized_abs);
            if let Some(p) = &copied_original {
                let _ = std::fs::remove_file(p);
            }
            return Err(e);
        }
    };
    let duration_ms = match wav_duration_ms(&normalized_abs) {
        Ok(d) if d > 0 => d,
        Ok(_) => {
            let _ = std::fs::remove_file(&normalized_abs);
            if let Some(p) = &copied_original {
                let _ = std::fs::remove_file(p);
            }
            return Err("Durée nulle après normalisation — fichier rejeté.".into());
        }
        Err(e) => {
            let _ = std::fs::remove_file(&normalized_abs);
            if let Some(p) = &copied_original {
                let _ = std::fs::remove_file(p);
            }
            return Err(format!("Lecture durée impossible : {e}"));
        }
    };

    let provenance = json!({
        "schema": "songmaker.userAudio",
        "schemaVersion": 1,
        "id": asset_id,
        "displayName": display_name,
        "originalRelativePath": original_rel,
        "normalizedRelativePath": normalized_rel,
        "sourceFileName": source.file_name().and_then(|s| s.to_str()).unwrap_or(""),
        "sha256": sha,
        "durationMs": duration_ms,
        "importedAt": now_iso(),
    });
    if let Err(e) = atomic_write_json(
        &root.join("provenance").join(format!("{asset_id}.json")),
        &provenance,
    ) {
        let _ = std::fs::remove_file(&normalized_abs);
        if let Some(p) = &copied_original {
            let _ = std::fs::remove_file(p);
        }
        return Err(e);
    }

    Ok(IngestedUserAudio {
        asset_id,
        normalized_rel,
        sha,
        duration_ms,
        original_rel,
    })
}

fn rollback_ingested_asset(folder: &Path, asset: &IngestedUserAudio) {
    let _ = std::fs::remove_file(folder.join(&asset.normalized_rel));
    if let Some(rel) = &asset.original_rel {
        let _ = std::fs::remove_file(folder.join(rel));
    }
    let _ = std::fs::remove_file(
        user_audio_root(folder)
            .join("provenance")
            .join(format!("{}.json", asset.asset_id)),
    );
}

struct AudioPlacement {
    start_ms: i64,
    mute_existing: bool,
}

fn mute_existing_tracks(mix: &mut MixDoc) {
    for track in &mut mix.tracks {
        track.mute = true;
        track.solo = false;
    }
}

/// Copy (optional) + normalize + append user MixTrack. Existing audio is retained.
fn ingest_user_audio_file(
    folder: &Path,
    doc: &mut ProjectDoc,
    source: &Path,
    display_name: &str,
    copy_original: bool,
    original_ext: Option<&str>,
    placement: AudioPlacement,
) -> Result<MixDoc, String> {
    let asset =
        prepare_user_audio_asset(folder, source, display_name, copy_original, original_ext)?;

    let project_lock = crate::project_transaction::lock_for(folder);
    let _project_guard = project_lock.lock();
    *doc = match load_project(folder) {
        Ok(doc) => doc,
        Err(error) => {
            rollback_ingested_asset(folder, &asset);
            return Err(error);
        }
    };
    let (mut mix, mix_path) = match load_or_create_active_mix(folder, doc) {
        Ok(mix) => mix,
        Err(error) => {
            rollback_ingested_asset(folder, &asset);
            return Err(error);
        }
    };
    let track_count_before = mix.tracks.len();
    if placement.mute_existing {
        mute_existing_tracks(&mut mix);
    }
    append_user_audio_track(
        &mut mix,
        &asset.normalized_rel,
        &asset.sha,
        asset.duration_ms,
        display_name,
        placement.start_ms.max(0),
    );
    if let Err(e) = atomic_write_json(&mix_path, &mix) {
        mix.tracks.truncate(track_count_before);
        rollback_ingested_asset(folder, &asset);
        return Err(e);
    }
    doc.updated_at = now_iso();
    let _ = save_project(folder, doc);
    let _ = upsert_library_row(&library_row_from_project(folder, doc));
    Ok(mix)
}

#[tauri::command]
pub async fn import_user_audio_track(
    app: tauri::AppHandle,
    id: String,
) -> Result<Option<MixDoc>, String> {
    use tauri_plugin_dialog::DialogExt;

    let Some(selected) = app
        .dialog()
        .file()
        .add_filter("Audio (WAV, MP3, FLAC)", &["wav", "mp3", "flac"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };

    let source = selected
        .into_path()
        .map_err(|e| format!("Chemin audio invalide : {e}"))?;
    let ext = user_audio_ext_ok(&source)?;
    let display_name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Piste personnalisée")
        .to_string();

    tokio::task::spawn_blocking(move || {
        let folder = project_folder(&id);
        let mut doc = load_project(&folder)?;
        ingest_user_audio_file(
            &folder,
            &mut doc,
            &source,
            &display_name,
            true,
            Some(&ext),
            AudioPlacement {
                start_ms: 0,
                mute_existing: false,
            },
        )
        .map(Some)
    })
    .await
    .map_err(|e| format!("Import audio interrompu : {e}"))?
}

/// Copy a finished generation WAV onto a new user mix track (project-conditioned part, #325).
#[tauri::command]
pub async fn import_generation_as_user_track(
    id: String,
    generation_id: String,
    display_name: Option<String>,
    mute_existing: Option<bool>,
) -> Result<MixDoc, String> {
    tokio::task::spawn_blocking(move || {
        let folder = project_folder(&id);
        let mut doc = load_project(&folder)?;
        let gen_id = generation_id.trim();
        if gen_id.is_empty() {
            return Err("Identifiant de génération manquant.".into());
        }
        let wav = folder.join("generations").join(gen_id).join("audio.wav");
        if !wav.is_file() {
            return Err(format!(
                "WAV de génération introuvable (generations/{gen_id}/audio.wav)."
            ));
        }
        let name = display_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Partie instrumentale")
            .to_string();
        ingest_user_audio_file(
            &folder,
            &mut doc,
            &wav,
            &name,
            true,
            Some("wav"),
            AudioPlacement {
                start_ms: 0,
                mute_existing: mute_existing.unwrap_or(false),
            },
        )
    })
    .await
    .map_err(|e| format!("Import génération interrompu : {e}"))?
}

#[tauri::command]
pub fn begin_user_audio_capture(id: String) -> Result<UserAudioCaptureSession, String> {
    let folder = project_folder(&id);
    let _ = load_project(&folder)?;
    ensure_user_audio_dirs(&folder)?;
    let session_id = Uuid::new_v4().to_string();
    let rel = format!("user-audio/capture/{session_id}.webm");
    let abs = folder.join(&rel);
    // Create empty file so append can open for write.
    std::fs::File::create(&abs)
        .map_err(|e| format!("Impossible de créer le fichier de capture : {e}"))?;
    Ok(UserAudioCaptureSession {
        session_id,
        relative_path: rel,
    })
}

#[tauri::command]
pub fn append_user_audio_chunk(
    id: String,
    session_id: String,
    chunk: Vec<u8>,
) -> Result<(), String> {
    if !capture_session_id_ok(&session_id) {
        return Err("Identifiant de session de capture invalide.".into());
    }
    if chunk.is_empty() {
        return Ok(());
    }
    let folder = project_folder(&id);
    let path = capture_session_file(&folder, &session_id)
        .ok_or_else(|| "Session de capture introuvable ou déjà finalisée.".to_string())?;
    if path.extension().and_then(|e| e.to_str()) != Some("webm") {
        return Err("Ajout de chunks réservé à la capture WebView (.webm).".into());
    }
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .map_err(|e| format!("Écriture capture : {e}"))?;
    file.write_all(&chunk)
        .map_err(|e| format!("Disque plein ou écriture impossible : {e}"))?;
    Ok(())
}

pub(crate) fn capture_session_id_ok(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= 80
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub(crate) fn capture_session_file(folder: &Path, session_id: &str) -> Option<PathBuf> {
    let dir = folder.join("user-audio").join("capture");
    let wav = dir.join(format!("{session_id}.wav"));
    if wav.is_file() {
        return Some(wav);
    }
    let webm = dir.join(format!("{session_id}.webm"));
    if webm.is_file() {
        return Some(webm);
    }
    None
}

#[tauri::command]
pub fn discard_user_audio_capture(id: String, session_id: String) -> Result<(), String> {
    if !capture_session_id_ok(&session_id) {
        return Err("Identifiant de session de capture invalide.".into());
    }
    let folder = project_folder(&id);
    if let Some(path) = capture_session_file(&folder, &session_id) {
        std::fs::remove_file(&path).map_err(|e| format!("Suppression capture : {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn finalize_user_audio_capture(
    id: String,
    session_id: String,
    display_name: Option<String>,
    start_ms: Option<i64>,
) -> Result<MixDoc, String> {
    if !capture_session_id_ok(&session_id) {
        return Err("Identifiant de session de capture invalide.".into());
    }
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let capture = capture_session_file(&folder, &session_id)
        .ok_or_else(|| "Session de capture introuvable.".to_string())?;
    let meta = std::fs::metadata(&capture).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        let _ = std::fs::remove_file(&capture);
        return Err("Enregistrement vide — aucune piste créée.".into());
    }
    let ext = capture
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("webm");
    let name = display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Enregistrement")
        .to_string();
    match ingest_user_audio_file(
        &folder,
        &mut doc,
        &capture,
        &name,
        true,
        Some(ext),
        AudioPlacement {
            start_ms: start_ms.unwrap_or(0).max(0),
            mute_existing: false,
        },
    ) {
        Ok(mix) => {
            // Original copy lives under originals/; drop capture temp.
            let _ = std::fs::remove_file(&capture);
            Ok(mix)
        }
        Err(e) => {
            // Keep capture on disk so the UI can retry or discard cleanly.
            Err(e)
        }
    }
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeCaptureTakesRequest {
    pub session_ids: Vec<String>,
    pub display_name: Option<String>,
    /// Timeline start for all takes (punch-in).
    pub start_ms: Option<i64>,
}

/// Finalize several capture sessions as one track with take lanes (#93).
#[tauri::command]
pub fn finalize_user_audio_capture_takes(
    id: String,
    req: FinalizeCaptureTakesRequest,
) -> Result<MixDoc, String> {
    if req.session_ids.is_empty() {
        return Err("Aucune session de prise à finaliser.".into());
    }
    for sid in &req.session_ids {
        if !capture_session_id_ok(sid) {
            return Err("Identifiant de session de capture invalide.".into());
        }
    }
    let folder = project_folder(&id);
    let _ = load_project(&folder)?;
    let name = req
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Enregistrement")
        .to_string();
    let start_ms = req.start_ms.unwrap_or(0).max(0);

    let mut assets: Vec<IngestedUserAudio> = Vec::new();
    let mut labels: Vec<String> = Vec::new();
    for (i, sid) in req.session_ids.iter().enumerate() {
        let Some(capture) = capture_session_file(&folder, sid) else {
            for a in &assets {
                rollback_ingested_asset(&folder, a);
            }
            return Err(format!("Session de capture introuvable : {sid}"));
        };
        let meta = std::fs::metadata(&capture).map_err(|e| e.to_string())?;
        if meta.len() == 0 {
            for a in &assets {
                rollback_ingested_asset(&folder, a);
            }
            return Err("Enregistrement vide — aucune piste créée.".into());
        }
        let ext = capture
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("webm");
        let label = format!("Prise {}", i + 1);
        match prepare_user_audio_asset(
            &folder,
            &capture,
            &format!("{name} — {label}"),
            true,
            Some(ext),
        ) {
            Ok(asset) => {
                assets.push(asset);
                labels.push(label);
            }
            Err(e) => {
                for a in &assets {
                    rollback_ingested_asset(&folder, a);
                }
                return Err(e);
            }
        }
    }

    let take_refs: Vec<(&str, &str, i64, &str)> = assets
        .iter()
        .zip(labels.iter())
        .map(|(a, lab)| {
            (
                a.normalized_rel.as_str(),
                a.sha.as_str(),
                a.duration_ms,
                lab.as_str(),
            )
        })
        .collect();

    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    let mut doc = match load_project(&folder) {
        Ok(doc) => doc,
        Err(error) => {
            for asset in &assets {
                rollback_ingested_asset(&folder, asset);
            }
            return Err(error);
        }
    };
    let (mut mix, mix_path) = match load_or_create_active_mix(&folder, &mut doc) {
        Ok(v) => v,
        Err(e) => {
            for a in &assets {
                rollback_ingested_asset(&folder, a);
            }
            return Err(e);
        }
    };
    let track_count_before = mix.tracks.len();
    append_user_audio_takes(&mut mix, &take_refs, &name, start_ms, None);
    if let Err(e) = atomic_write_json(&mix_path, &mix) {
        mix.tracks.truncate(track_count_before);
        for a in &assets {
            rollback_ingested_asset(&folder, a);
        }
        return Err(e);
    }

    for sid in &req.session_ids {
        if let Some(capture) = capture_session_file(&folder, sid) {
            let _ = std::fs::remove_file(&capture);
        }
    }
    doc.updated_at = now_iso();
    let _ = save_project(&folder, &doc);
    let _ = upsert_library_row(&library_row_from_project(&folder, &doc));
    Ok(mix)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_song_keeps_existing_audio_and_enables_only_new_track() {
        let mut mix = empty_mix("preview-test");
        append_user_audio_track(
            &mut mix,
            "original.wav",
            "original-sha",
            30000,
            "Original",
            500,
        );
        mix.tracks[0].solo = true;
        let clips_before = serde_json::to_value(&mix.tracks[0].clips).unwrap();
        mute_existing_tracks(&mut mix);
        append_user_audio_track(&mut mix, "lego.wav", "lego-sha", 29960, "Lego", 0);
        assert_eq!(mix.tracks.len(), 2);
        assert!(mix.tracks[0].mute);
        assert!(!mix.tracks[0].solo);
        assert!(!mix.tracks[1].mute);
        assert_eq!(
            serde_json::to_value(&mix.tracks[0].clips).unwrap(),
            clips_before
        );
    }

    #[test]
    fn session_file_prefers_wav_over_webm() {
        let dir =
            std::env::temp_dir().join(format!("song-maker-cap-sess-{}", uuid::Uuid::new_v4()));
        let capture = dir.join("user-audio").join("capture");
        std::fs::create_dir_all(&capture).unwrap();
        let sid = "sess-1";
        assert!(capture_session_file(&dir, sid).is_none());
        std::fs::write(capture.join(format!("{sid}.webm")), b"webm").unwrap();
        assert_eq!(
            capture_session_file(&dir, sid)
                .unwrap()
                .extension()
                .unwrap(),
            "webm"
        );
        std::fs::write(capture.join(format!("{sid}.wav")), b"RIFF").unwrap();
        assert_eq!(
            capture_session_file(&dir, sid)
                .unwrap()
                .extension()
                .unwrap(),
            "wav"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
