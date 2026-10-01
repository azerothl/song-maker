use super::AppState;
use crate::library::load_settings;
use crate::pins::*;
use serde_json::json;
use std::path::PathBuf;

// --- SheetSage2 (#60) ---

/// Opt-in download of SheetSage2 GGUF (not in first-build installer).
#[tauri::command]
pub async fn install_sheetsage2(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    if state.sheetsage_installing.swap(true, Ordering::AcqRel) {
        return Err("Un téléchargement SheetSage2 est déjà en cours.".into());
    }
    let settings = match load_settings() {
        Ok(s) => s,
        Err(e) => {
            state.sheetsage_installing.store(false, Ordering::Release);
            return Err(e);
        }
    };
    let cache = PathBuf::from(&settings.cache_dir);
    let cancel = state.sheetsage_cancel.clone();
    let result = crate::sheetsage::install(app, cache, cancel).await;
    state.sheetsage_installing.store(false, Ordering::Release);
    match result {
        Ok(path) => {
            let _ = crate::audiocpp::AudioCppServer::write_config(&settings);
            state.server.shutdown();
            Ok(path)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn cancel_sheetsage2_install(state: tauri::State<'_, AppState>) -> String {
    state
        .sheetsage_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    "Annulation demandée.".into()
}

#[tauri::command]
pub fn sheetsage2_install_info() -> Result<serde_json::Value, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let present = crate::paths::sheetsage2_weights_present(&cache);
    Ok(json!({
        "gguf": SHEETSAGE2_GGUF,
        "sha256": SHEETSAGE2_SHA,
        "bytes": SHEETSAGE2_BYTES,
        "repo": SHEETSAGE2_REPO,
        "remotePath": SHEETSAGE2_REMOTE,
        "url": crate::sheetsage::download_url(),
        "licenseNoticeFr": crate::sheetsage::LICENSE_NOTICE_FR,
        "path": crate::paths::sheetsage2_weights_path(&cache).display().to_string(),
        "available": present,
    }))
}

#[tauri::command]
pub fn sheetsage_probe() -> Result<crate::sheetsage::SheetsageProbeResult, String> {
    crate::sheetsage::probe()
}

#[tauri::command]
pub async fn sheetsage_transcribe(
    state: tauri::State<'_, AppState>,
    args: crate::sheetsage::SheetsageTranscribeArgs,
) -> Result<crate::sheetsage::SheetsageTranscribeOutcome, String> {
    crate::sheetsage::transcribe(&state.server, &state.sheetsage_jobs, args).await
}

#[tauri::command]
pub fn sheetsage_cancel(
    state: tauri::State<'_, AppState>,
    job_id: String,
) -> Result<String, String> {
    crate::sheetsage::cancel(&state.sheetsage_jobs, &job_id)
}
