use super::AppState;
use crate::library::{default_settings, load_settings, save_settings};
use crate::pins::{RBITNET_QWEN_ID, RBITNET_TAG};
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

#[tauri::command]
pub fn rbitnet_status(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let settings = load_settings().unwrap_or_else(|_| default_settings());
    let cache = PathBuf::from(&settings.cache_dir);
    let model_id = if settings.mix_llm_provider == "rbitnet" {
        settings.mix_llm_model_id.clone()
    } else {
        RBITNET_QWEN_ID.to_string()
    };
    let status = crate::rbitnet::status(&cache, &state.rbitnet, &model_id);
    serde_json::to_value(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rbitnet_install_info(state: tauri::State<'_, AppState>) -> Result<serde_json::Value, String> {
    let settings = load_settings().unwrap_or_else(|_| default_settings());
    let cache = PathBuf::from(&settings.cache_dir);
    let (asset, sha, bytes) = crate::pins::rbitnet_platform_archive();
    let status = crate::rbitnet::status(&cache, &state.rbitnet, RBITNET_QWEN_ID);
    Ok(json!({
        "releaseTag": RBITNET_TAG,
        "repo": crate::pins::RBITNET_REPO,
        "asset": asset,
        "sha256": sha,
        "bytes": bytes,
        "binaryPresent": status.binary_present,
        "defaultModelId": RBITNET_QWEN_ID,
        "noticeFr": "Rbitnet (azerothl/Rbitnet) est un sidecar local. Le binaire et les poids GGUF se téléchargent à la demande — ils ne sont pas inclus dans l’installeur MSI."
    }))
}

#[tauri::command]
pub async fn install_rbitnet_binary(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if state.rbitnet_installing.swap(true, Ordering::AcqRel) {
        return Err("Un téléchargement Rbitnet est déjà en cours.".into());
    }
    state.rbitnet_cancel.store(false, Ordering::SeqCst);
    let result = async {
        let settings = load_settings()?;
        let cache = PathBuf::from(&settings.cache_dir);
        crate::rbitnet::install_binary(app, cache, state.rbitnet_cancel.clone()).await
    }
    .await;
    state.rbitnet_installing.store(false, Ordering::Release);
    result
}

#[tauri::command]
pub async fn install_rbitnet_model(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    model_id: String,
) -> Result<String, String> {
    if state.rbitnet_installing.swap(true, Ordering::AcqRel) {
        return Err("Un téléchargement Rbitnet est déjà en cours.".into());
    }
    state.rbitnet_cancel.store(false, Ordering::SeqCst);
    let result = async {
        let settings = load_settings()?;
        let cache = PathBuf::from(&settings.cache_dir);
        crate::rbitnet::install_model(app, cache, model_id, state.rbitnet_cancel.clone()).await
    }
    .await;
    state.rbitnet_installing.store(false, Ordering::Release);
    result
}

#[tauri::command]
pub fn cancel_rbitnet_install(state: tauri::State<'_, AppState>) -> String {
    state.rbitnet_cancel.store(true, Ordering::SeqCst);
    "Annulation du téléchargement Rbitnet demandée.".into()
}

#[tauri::command]
pub async fn ensure_rbitnet_sidecar(
    state: tauri::State<'_, AppState>,
    model_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut settings = load_settings().unwrap_or_else(|_| default_settings());
    let cache = PathBuf::from(&settings.cache_dir);
    let id = model_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            if settings.mix_llm_provider == "rbitnet" && !settings.mix_llm_model_id.is_empty() {
                settings.mix_llm_model_id.clone()
            } else {
                RBITNET_QWEN_ID.to_string()
            }
        });
    let url = crate::rbitnet::ensure_started(&state.rbitnet, &cache, &id).await?;
    settings.mix_llm_provider = "rbitnet".into();
    settings.mix_llm_base_url = url.clone();
    settings.mix_llm_model_id = id.clone();
    let _ = save_settings(&settings);
    Ok(json!({
        "baseUrl": url,
        "modelId": id,
        "ready": true
    }))
}
