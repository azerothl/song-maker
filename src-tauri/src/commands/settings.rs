use super::shared::normalize_stem_separator;
use super::AppState;
use crate::library::{default_settings, load_settings, save_settings};
use crate::models::*;
use crate::paths::htdemucs_path;
use crate::pins::*;
use serde_json::json;
use std::path::{Path, PathBuf};

#[tauri::command]
pub fn get_health(state: tauri::State<'_, AppState>) -> HealthSnapshot {
    let url = state.server.base_url.lock().ok().map(|u| u.clone());
    crate::health::check_health(url.as_deref())
}

#[tauri::command]
pub fn get_setup_gpu_info() -> crate::models::SetupGpuInfo {
    crate::health::gpu_setup_info()
}

#[tauri::command]
pub fn get_install_plan(
    pack: String,
    mix_only: Option<bool>,
) -> Result<crate::models::InstallPlan, String> {
    if mix_only.unwrap_or(false) {
        let settings = load_settings()?;
        let cache = PathBuf::from(&settings.cache_dir);
        return crate::installer::install_plan_mix_only_for_cache(&cache);
    }
    crate::installer::install_plan_for_pack(pack)
}

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    load_settings()
}

#[tauri::command]
pub async fn install_required_assets(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    pack: String,
    accepted_license: bool,
) -> Result<String, String> {
    crate::installer::install(app, state, pack, accepted_license).await
}

#[tauri::command]
pub async fn install_mix_only_assets(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    crate::installer::install_mix_only(app, state).await
}

#[tauri::command]
pub fn update_settings(
    state: tauri::State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let mut s = settings;
    let cache = PathBuf::from(&s.cache_dir);
    s.stem_separator = normalize_stem_separator(&s.stem_separator).to_string();
    match s.generation_engine.as_str() {
        "yue2" => {}
        "ace_step" => {
            if !s.ace_step_license_accepted {
                return Err(
                    "Lisez et acceptez l’information de licence ACE-Step avant de le sélectionner."
                        .into(),
                );
            }
            if !crate::ace_step::weights_valid(&cache) {
                return Err(
                    "Téléchargez d’abord ACE-Step 1.5 Turbo BF16 depuis Paramètres → Modèle."
                        .into(),
                );
            }
        }
        "house_model" => return Err(crate::house_model::REFUSE_SELECT_FR.into()),
        "ace_step_lego" => {
            return Err(
                "ACE-Step Lego n’est pas le moteur global. YuE2 reste le défaut Créer ; Lego n’est appelé que pour ajouter une piste (mix/stems)."
                    .into(),
            );
        }
        other => {
            return Err(format!(
                "Moteur de génération inconnu ({other}). Attendu : yue2|ace_step."
            ));
        }
    }
    if s.stem_separator == "bs_roformer" && !crate::paths::bs_roformer_weights_present(&cache) {
        return Err(
            "Impossible d’activer BS-RoFormer : GGUF absent ou invalide. \
             Installez-le (opt-in) dans Paramètres → Production audio."
                .into(),
        );
    }
    if s.stem_separator == "mel_band_roformer"
        && !crate::paths::mel_band_roformer_weights_present(&cache)
    {
        return Err(
            "Impossible d’activer Mel-Band RoFormer : GGUF absent ou invalide. \
             Installez-le (opt-in) dans Paramètres → Production audio."
                .into(),
        );
    }
    if s.stem_separator == "htdemucs_6s" && !crate::demucs_onnx::is_installed(&cache) {
        return Err("Installez d’abord le runtime ONNX HTDemucs 6 stems dans Paramètres → Production audio.".into());
    }
    if !(0.0..=2.0).contains(&s.yue2_ar_lora_scale) || !(0.0..=2.0).contains(&s.yue2_nar_lora_scale)
    {
        return Err("L’échelle LoRA doit être comprise entre 0 et 2.".into());
    }
    crate::commands::mix_assistant::validate_mix_llm_settings(&s).map_err(|code| {
        match code.as_str() {
            "REMOTE_BLOCKED" => {
                "Le serveur LLM distant nécessite le mode expert (opt-in) dans l’assistant de mix."
                    .into()
            }
            "INVALID_INPUT:PROVIDER" => {
                "Fournisseur LLM inconnu (ollama|openai_compat|rbitnet|llama_cpp|external).".into()
            }
            "INVALID_INPUT:BASE_URL" => "URL de base LLM invalide.".into(),
            other => other.to_string(),
        }
    })?;
    for path in [&mut s.yue2_ar_lora, &mut s.yue2_nar_lora] {
        if let Some(raw) = path.as_ref() {
            let file = PathBuf::from(raw)
                .canonicalize()
                .map_err(|_| format!("Fichier LoRA introuvable : {raw}"))?;
            let lora_root = cache
                .join("models")
                .join("lora")
                .canonicalize()
                .map_err(|_| {
                    "Le dossier local models/lora est introuvable dans le cache.".to_string()
                })?;
            if !file.starts_with(&lora_root)
                || !file.is_file()
                || !file
                    .extension()
                    .is_some_and(|e| e.eq_ignore_ascii_case("safetensors"))
            {
                return Err(
                    "Choisissez un fichier .safetensors situé dans cache/models/lora.".into(),
                );
            }
            *path = Some(file.display().to_string());
        }
    }
    let old = load_settings().ok();
    save_settings(&s)?;
    if old.as_ref().is_some_and(|o| {
        o.generation_engine != s.generation_engine
            || o.yue2_ar_lora != s.yue2_ar_lora
            || o.yue2_nar_lora != s.yue2_nar_lora
            || o.yue2_ar_lora_scale != s.yue2_ar_lora_scale
            || o.yue2_nar_lora_scale != s.yue2_nar_lora_scale
    }) {
        state.server.shutdown();
    }
    Ok(s)
}

