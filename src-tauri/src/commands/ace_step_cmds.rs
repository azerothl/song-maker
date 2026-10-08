use super::AppState;
use crate::library::{load_settings, save_settings};
use serde_json::json;
use std::path::PathBuf;

#[tauri::command]
pub fn ace_step_install_info() -> Result<serde_json::Value, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let info = crate::ace_step::install_info(&cache);
    Ok(json!({
        "gguf": info.gguf,
        "sha256": info.sha256,
        "bytes": info.bytes,
        "repo": info.repo,
        "revision": info.revision,
        "remotePath": info.remote_path,
        "url": info.url,
        "licenseNoticeFr": info.license_notice_fr,
        "licenseNoticeEn": info.license_notice_en,
        "path": info.path,
        "available": info.available,
        "licenseAccepted": settings.ace_step_license_accepted,
        "selected": settings.generation_engine == "ace_step"
    }))
}

#[tauri::command]
pub async fn install_ace_step(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    license_accepted: bool,
) -> Result<String, String> {
    let _resources = super::settings::guard_model_install(&state).await?;
    if super::batch_cmds::resources_pinned() || state.batch_workers.busy() {
        return Err("Terminez ou annulez le lot avant de modifier les modèles installés.".into());
    }
    use std::sync::atomic::Ordering;
    if !license_accepted {
        return Err(
            "Lisez et acceptez l’information de licence ACE-Step avant le téléchargement.".into(),
        );
    }
    if state.ace_step_installing.swap(true, Ordering::AcqRel) {
        return Err("Un téléchargement ACE-Step est déjà en cours.".into());
    }
    let result = async {
        let mut settings = load_settings()?;
        settings.ace_step_license_accepted = true;
        save_settings(&settings)?;
        let cache = PathBuf::from(&settings.cache_dir);
        let cancel = state.ace_step_cancel.clone();
        let downloaded = crate::ace_step::install(app, cache, cancel).await?;
        crate::audiocpp::AudioCppServer::write_config(&settings)?;
        state.server.shutdown();
        Ok(downloaded)
    }
    .await;
    state.ace_step_installing.store(false, Ordering::Release);
    result
}

#[tauri::command]
pub fn cancel_ace_step_install(state: tauri::State<'_, AppState>) -> String {
    state
        .ace_step_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    "Annulation du téléchargement demandée.".into()
}
