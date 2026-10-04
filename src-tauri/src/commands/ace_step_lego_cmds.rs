use super::AppState;
use crate::library::{load_settings, save_settings};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

#[tauri::command]
pub fn ace_step_lego_status(
    state: tauri::State<'_, AppState>,
) -> Result<crate::ace_step_lego::AceStepLegoStatus, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    Ok(crate::ace_step_lego::status(
        &cache,
        &state.ace_step_lego,
        settings.ace_step_lego_license_accepted,
    ))
}

#[tauri::command]
pub fn ace_step_lego_install_info(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let status = ace_step_lego_status(state)?;
    serde_json::to_value(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn install_ace_step_lego(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    license_accepted: bool,
) -> Result<String, String> {
    if !license_accepted {
        return Err(
            "Lisez et acceptez l’avis ACE-Step 1.5 Base (Lego) avant le téléchargement.".into(),
        );
    }
    if state.ace_step_lego_installing.swap(true, Ordering::AcqRel) {
        return Err("Un téléchargement Lego est déjà en cours.".into());
    }
    state.ace_step_lego_cancel.store(false, Ordering::SeqCst);
    let result = async {
        let mut settings = load_settings()?;
        settings.ace_step_lego_license_accepted = true;
        save_settings(&settings)?;
        let cache = PathBuf::from(&settings.cache_dir);
        crate::ace_step_lego::install(app, cache, state.ace_step_lego_cancel.clone()).await
    }
    .await;
    state
        .ace_step_lego_installing
        .store(false, Ordering::Release);
    result
}

#[tauri::command]
pub fn cancel_ace_step_lego_install(state: tauri::State<'_, AppState>) -> String {
    state.ace_step_lego_cancel.store(true, Ordering::SeqCst);
    "Annulation du téléchargement Lego demandée.".into()
}

#[tauri::command]
pub async fn ensure_ace_step_lego_sidecar(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let settings = load_settings()?;
    if !settings.ace_step_lego_license_accepted {
        return Err("Acceptez d’abord l’avis Lego dans Paramètres → Modèle.".into());
    }
    let cache = PathBuf::from(&settings.cache_dir);
    let url = crate::ace_step_lego::ensure_started(&state.ace_step_lego, &cache).await?;
    Ok(json!({ "baseUrl": url, "ready": true }))
}