#[tauri::command]
pub fn get_phase3_status() -> Result<Phase3Status, String> {
    let settings = load_settings().unwrap_or_else(|_| default_settings());
    let cache = PathBuf::from(&settings.cache_dir);
    let bs_present = crate::paths::bs_roformer_weights_present(&cache);
    let mel_present = crate::paths::mel_band_roformer_weights_present(&cache);
    let onnx_runtime_present = crate::demucs_onnx::is_installed(&cache);
    let selected = normalize_stem_separator(&settings.stem_separator);
    Ok(Phase3Status {
        stem_separator: selected.to_string(),
        htdemucs_available: htdemucs_path(&cache).is_file(),
        bs_roformer_available: bs_present,
        bs_roformer_path: crate::paths::bs_roformer_path(&cache).display().to_string(),
        mel_band_roformer_available: mel_present,
        mel_band_roformer_path: crate::paths::mel_band_roformer_path(&cache)
            .display()
            .to_string(),
        htdemucs_6s_runtime_available: onnx_runtime_present,
        cc_by_nc_accepted: settings.cc_by_nc_accepted,
        accepted_separator_licenses: settings.accepted_separator_licenses.clone(),
        separator_time_stats: settings.separator_time_stats.clone(),
        guitar_piano_available: selected == "htdemucs_6s" && onnx_runtime_present,
        honesty_fr: if selected == "htdemucs_6s" && onnx_runtime_present {
            "HTDemucs 6 stems via ONNX : guitare et piano estimés séparément. Expérimental ; déconseillé piano-heavy. Masque spectral post-séparation sur les autres stems (le piano n’est pas nettoyé). Première séparation : téléchargement du modèle (136 Mo environ).".into()
        } else if selected == "htdemucs_6s" {
            "HTDemucs 6 stems nécessite le runtime ONNX optionnel. Installez-le ici avant de lancer une séparation.".into()
        } else if selected == "bs_roformer" {
            "BS-RoFormer : voix + instrumental seulement. Batterie, basse, guitare et piano indisponibles.".into()
        } else if selected == "mel_band_roformer" {
            "Mel-Band RoFormer « Kim Vocal » : voix + instrumental seulement. Batterie, basse, guitare et piano indisponibles.".into()
        } else {
            "HTDemucs : quatre stems. Guitare et piano non exposés par audio.cpp.".into()
        },
    })
}

fn require_separator_license(settings: &AppSettings, id: &str) -> Result<(), String> {
    if settings
        .accepted_separator_licenses
        .get(id)
        .copied()
        .unwrap_or(false)
    {
        return Ok(());
    }
    Err(format!(
        "Téléchargement bloqué : cochez « J’ai lu la licence » pour le modèle « {id} » avant de continuer."
    ))
}

#[tauri::command]
pub async fn install_htdemucs_6s_runtime() -> Result<String, String> {
    let settings = load_settings()?;
    require_separator_license(&settings, "htdemucs_6s")?;
    crate::demucs_onnx::install(PathBuf::from(settings.cache_dir)).await
}

/// Opt-in download of the BS-RoFormer GGUF (not in first-build installer).
/// Verifies licence notice (returned), size, SHA-256, disk space; supports cancel.
#[tauri::command]
pub async fn install_bs_roformer(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    if state.bs_roformer_installing.swap(true, Ordering::AcqRel) {
        return Err("Un téléchargement BS-RoFormer est déjà en cours.".into());
    }
    let settings = match load_settings() {
        Ok(s) => s,
        Err(e) => {
            state.bs_roformer_installing.store(false, Ordering::Release);
            return Err(e);
        }
    };
    if let Err(e) = require_separator_license(&settings, "bs_roformer") {
        state.bs_roformer_installing.store(false, Ordering::Release);
        return Err(e);
    }
    let cache = PathBuf::from(&settings.cache_dir);
    let cancel = state.bs_roformer_cancel.clone();
    let result = crate::bs_roformer::install(app, cache.clone(), cancel).await;
    state.bs_roformer_installing.store(false, Ordering::Release);
    match result {
        Ok(path) => {
            // Rewrite audiocpp config so bs_roformer is registered; restart pick-up on next sep.
            let _ = crate::audiocpp::AudioCppServer::write_config(&settings);
            state.server.shutdown();
            Ok(path)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn cancel_bs_roformer_install(state: tauri::State<'_, AppState>) -> String {
    state
        .bs_roformer_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    "Annulation demandée.".into()
}

#[tauri::command]
pub fn bs_roformer_install_info() -> Result<serde_json::Value, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let present = crate::paths::bs_roformer_weights_present(&cache);
    Ok(json!({
        "gguf": BS_ROFORMER_GGUF,
        "sha256": BS_ROFORMER_SHA,
        "bytes": crate::pins::BS_ROFORMER_BYTES,
        "remotePath": BS_ROFORMER_REMOTE,
        "url": crate::bs_roformer::download_url(),
        "licenseNoticeFr": crate::bs_roformer::LICENSE_NOTICE_FR,
        "path": crate::paths::bs_roformer_path(&cache).display().to_string(),
        "available": present,
        "defaultSeparator": "htdemucs",
        "stemLayoutFr": "Voix + instrumental seulement ; batterie, basse, guitare et piano indisponibles. HTDemucs reste le chemin stable par défaut.",
    }))
}

#[tauri::command]
pub async fn install_mel_band_roformer(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    if state
        .mel_band_roformer_installing
        .swap(true, Ordering::AcqRel)
    {
        return Err("Un téléchargement Mel-Band RoFormer est déjà en cours.".into());
    }
    let settings = match load_settings() {
        Ok(s) => s,
        Err(e) => {
            state
                .mel_band_roformer_installing
                .store(false, Ordering::Release);
            return Err(e);
        }
    };
    if let Err(e) = require_separator_license(&settings, "mel_band_roformer") {
        state
            .mel_band_roformer_installing
            .store(false, Ordering::Release);
        return Err(e);
    }
    let cache = PathBuf::from(&settings.cache_dir);
    let cancel = state.mel_band_roformer_cancel.clone();
    let result = crate::mel_band_roformer::install(app, cache.clone(), cancel).await;
    state
        .mel_band_roformer_installing
        .store(false, Ordering::Release);
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
pub fn cancel_mel_band_roformer_install(state: tauri::State<'_, AppState>) -> String {
    state
        .mel_band_roformer_cancel
        .store(true, std::sync::atomic::Ordering::SeqCst);
    "Annulation demandée.".into()
}

#[tauri::command]
pub fn mel_band_roformer_install_info() -> Result<serde_json::Value, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let present = crate::paths::mel_band_roformer_weights_present(&cache);
    Ok(json!({
        "gguf": MEL_BAND_ROFORMER_GGUF,
        "sha256": MEL_BAND_ROFORMER_SHA,
        "bytes": crate::pins::MEL_BAND_ROFORMER_BYTES,
        "remotePath": MEL_BAND_ROFORMER_REMOTE,
        "url": crate::mel_band_roformer::download_url(),
        "licenseNoticeFr": crate::mel_band_roformer::LICENSE_NOTICE_FR,
        "path": crate::paths::mel_band_roformer_path(&cache).display().to_string(),
        "available": present,
        "defaultSeparator": "htdemucs",
        "stemLayoutFr": "Voix + instrumental seulement (Mel-Band RoFormer « Kim Vocal »). HTDemucs reste le chemin stable par défaut.",
    }))
}

#[tauri::command]
pub fn list_lora_adapters() -> Result<Vec<LocalLoraAdapter>, String> {
    let settings = load_settings()?;
    let root = PathBuf::from(settings.cache_dir)
        .join("models")
        .join("lora");
    list_lora_adapters_at(&root)
}

fn list_lora_adapters_at(root: &Path) -> Result<Vec<LocalLoraAdapter>, String> {
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut adapters = Vec::new();
    for entry in walkdir::WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !entry.file_type().is_file()
            || !path
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("safetensors"))
        {
            continue;
        }
        let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
        let relative_name = path
            .strip_prefix(root)
            .unwrap_or(path)
            .display()
            .to_string();
        adapters.push(LocalLoraAdapter {
            name: relative_name,
            path: path
                .canonicalize()
                .unwrap_or_else(|_| path.to_path_buf())
                .display()
                .to_string(),
            size_bytes: metadata.len(),
        });
    }
    adapters.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(adapters)
}

#[tauri::command]
pub async fn import_lora_adapters(
    app: tauri::AppHandle,
) -> Result<Option<Vec<LocalLoraAdapter>>, String> {
    use tauri_plugin_dialog::DialogExt;

    let Some(selected_files) = app
        .dialog()
        .file()
        .add_filter("LoRA YuE2 (SafeTensors)", &["safetensors"])
        .blocking_pick_files()
    else {
        return Ok(None);
    };

    let settings = load_settings()?;
    let lora_root = PathBuf::from(settings.cache_dir)
        .join("models")
        .join("lora");
    let adapters = tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&lora_root).map_err(|e| e.to_string())?;
        let imported_root = lora_root.join("imported");
        std::fs::create_dir_all(&imported_root).map_err(|e| e.to_string())?;

        for selected in selected_files {
            let source = selected
                .into_path()
                .map_err(|e| format!("Chemin LoRA invalide : {e}"))?;
            if !source
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("safetensors"))
            {
                return Err(format!(
                    "Format refusé : {}. Choisissez un fichier .safetensors.",
                    source.display()
                ));
            }
            let source = source
                .canonicalize()
                .map_err(|e| format!("Fichier LoRA inaccessible : {e}"))?;
            if !source.is_file() {
                return Err(format!(
                    "Ce chemin n’est pas un fichier : {}",
                    source.display()
                ));
            }
            if source.starts_with(&lora_root) {
                continue;
            }

            let file_name = source
                .file_name()
                .ok_or_else(|| "Le fichier LoRA n’a pas de nom valide.".to_string())?;
            let stem = source
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let extension = source
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned();
            let mut destination = imported_root.join(file_name);
            let mut suffix = 2;
            while destination.exists() {
                destination = imported_root.join(format!("{stem} ({suffix}).{extension}"));
                suffix += 1;
            }
            std::fs::copy(&source, &destination)
                .map_err(|e| format!("Impossible de copier {} : {e}", source.display()))?;
        }

        list_lora_adapters_at(&lora_root)
    })
    .await
    .map_err(|e| format!("Import LoRA interrompu : {e}"))??;
    Ok(Some(adapters))
}

#[tauri::command]
pub fn confirm_model_pack(pack: String) -> Result<AppSettings, String> {
    let mut s = load_settings().unwrap_or_else(|_| default_settings());
    match pack.as_str() {
        "q8" => {
            s.model_pack = "q8".into();
            s.model_gguf = YUE2_Q8.into();
            s.model_sha256 = YUE2_Q8_SHA.into();
        }
        "q4" => {
            s.model_pack = "q4".into();
            s.model_gguf = YUE2_Q4.into();
            s.model_sha256 = YUE2_Q4_SHA.into();
        }
        _ => return Err("Pack invalide (q8|q4).".into()),
    }
    save_settings(&s)?;
    Ok(s)
}
