use crate::audiocpp::AudioCppServer;
use crate::form::{
    guidance_scale, validate_draft_form, validate_form, validate_target_duration, validate_title,
};
use crate::hashutil::{normalize_seed, random_seed, sha256_file};
use crate::library::{
    default_settings, delete_library_row, library_row_from_project, list_library, load_project,
    load_settings, project_folder, save_project, save_settings, upsert_library_row,
};
use crate::mix::{
    append_user_audio_takes, append_user_audio_track, empty_mix, export_flac, export_mp3, new_mix_from_separation,
    render_mix, wav_duration_ms, write_export_json_with_warnings, write_interleaved_f32_wav,
};
use crate::models::*;
use crate::paths::{
    atomic_write_json, default_cache_dir, ensure_dir, htdemucs_path, next_folder_id, now_iso,
    projects_root,
};
use crate::pins::*;
use crate::queue::JobQueue;
use crate::resample::{normalize_user_audio, resample_soxr};
use serde_json::json;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct AppState {
    pub server: AudioCppServer,
    pub queue: JobQueue,
    pub undo: Mutex<UndoStacks>,
    pub setup_installing: std::sync::atomic::AtomicBool,
    pub bs_roformer_installing: std::sync::atomic::AtomicBool,
    pub bs_roformer_cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub sheetsage_installing: std::sync::atomic::AtomicBool,
    pub sheetsage_cancel: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub sheetsage_jobs: crate::sheetsage::SheetsageJobs,
    pub lora_train_jobs: crate::lora_train::LoraTrainJobs,
}

#[derive(Default)]
pub struct UndoStacks {
    /// project_id -> (undo, redo) of MixUpdate / form snapshots as JSON
    pub stacks: BTreeMap<String, (Vec<serde_json::Value>, Vec<serde_json::Value>)>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            server: AudioCppServer::default(),
            queue: JobQueue::default(),
            undo: Mutex::new(UndoStacks::default()),
            setup_installing: std::sync::atomic::AtomicBool::new(false),
            bs_roformer_installing: std::sync::atomic::AtomicBool::new(false),
            bs_roformer_cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            sheetsage_installing: std::sync::atomic::AtomicBool::new(false),
            sheetsage_cancel: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            sheetsage_jobs: crate::sheetsage::SheetsageJobs::default(),
            lora_train_jobs: crate::lora_train::LoraTrainJobs::default(),
        }
    }
}

fn push_undo(state: &AppState, project_id: &str, snapshot: serde_json::Value) {
    let mut g = state.undo.lock().unwrap();
    let entry = g.stacks.entry(project_id.to_string()).or_default();
    entry.0.push(snapshot);
    if entry.0.len() > 100 {
        entry.0.remove(0);
    }
    entry.1.clear();
}

#[tauri::command]
pub fn get_health(state: tauri::State<'_, AppState>) -> HealthSnapshot {
    let url = state.server.base_url.lock().ok().map(|u| u.clone());
    crate::health::check_health(url.as_deref())
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
pub fn update_settings(state: tauri::State<'_, AppState>, settings: AppSettings) -> Result<AppSettings, String> {
    let mut s = settings;
    let cache = PathBuf::from(&s.cache_dir);
    s.stem_separator = normalize_stem_separator(&s.stem_separator).to_string();
    if s.stem_separator == "bs_roformer" {
        if !crate::paths::bs_roformer_weights_present(&cache) {
            return Err(
                "Impossible d’activer BS-RoFormer : GGUF absent ou invalide. \
                 Installez-le (opt-in) dans Paramètres → Production audio."
                    .into(),
            );
        }
    }
    if s.stem_separator == "htdemucs_6s" && !crate::demucs_onnx::is_installed(&cache) {
        return Err("Installez d’abord le runtime ONNX HTDemucs 6 stems dans Paramètres → Production audio.".into());
    }
    if !(0.0..=2.0).contains(&s.yue2_ar_lora_scale) || !(0.0..=2.0).contains(&s.yue2_nar_lora_scale) {
        return Err("L’échelle LoRA doit être comprise entre 0 et 2.".into());
    }
    for path in [&mut s.yue2_ar_lora, &mut s.yue2_nar_lora] {
        if let Some(raw) = path.as_ref() {
            let file = PathBuf::from(raw).canonicalize().map_err(|_| format!("Fichier LoRA introuvable : {raw}"))?;
            let lora_root = cache.join("models").join("lora").canonicalize()
                .map_err(|_| "Le dossier local models/lora est introuvable dans le cache.".to_string())?;
            if !file.starts_with(&lora_root) || !file.is_file() || !file.extension().is_some_and(|e| e.eq_ignore_ascii_case("safetensors")) {
                return Err("Choisissez un fichier .safetensors situé dans cache/models/lora.".into());
            }
            *path = Some(file.display().to_string());
        }
    }
    let old = load_settings().ok();
    save_settings(&s)?;
    if old.as_ref().is_some_and(|o| o.yue2_ar_lora != s.yue2_ar_lora || o.yue2_nar_lora != s.yue2_nar_lora || o.yue2_ar_lora_scale != s.yue2_ar_lora_scale || o.yue2_nar_lora_scale != s.yue2_nar_lora_scale) {
        state.server.shutdown();
    }
    Ok(s)
}

#[tauri::command]
pub fn get_phase3_status() -> Result<Phase3Status, String> {
    let settings = load_settings().unwrap_or_else(|_| default_settings());
    let cache = PathBuf::from(&settings.cache_dir);
    let bs_present = crate::paths::bs_roformer_weights_present(&cache);
    let onnx_runtime_present = crate::demucs_onnx::is_installed(&cache);
    let selected = normalize_stem_separator(&settings.stem_separator);
    Ok(Phase3Status {
        stem_separator: selected.to_string(),
        htdemucs_available: htdemucs_path(&cache).is_file(),
        bs_roformer_available: bs_present,
        bs_roformer_path: crate::paths::bs_roformer_path(&cache)
            .display()
            .to_string(),
        htdemucs_6s_runtime_available: onnx_runtime_present,
        cc_by_nc_accepted: settings.cc_by_nc_accepted,
        guitar_piano_available: selected == "htdemucs_6s" && onnx_runtime_present,
        honesty_fr: if selected == "htdemucs_6s" && onnx_runtime_present {
            "HTDemucs 6 stems via ONNX : guitare et piano estimés séparément. Modèle expérimental ; fuites possibles, surtout sur le piano. Première séparation : téléchargement du modèle (136 Mo environ).".into()
        } else if selected == "htdemucs_6s" {
            "HTDemucs 6 stems nécessite le runtime ONNX optionnel. Installez-le ici avant de lancer une séparation.".into()
        } else if selected == "bs_roformer" {
            "BS-RoFormer : voix + instrumental seulement. Batterie, basse, guitare et piano indisponibles.".into()
        } else {
            "HTDemucs : quatre stems. Guitare et piano non exposés par audio.cpp.".into()
        },
    })
}

#[tauri::command]
pub async fn install_htdemucs_6s_runtime() -> Result<String, String> {
    let settings = load_settings()?;
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
    if state
        .bs_roformer_installing
        .swap(true, Ordering::AcqRel)
    {
        return Err("Un téléchargement BS-RoFormer est déjà en cours.".into());
    }
    let settings = match load_settings() {
        Ok(s) => s,
        Err(e) => {
            state.bs_roformer_installing.store(false, Ordering::Release);
            return Err(e);
        }
    };
    let cache = PathBuf::from(&settings.cache_dir);
    let cancel = state.bs_roformer_cancel.clone();
    let result =
        crate::bs_roformer::install(app, cache.clone(), cancel).await;
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
pub fn list_lora_adapters() -> Result<Vec<LocalLoraAdapter>, String> {
    let settings = load_settings()?;
    let root = PathBuf::from(settings.cache_dir).join("models").join("lora");
    list_lora_adapters_at(&root)
}

fn list_lora_adapters_at(root: &Path) -> Result<Vec<LocalLoraAdapter>, String> {
    if !root.is_dir() { return Ok(Vec::new()); }
    let mut adapters = Vec::new();
    for entry in walkdir::WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !entry.file_type().is_file() || !path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("safetensors")) {
            continue;
        }
        let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let relative_name = path.strip_prefix(root).unwrap_or(path).display().to_string();
        adapters.push(LocalLoraAdapter {
            name: relative_name,
            path: path.canonicalize().unwrap_or_else(|_| path.to_path_buf()).display().to_string(),
            size_bytes: metadata.len(),
        });
    }
    adapters.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(adapters)
}

#[tauri::command]
pub async fn import_lora_adapters(app: tauri::AppHandle) -> Result<Option<Vec<LocalLoraAdapter>>, String> {
    use tauri_plugin_dialog::DialogExt;

    let Some(selected_files) = app.dialog().file()
        .add_filter("LoRA YuE2 (SafeTensors)", &["safetensors"])
        .blocking_pick_files()
    else {
        return Ok(None);
    };

    let settings = load_settings()?;
    let lora_root = PathBuf::from(settings.cache_dir).join("models").join("lora");
    let adapters = tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&lora_root).map_err(|e| e.to_string())?;
        let imported_root = lora_root.join("imported");
        std::fs::create_dir_all(&imported_root).map_err(|e| e.to_string())?;

        for selected in selected_files {
            let source = selected.into_path().map_err(|e| format!("Chemin LoRA invalide : {e}"))?;
            if !source.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("safetensors")) {
                return Err(format!("Format refusé : {}. Choisissez un fichier .safetensors.", source.display()));
            }
            let source = source.canonicalize().map_err(|e| format!("Fichier LoRA inaccessible : {e}"))?;
            if !source.is_file() {
                return Err(format!("Ce chemin n’est pas un fichier : {}", source.display()));
            }
            if source.starts_with(&lora_root) {
                continue;
            }

            let file_name = source.file_name().ok_or_else(|| "Le fichier LoRA n’a pas de nom valide.".to_string())?;
            let stem = source.file_stem().unwrap_or_default().to_string_lossy().into_owned();
            let extension = source.extension().unwrap_or_default().to_string_lossy().into_owned();
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
    }).await.map_err(|e| format!("Import LoRA interrompu : {e}"))??;
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

#[tauri::command]
pub fn list_projects(query: Option<String>) -> Result<Vec<LibraryRow>, String> {
    list_library(query)
}

#[tauri::command]
pub fn create_project(input: CreateProjectInput) -> Result<ProjectDoc, String> {
    validate_title(&input.title).map_err(|e| e.to_string())?;
    ensure_dir(&projects_root()).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let folder = project_folder(&id);
    ensure_dir(&folder).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("generations")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("separations")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("mixes")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("exports")).map_err(|e| e.to_string())?;
    ensure_dir(&folder.join("scores")).map_err(|e| e.to_string())?;
    let now = now_iso();
    let doc = ProjectDoc {
        schema: SCHEMA_PROJECT.into(),
        schema_version: SCHEMA_VERSION,
        id: id.clone(),
        title: input.title.trim().to_string(),
        created_at: now.clone(),
        updated_at: now.clone(),
        sample_rate: SAMPLE_RATE,
        channels: CHANNELS,
        bit_depth: BIT_DEPTH,
        style: String::new(),
        lyrics: String::new(),
        cot: "full".into(),
        singing_language: None,
        tempo_bpm: None,
        key: None,
        meter: None,
        target_duration_sec: DURATION_SEC_DEFAULT,
        prefer_full_lyrics: true,
        active_generation_id: None,
        active_separation_id: None,
        active_mix_id: None,
        active_score_id: None,
    };
    save_project(&folder, &doc)?;
    upsert_library_row(&LibraryRow {
        id: id.clone(),
        title: doc.title.clone(),
        folder_path: folder.display().to_string(),
        created_at: now.clone(),
        updated_at: now,
        duration_ms: None,
        status: "empty".into(),
        cot: doc.cot.clone(),
        active_generation_id: None,
    })?;
    Ok(doc)
}

#[tauri::command]
pub fn open_project(id: String) -> Result<ProjectDoc, String> {
    load_project(&project_folder(&id))
}

#[tauri::command]
pub fn save_project_form(id: String, form: FormInput) -> Result<ProjectDoc, String> {
    validate_draft_form(&form).map_err(|e| e.to_string())?;
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    doc.title = form.title.trim().to_string();
    doc.style = form.style.trim().to_string();
    doc.lyrics = form.lyrics.clone();
    doc.cot = form.cot.clone();
    doc.singing_language = form.singing_language.filter(|s| !s.trim().is_empty());
    doc.tempo_bpm = form.tempo_bpm;
    doc.key = form.key;
    doc.meter = form.meter;
    doc.target_duration_sec = validate_target_duration(form.target_duration_sec)
        .map_err(|e| e.to_string())?;
    doc.prefer_full_lyrics = form.prefer_full_lyrics;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(doc)
}

#[tauri::command]
pub fn rename_project(id: String, title: String) -> Result<ProjectDoc, String> {
    validate_title(&title).map_err(|e| e.to_string())?;
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    doc.title = title.trim().to_string();
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(doc)
}

#[tauri::command]
pub fn duplicate_project(id: String) -> Result<ProjectDoc, String> {
    let src = project_folder(&id);
    let doc = load_project(&src)?;
    let new_id = Uuid::new_v4().to_string();
    let dst = project_folder(&new_id);
    copy_dir_all(&src, &dst).map_err(|e| e.to_string())?;
    let mut new_doc = doc;
    new_doc.id = new_id.clone();
    new_doc.created_at = now_iso();
    new_doc.updated_at = new_doc.created_at.clone();
    save_project(&dst, &new_doc)?;
    upsert_library_row(&library_row_from_project(&dst, &new_doc))?;
    Ok(new_doc)
}

#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    let folder = project_folder(&id);
    if folder.exists() {
        std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())?;
    }
    delete_library_row(&id)
}

#[tauri::command]
pub fn reveal_project(id: String) -> Result<String, String> {
    let folder = project_folder(&id);
    Ok(folder.display().to_string())
}

#[tauri::command]
pub fn get_job_status(state: tauri::State<'_, AppState>) -> JobStatus {
    state.queue.status()
}

#[tauri::command]
pub fn cancel_job(state: tauri::State<'_, AppState>) -> String {
    state.queue.request_cancel()
}

#[tauri::command]
pub async fn start_generation(
    state: tauri::State<'_, AppState>,
    id: String,
    form: FormInput,
    abc: Option<String>,
    stop_after: Option<String>,
    source_generation_id: Option<String>,
) -> Result<ProjectDoc, String> {
    let style_sent = validate_form(&form).map_err(|e| e.to_string())?;
    let target_duration_sec =
        validate_target_duration(form.target_duration_sec).map_err(|e| e.to_string())?;
    let (mut semantic_min_tokens, mut semantic_max_tokens) = semantic_token_budget(
        target_duration_sec,
        &form.lyrics,
        form.prefer_full_lyrics,
    );
    let stop_after_abc = match stop_after.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        None => false,
        Some("abc") => true,
        Some(other) => {
            return Err(format!(
                "stop_after={other} hors contrat (seul « abc » est pris en charge)."
            ));
        }
    };
    let mut abc_trimmed = abc
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    if abc_trimmed.is_some() && form.cot == "off" {
        return Err(
            "Un ABC avec cot=off est interdit (erreur locale, avant l'appel).".into(),
        );
    }
    if stop_after_abc {
        if form.cot == "off" {
            return Err("stop_after=abc exige cot=melody|full.".into());
        }
        if abc_trimmed.is_some() {
            return Err("stop_after=abc refuse un ABC externe.".into());
        }
        if form.continuation_generation_id.is_some() {
            return Err("stop_after=abc est incompatible avec une continuation.".into());
        }
        if source_generation_id.is_some() {
            return Err("stop_after=abc est incompatible avec un rendu depuis un score existant.".into());
        }
    }
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let source_gen_id = source_generation_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    if let Some(ref src_id) = source_gen_id {
        let score_path = folder
            .join("generations")
            .join(src_id)
            .join("score.abc");
        if !score_path.is_file() {
            return Err(format!(
                "Score ABC introuvable pour {src_id} (attendu generations/{src_id}/score.abc)."
            ));
        }
        if abc_trimmed.is_none() {
            abc_trimmed = Some(
                std::fs::read_to_string(&score_path).map_err(|e| e.to_string())?,
            );
        }
    }
    let continuation = form.continuation_generation_id.as_deref();
    let semantic_prefix_path = if let Some(parent_id) = continuation {
        let parent_dir = folder.join("generations").join(parent_id);
        let resolved = resolve_semantic_prefix_for_continuation(
            &parent_dir,
            parent_id,
            &form.cot,
            abc_trimmed.as_deref(),
        )?;
        if let Some(abc) = resolved.parent_score_abc {
            abc_trimmed = Some(abc);
        }
        semantic_min_tokens = semantic_min_tokens.max(resolved.frame_count as u32);
        semantic_max_tokens = semantic_max_tokens
            .saturating_add(resolved.frame_count as u32)
            .min(resolved.token_ceiling as u32)
            .max(semantic_min_tokens);
        Some(resolved.semantic_path)
    } else {
        None
    };
    doc.title = form.title.trim().to_string();
    doc.style = form.style.trim().to_string();
    if continuation.is_some() {
        doc.lyrics = format!("{}\n\n{}", doc.lyrics.trim_end(), form.lyrics.trim());
    } else {
        doc.lyrics = form.lyrics.clone();
    }
    doc.cot = form.cot.clone();
    doc.singing_language = form.singing_language.clone();
    doc.tempo_bpm = form.tempo_bpm;
    doc.key = form.key.clone();
    doc.meter = form.meter.clone();
    doc.target_duration_sec = target_duration_sec;
    doc.prefer_full_lyrics = form.prefer_full_lyrics;
    doc.updated_at = now_iso();
    let mut settings = load_settings()?;
    let (lora_provenance, lora_warnings) = resolve_lora_provenance_for_generation(&mut settings);
    let seed = normalize_seed(form.seed.unwrap_or_else(random_seed));
    let gen_id = next_folder_id(&folder.join("generations"), "gen-")?;
    let gen_dir = folder.join("generations").join(&gen_id);
    ensure_dir(&gen_dir).map_err(|e| e.to_string())?;

    let lyrics_path = gen_dir.join("lyrics.txt");
    std::fs::write(&lyrics_path, &form.lyrics).map_err(|e| e.to_string())?;

    let abc_path_rel = if let Some(ref abc_text) = abc_trimmed {
        std::fs::write(gen_dir.join("input.abc"), abc_text).map_err(|e| e.to_string())?;
        Some("input.abc")
    } else {
        None
    };

    let (archive, archive_sha) = if cfg!(target_os = "windows") {
        (ARCHIVE_WINDOWS, ARCHIVE_WINDOWS_SHA)
    } else {
        (ARCHIVE_LINUX, ARCHIVE_LINUX_SHA)
    };

    let parent_generation_id = continuation
        .or(source_gen_id.as_deref())
        .or(doc.active_generation_id.as_deref());
    let job_kind = if continuation.is_some() {
        "continuation"
    } else if stop_after_abc {
        "score_only"
    } else if source_gen_id.is_some() {
        "render_from_score"
    } else {
        "generation"
    };
    let request = json!({
        "schema": SCHEMA_GEN_REQUEST,
        "schemaVersion": SCHEMA_VERSION,
        "id": gen_id,
        "projectId": id,
        "parentGenerationId": parent_generation_id,
        "continuationGenerationId": continuation,
        "sourceGenerationId": source_gen_id,
        "stopAfter": if stop_after_abc { Some("abc") } else { None::<&str> },
        "createdAt": now_iso(),
        "provider": "audiocpp",
        "binary": {
            "tag": AUDIOCPP_TAG,
            "commit": AUDIOCPP_COMMIT,
            "archive": archive,
            "sha256": archive_sha
        },
        "model": {
            "repo": YUE2_REPO,
            "revision": YUE2_REVISION,
            "gguf": settings.model_gguf,
            "sha256": settings.model_sha256,
            "vae": YUE2_VAE,
            "vaeSha256": YUE2_VAE_SHA
        },
        "backend": "cuda",
        "styleSent": style_sent,
        "lyricsPath": "lyrics.txt",
        "cot": form.cot,
        "abcPath": abc_path_rel,
        "seed": seed,
        "numInferenceSteps": NUM_INFERENCE_STEPS,
        "guidanceScale": guidance_scale(&form.cot),
        "targetDurationSec": target_duration_sec,
        "preferFullLyrics": form.prefer_full_lyrics,
        "semanticMinTokens": semantic_min_tokens,
        "semanticMaxTokens": semantic_max_tokens,
        "lora": lora_provenance,
        "loraWarnings": lora_warnings
    });
    atomic_write_json(&gen_dir.join("request.json"), &request)?;
    atomic_write_json(&gen_dir.join("job.json"), &json!({
        "id": gen_id,
        "projectId": id,
        "kind": job_kind,
        "state": "queued",
        "updatedAt": now_iso(),
    }))?;

    let queue = state.queue.clone();
    let queue_ref = queue.clone();
    let server_url = {
        let s = settings.clone();
        state.server.ensure_started(&s)?
    };

    let out_wav = gen_dir.join("audio.wav");
    let cot = form.cot.clone();
    let lyrics_for_req = form.lyrics.clone();
    let abc_for_req = abc_trimmed.clone();
    let gen_id_for_job = gen_id.clone();
    let gen_dir_for_job = gen_dir.clone();
    let project_id_for_job = id.clone();
    let job_kind_for_job = job_kind.to_string();
    let result = queue
        .run_exclusive(
            Some(id.clone()),
            if stop_after_abc {
                "Génération partition seule"
            } else {
                "Génération en cours"
            },
            async move {
                atomic_write_json(&gen_dir_for_job.join("job.json"), &json!({
                    "id": gen_id_for_job,
                    "projectId": project_id_for_job,
                    "kind": job_kind_for_job,
                    "state": "running",
                    "updatedAt": now_iso(),
                }))?;
                queue_ref.set_state(
                    "generating",
                    if stop_after_abc {
                        "Génération partition seule"
                    } else {
                        "Génération en cours"
                    },
                    Some(project_id_for_job.clone()),
                );
                let mut options = json!({
                    "style": style_sent,
                    "cot": cot,
                    "num_inference_steps": NUM_INFERENCE_STEPS,
                    "guidance_scale": guidance_scale(&cot),
                    "semantic_min_tokens": semantic_min_tokens,
                    "semantic_max_tokens": semantic_max_tokens,
                    "export_semantic": !stop_after_abc
                });
                if stop_after_abc {
                    options
                        .as_object_mut()
                        .ok_or_else(|| "options invalides".to_string())?
                        .insert("stop_after".into(), json!("abc"));
                }
                if let Some(path) = semantic_prefix_path.as_ref() {
                    options.as_object_mut().ok_or_else(|| "options invalides".to_string())?
                        .insert("semantic_prefix_file".into(), json!(path.display().to_string()));
                }
                if let Some(abc_text) = &abc_for_req {
                    options
                        .as_object_mut()
                        .ok_or_else(|| "options invalides".to_string())?
                        .insert("abc".into(), json!(abc_text));
                }
                let body = json!({
                    "model": "yue2",
                    "request": {
                        "lyrics": lyrics_for_req,
                        "seed": seed,
                        "options": options
                    }
                });
                let started = now_iso();
                let api_result = AudioCppServer::run_task(&server_url, body).await;
                let finished = now_iso();
                if queue_ref.cancel_requested() {
                    let result = json!({
                        "schema": SCHEMA_GEN_RESULT,
                        "schemaVersion": SCHEMA_VERSION,
                        "id": gen_id_for_job,
                        "state": "cancelled",
                        "decode": "unsupported",
                        "startedAt": started,
                        "finishedAt": finished,
                        "audio": null,
                        "score": null,
                        "error": "cancel_requested"
                    });
                    atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                    return Err("cancelled".into());
                }
                match api_result {
                    Ok(response) => {
                        let semantic_truncated =
                            AudioCppServer::semantic_truncated(&response);
                        let semantic_path = gen_dir_for_job.join("semantic.json");
                        let has_semantic = AudioCppServer::write_semantic_artifact(&response, &semantic_path).unwrap_or(false);

                        if let Some(abc) = AudioCppServer::extract_score_abc(&response) {
                            let _ = std::fs::write(gen_dir_for_job.join("score.abc"), abc);
                        } else if let Some(abc_text) = &abc_for_req {
                            // Conserve l'ABC envoyé si le modèle n'en renvoie pas.
                            let _ = std::fs::write(gen_dir_for_job.join("score.abc"), abc_text);
                        }

                        let score_path = gen_dir_for_job.join("score.abc");
                        if stop_after_abc {
                            if !score_path.is_file() {
                                let err = "Réponse score-only sans score.abc.".to_string();
                                let result = json!({
                                    "schema": SCHEMA_GEN_RESULT,
                                    "schemaVersion": SCHEMA_VERSION,
                                    "id": gen_id_for_job,
                                    "state": "failed",
                                    "decode": "unsupported",
                                    "startedAt": started,
                                    "finishedAt": finished,
                                    "audio": null,
                                    "score": null,
                                    "error": err
                                });
                                atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                                return Err(err);
                            }
                            let score = json!({
                                "path": "score.abc",
                                "sha256": sha256_file(&score_path)?
                            });
                            let result = json!({
                                "schema": SCHEMA_GEN_RESULT,
                                "schemaVersion": SCHEMA_VERSION,
                                "id": gen_id_for_job,
                                "state": "score_only",
                                "decode": "unsupported",
                                "startedAt": started,
                                "finishedAt": finished,
                                "audio": null,
                                "score": score,
                                "semanticTruncated": semantic_truncated,
                                "semanticPath": if has_semantic { Some("semantic.json") } else { None },
                                "error": null
                            });
                            atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                            write_checksums(&gen_dir_for_job)?;
                            queue_ref.set_state(
                                "score_only",
                                "Partition générée (sans audio)",
                                Some(project_id_for_job.clone()),
                            );
                            return Ok(0i64);
                        }

                        let wav_bytes = match AudioCppServer::extract_wav_bytes(&response) {
                            Ok(b) => b,
                            Err(e) => {
                                let result = json!({
                                    "schema": SCHEMA_GEN_RESULT,
                                    "schemaVersion": SCHEMA_VERSION,
                                    "id": gen_id_for_job,
                                    "state": "failed",
                                    "decode": "unsupported",
                                    "startedAt": started,
                                    "finishedAt": finished,
                                    "audio": null,
                                    "score": null,
                                    "error": e
                                });
                                atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                                return Err(e);
                            }
                        };
                        std::fs::write(&out_wav, &wav_bytes).map_err(|e| e.to_string())?;
                        if !out_wav.exists() {
                            let err = "WAV de génération absent après l'appel.".to_string();
                            let result = json!({
                                "schema": SCHEMA_GEN_RESULT,
                                "schemaVersion": SCHEMA_VERSION,
                                "id": gen_id_for_job,
                                "state": "failed",
                                "decode": "unsupported",
                                "startedAt": started,
                                "finishedAt": finished,
                                "audio": null,
                                "score": null,
                                "error": err
                            });
                            atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                            return Err(err);
                        }
                        let duration = wav_duration_ms(&out_wav).unwrap_or(0);
                        let audio_sha = sha256_file(&out_wav)?;
                        let score = if score_path.exists() {
                            json!({
                                "path": "score.abc",
                                "sha256": sha256_file(&score_path)?
                            })
                        } else {
                            json!({ "path": "score.abc", "sha256": null })
                        };
                        let result = json!({
                            "schema": SCHEMA_GEN_RESULT,
                            "schemaVersion": SCHEMA_VERSION,
                            "id": gen_id_for_job,
                            "state": "generated",
                            "decode": "unsupported",
                            "startedAt": started,
                            "finishedAt": finished,
                            "audio": {
                                "path": "audio.wav",
                                "sampleRate": SAMPLE_RATE,
                                "channels": CHANNELS,
                                "durationMs": duration,
                                "sha256": audio_sha
                            },
                            "score": score,
                            "semanticTruncated": semantic_truncated,
                            "semanticPath": if has_semantic { Some("semantic.json") } else { None },
                            "error": null
                        });
                        atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                        write_checksums(&gen_dir_for_job)?;
                        queue_ref.set_state(
                            "generated",
                            "Génération terminée",
                            Some(project_id_for_job.clone()),
                        );
                        Ok(duration)
                    }
                    Err(e) => {
                        let result = json!({
                            "schema": SCHEMA_GEN_RESULT,
                            "schemaVersion": SCHEMA_VERSION,
                            "id": gen_id_for_job,
                            "state": "failed",
                            "decode": "unsupported",
                            "startedAt": started,
                            "finishedAt": finished,
                            "audio": null,
                            "score": null,
                            "error": e
                        });
                        atomic_write_json(&gen_dir_for_job.join("result.json"), &result)?;
                        Err(e)
                    }
                }
            },
        )
        .await;

    let duration = match result {
        Ok(duration) => {
            atomic_write_json(&gen_dir.join("job.json"), &json!({
                "id": gen_id,
                "projectId": id,
                "kind": job_kind,
                "state": "completed",
                "updatedAt": now_iso(),
            }))?;
            duration
        }
        Err(error) => {
            atomic_write_json(&gen_dir.join("job.json"), &json!({
                "id": gen_id,
                "projectId": id,
                "kind": job_kind,
                "state": if error == "cancelled" { "cancelled" } else { "failed" },
                "error": error,
                "updatedAt": now_iso(),
            }))?;
            return Err(error);
        }
    };
    doc.active_generation_id = Some(gen_id.clone());
    // Detach separation when new take
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    let mut row = library_row_from_project(&folder, &doc);
    if duration > 0 {
        row.duration_ms = Some(duration);
    }
    upsert_library_row(&row)?;
    Ok(doc)
}

/// Render audio from an existing generation's immutable `score.abc`.
/// Sets `parentGenerationId` to the source gen; never uses `stop_after`.
#[tauri::command]
pub async fn render_from_generation(
    state: tauri::State<'_, AppState>,
    id: String,
    source_gen_id: String,
    form: FormInput,
) -> Result<ProjectDoc, String> {
    let mut form = form;
    // Rendering from a score is a fresh audio take, not a semantic continuation.
    form.continuation_generation_id = None;
    start_generation(
        state,
        id,
        form,
        None,
        None,
        Some(source_gen_id),
    )
    .await
}

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
    atomic_write_json(&sep_dir.join("job.json"), &json!({
        "id": sep_id,
        "projectId": id,
        "kind": "separation",
        "generationId": gen_id,
        "state": "preparing",
        "updatedAt": now_iso(),
    }))?;

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
    atomic_write_json(&sep_dir.join("job.json"), &json!({
        "id": sep_id,
        "projectId": id,
        "kind": "separation",
        "generationId": gen_id,
        "state": "queued",
        "updatedAt": now_iso(),
    }))?;

    let separator_result = queue
        .run_exclusive(
            Some(id.clone()),
            "Séparation en cours",
            async move {
                atomic_write_json(&sep_dir_clone.join("job.json"), &json!({
                    "id": sep_id_for_job,
                    "projectId": project_id_for_job.clone(),
                    "kind": "separation",
                    "generationId": generation_id_for_job,
                    "state": "running",
                    "updatedAt": now_iso(),
                }))?;
                queue_ref.set_state(
                    "separating",
                    "Séparation en cours",
                    Some(project_id_for_job.clone()),
                );
                if model_id == "htdemucs_6s" {
                    crate::demucs_onnx::separate(
                        cache_dir,
                        input_44100_clone,
                        sep_dir_clone,
                    )
                    .await?;
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
            },
        )
        .await;
    if let Err(error) = separator_result {
        atomic_write_json(&sep_dir.join("job.json"), &json!({
            "id": sep_id,
            "projectId": id,
            "kind": "separation",
            "generationId": gen_id,
            "state": if error == "cancelled" { "cancelled" } else { "failed" },
            "error": error,
            "updatedAt": now_iso(),
        }))?;
        return Err(error);
    }

    if state.queue.cancel_requested() {
        atomic_write_json(&sep_dir.join("job.json"), &json!({
            "id": sep_id,
            "projectId": id,
            "kind": "separation",
            "generationId": gen_id,
            "state": "cancelled",
            "updatedAt": now_iso(),
        }))?;
        return Err("Annulation demandée. L’appel GPU déjà lancé va jusqu’au bout ; les fichiers déjà écrits restent.".into());
    }

    state.queue.set_state("importing_tracks", "Import des pistes", Some(id.clone()));

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
            &[
                "vocals", "drums", "bass", "other", "guitar", "piano",
            ][..],
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
    atomic_write_json(&sep_dir.join("job.json"), &json!({
        "id": sep_id,
        "projectId": id,
        "kind": "separation",
        "generationId": gen_id,
        "state": "completed",
        "updatedAt": now_iso(),
    }))?;

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
pub fn load_mix(id: String) -> Result<Option<MixDoc>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let Some(mix_id) = doc.active_mix_id else {
        return Ok(None);
    };
    let path = folder.join("mixes").join(format!("{mix_id}.json"));
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(Some(serde_json::from_str(&text).map_err(|e| e.to_string())?))
}

#[tauri::command]
pub fn load_separation_info(id: String) -> Result<Option<SeparationInfo>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    Ok(read_separation_info(&folder, &doc))
}

fn read_separation_info(folder: &Path, doc: &ProjectDoc) -> Option<SeparationInfo> {
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
                        return Err(format!(
                            "Fondus trop longs pour le clip {}.",
                            clip.id
                        ));
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

fn user_audio_root(folder: &Path) -> PathBuf {
    folder.join("user-audio")
}

fn ensure_user_audio_dirs(folder: &Path) -> Result<(), String> {
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
        std::fs::copy(source, &dest).map_err(|e| {
            format!("Impossible de copier l’original dans le projet : {e}")
        })?;
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

/// Copy (optional) + normalize + append user MixTrack. Never mutates existing stems.
fn ingest_user_audio_file(
    folder: &Path,
    doc: &mut ProjectDoc,
    source: &Path,
    display_name: &str,
    copy_original: bool,
    original_ext: Option<&str>,
) -> Result<MixDoc, String> {
    let asset = prepare_user_audio_asset(
        folder,
        source,
        display_name,
        copy_original,
        original_ext,
    )?;

    let (mut mix, mix_path) = load_or_create_active_mix(folder, doc)?;
    let track_count_before = mix.tracks.len();
    append_user_audio_track(
        &mut mix,
        &asset.normalized_rel,
        &asset.sha,
        asset.duration_ms,
        display_name,
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
        )
        .map(Some)
    })
    .await
    .map_err(|e| format!("Import audio interrompu : {e}"))?
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
    std::fs::File::create(&abs).map_err(|e| format!("Impossible de créer le fichier de capture : {e}"))?;
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
    let path = folder
        .join("user-audio")
        .join("capture")
        .join(format!("{session_id}.webm"));
    if !path.is_file() {
        return Err("Session de capture introuvable ou déjà finalisée.".into());
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

fn capture_session_id_ok(session_id: &str) -> bool {
    !session_id.is_empty()
        && session_id.len() <= 80
        && session_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[tauri::command]
pub fn discard_user_audio_capture(id: String, session_id: String) -> Result<(), String> {
    if !capture_session_id_ok(&session_id) {
        return Err("Identifiant de session de capture invalide.".into());
    }
    let folder = project_folder(&id);
    let path = folder
        .join("user-audio")
        .join("capture")
        .join(format!("{session_id}.webm"));
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| format!("Suppression capture : {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn finalize_user_audio_capture(
    id: String,
    session_id: String,
    display_name: Option<String>,
) -> Result<MixDoc, String> {
    if !capture_session_id_ok(&session_id) {
        return Err("Identifiant de session de capture invalide.".into());
    }
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let capture = folder
        .join("user-audio")
        .join("capture")
        .join(format!("{session_id}.webm"));
    if !capture.is_file() {
        return Err("Session de capture introuvable.".into());
    }
    let meta = std::fs::metadata(&capture).map_err(|e| e.to_string())?;
    if meta.len() == 0 {
        let _ = std::fs::remove_file(&capture);
        return Err("Enregistrement vide — aucune piste créée.".into());
    }
    let name = display_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Enregistrement")
        .to_string();
    match ingest_user_audio_file(&folder, &mut doc, &capture, &name, true, Some("webm")) {
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

#[derive(Debug, Deserialize)]
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
    let mut doc = load_project(&folder)?;
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
        let capture = folder
            .join("user-audio")
            .join("capture")
            .join(format!("{sid}.webm"));
        if !capture.is_file() {
            for a in &assets {
                rollback_ingested_asset(&folder, a);
            }
            return Err(format!("Session de capture introuvable : {sid}"));
        }
        let meta = std::fs::metadata(&capture).map_err(|e| e.to_string())?;
        if meta.len() == 0 {
            for a in &assets {
                rollback_ingested_asset(&folder, a);
            }
            return Err("Enregistrement vide — aucune piste créée.".into());
        }
        let label = format!("Prise {}", i + 1);
        match prepare_user_audio_asset(
            &folder,
            &capture,
            &format!("{name} — {label}"),
            true,
            Some("webm"),
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
        let capture = folder
            .join("user-audio")
            .join("capture")
            .join(format!("{sid}.webm"));
        let _ = std::fs::remove_file(&capture);
    }
    doc.updated_at = now_iso();
    let _ = save_project(&folder, &doc);
    let _ = upsert_library_row(&library_row_from_project(&folder, &doc));
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
        std::fs::copy(&source, &playback)
            .map_err(|e| format!("Préparation lecture audio: {e}"))?;
    }
    Ok(playback.display().to_string())
}

/// Chemins absolus de la prise active et des stems / pistes utilisateur float32 pour Web Audio.
#[tauri::command]
pub fn playback_sources(id: String) -> Result<PlaybackSources, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let gen_id = doc.active_generation_id.clone();
    let gen_wav = gen_id.as_ref().map(|gid| {
        folder.join("generations").join(gid).join("audio.wav")
    });
    let gen_wav_ok = gen_wav.as_ref().is_some_and(|p| p.is_file());

    if let Some(mix_id) = &doc.active_mix_id {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        let mix: MixDoc = serde_json::from_str(
            &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
        )
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
        let mix: MixDoc = serde_json::from_str(
            &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
        )
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

    let wav_out = exports.join(format!("export-{stamp}.wav"));
    write_interleaved_f32_wav(&req.pcm_le, req.sample_rate, req.channels, &wav_out)?;

    let final_path = if format == "flac" {
        let flac = exports.join(format!("export-{stamp}.flac"));
        export_flac(&wav_out, &flac)?;
        let _ = std::fs::remove_file(&wav_out);
        flac
    } else if format == "mp3" {
        let mp3 = exports.join(format!("export-{stamp}.mp3"));
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
        &exports.join(format!("export-{stamp}.json")),
        &format,
        &final_path,
        req.peak_trim_db,
        Some(render_path),
        Some(match_mode),
        &warnings,
    )?;
    Ok(final_path.display().to_string())
}

fn resolve_lora_slot_provenance(
    path_opt: &mut Option<String>,
    scale: f32,
    slot: &str,
    warnings: &mut Vec<String>,
) -> Option<serde_json::Value> {
    let Some(raw) = path_opt.clone() else {
        return None;
    };
    let path = PathBuf::from(&raw);
    if !path.is_file() {
        warnings.push(format!(
            "Adaptateur LoRA {slot} introuvable ({raw}) — ignoré pour cette génération. Chemin standard sans LoRA."
        ));
        *path_opt = None;
        return None;
    }
    let sha = match sha256_file(&path) {
        Ok(h) => h,
        Err(e) => {
            warnings.push(format!(
                "Adaptateur LoRA {slot} illisible ({raw}) : {e} — ignoré. Génération standard sans LoRA."
            ));
            *path_opt = None;
            return None;
        }
    };
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&raw)
        .to_string();
    // Prefer catalog pack id when path is under models/lora/<packId>/…
    let pack_id = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .filter(|id| !id.is_empty() && *id != "imported" && *id != "lora")
        .map(|s| s.to_string());
    Some(json!({
        "slot": slot,
        "path": path.display().to_string(),
        "filename": filename,
        "sha256": sha,
        "scale": scale,
        "packId": pack_id,
        "version": pack_id,
    }))
}

/// Resolve LoRA adapters actually sent to audio.cpp for this generation.
/// Missing/corrupt adapters are omitted (vanilla path) with a clear warning — never blocks gen.
fn resolve_lora_provenance_for_generation(
    settings: &mut AppSettings,
) -> (serde_json::Value, Vec<String>) {
    let mut warnings: Vec<String> = Vec::new();
    let mut adapters = serde_json::Map::new();

    if let Some(entry) = resolve_lora_slot_provenance(
        &mut settings.yue2_ar_lora,
        settings.yue2_ar_lora_scale,
        "ar",
        &mut warnings,
    ) {
        adapters.insert("ar".into(), entry);
    }
    if let Some(entry) = resolve_lora_slot_provenance(
        &mut settings.yue2_nar_lora,
        settings.yue2_nar_lora_scale,
        "nar",
        &mut warnings,
    ) {
        adapters.insert("nar".into(), entry);
    }

    let provenance = if adapters.is_empty() {
        json!(null)
    } else {
        json!({
            "adapters": adapters,
            "arScale": settings.yue2_ar_lora_scale,
            "narScale": settings.yue2_nar_lora_scale
        })
    };
    (provenance, warnings)
}

fn normalize_sha256_hex(raw: &str) -> Option<String> {
    let s = raw.trim().to_ascii_lowercase();
    if s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit()) {
        Some(s)
    } else {
        None
    }
}

fn verify_cache_file_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let want = normalize_sha256_hex(expected).ok_or_else(|| {
        format!("Hash SHA-256 catalogue invalide (64 hex attendus) : {expected}")
    })?;
    let got = sha256_file(path)?;
    if got != want {
        let _ = std::fs::remove_file(path);
        return Err(format!(
            "Fichier LoRA corrompu ou hash incorrect pour {} (attendu {want}, obtenu {got}). Le fichier a été retiré. La génération standard sans LoRA reste disponible.",
            path.display()
        ));
    }
    Ok(())
}

/// Opt-in download into the user cache (LoRA packs). Requires CC BY-NC acceptance.
/// Never called by the first-build installer. Verifies SHA-256 when the catalog provides one.
#[tauri::command]
pub async fn download_cache_file(req: DownloadCacheFileRequest) -> Result<String, String> {
    let settings = load_settings()?;
    if !settings.cc_by_nc_accepted {
        return Err(
            "Accepter CC BY-NC 4.0 avant tout téléchargement optionnel de LoRA.".into(),
        );
    }
    let rel = req.relative_cache_path.replace('\\', "/");
    if !rel.starts_with("models/lora/") || rel.contains("..") {
        return Err("Chemin cache invalide (models/lora/… uniquement).".into());
    }
    if !(req.url.starts_with("https://huggingface.co/")
        || req.url.starts_with("https://hf.co/"))
    {
        return Err("URL refusée : hôte Hugging Face uniquement.".into());
    }

    let dest = PathBuf::from(&settings.cache_dir).join(&rel);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    if dest.is_file() {
        if let Some(ref expected) = req.expected_sha256 {
            verify_cache_file_sha256(&dest, expected)?;
        }
        return Ok(dest.display().to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&req.url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement échoué : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Téléchargement HTTP {} pour {} — pack absent ou inaccessible. La génération standard sans LoRA reste disponible.",
            resp.status(),
            req.url
        ));
    }
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Lecture réponse : {e}"))?;
    let tmp = dest.with_extension("part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    if let Some(ref expected) = req.expected_sha256 {
        if let Err(e) = verify_cache_file_sha256(&dest, expected) {
            return Err(e);
        }
    }
    Ok(dest.display().to_string())
}

#[tauri::command]
pub fn list_generations(id: String) -> Result<Vec<GenerationSummary>, String> {
    let folder = project_folder(&id).join("generations");
    if !folder.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&folder)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let req_path = entry.path().join("request.json");
        let res_path = entry.path().join("result.json");
        if !req_path.exists() {
            continue;
        }
        let req: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(req_path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        let (state, has_score, semantic_truncated) = if res_path.exists() {
            let res: serde_json::Value = serde_json::from_str(
                &std::fs::read_to_string(&res_path).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            let st = res
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let score = entry.path().join("score.abc").exists();
            (
                st,
                score,
                res.get("semanticTruncated").and_then(|v| v.as_bool()),
            )
        } else {
            let job_state = serde_json::from_slice::<serde_json::Value>(
                &std::fs::read(entry.path().join("job.json")).unwrap_or_default(),
            ).ok().and_then(|j| j.get("state").and_then(|v| v.as_str()).map(str::to_string))
                .unwrap_or_else(|| "interrupted".into());
            (job_state, false, None)
        };
        let gen_id = req
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let audio = entry.path().join("audio.wav");
        let semantic_frames = std::fs::read(entry.path().join("semantic.json"))
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Vec<u32>>(&bytes).ok());
        out.push(GenerationSummary {
            id: gen_id,
            created_at: req
                .get("createdAt")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            seed: req.get("seed").and_then(|v| v.as_u64()).unwrap_or(0),
            cot: req
                .get("cot")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .into(),
            state,
            has_score,
            parent_generation_id: req
                .get("parentGenerationId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            audio_path: if audio.is_file() {
                Some(audio.display().to_string())
            } else {
                None
            },
            semantic_truncated,
            can_continue: semantic_truncated == Some(true)
                && semantic_frames.as_ref().is_some_and(|frames| {
                    !frames.is_empty() && frames.iter().all(|&frame| frame < 32768)
                }),
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn read_score_abc(id: String, gen_id: String) -> Result<Option<String>, String> {
    let path = project_folder(&id)
        .join("generations")
        .join(gen_id)
        .join("score.abc");
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(
        std::fs::read_to_string(path).map_err(|e| e.to_string())?,
    ))
}

#[tauri::command]
pub fn save_score(
    id: String,
    document: serde_json::Value,
) -> Result<(ProjectDoc, String), String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let scores_dir = folder.join("scores");
    ensure_dir(&scores_dir).map_err(|e| e.to_string())?;
    let score_id = next_folder_id(&scores_dir, "score-v")?;
    let path = scores_dir.join(format!("{score_id}.json"));
    let mut payload = document;
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("schema".into(), json!(SCHEMA_SCORE));
        obj.insert("schemaVersion".into(), json!(SCHEMA_VERSION));
        obj.insert("id".into(), json!(&score_id));
    }
    atomic_write_json(&path, &payload)?;
    doc.active_score_id = Some(score_id.clone());
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    Ok((doc, score_id))
}

#[tauri::command]
pub fn load_score(id: String) -> Result<Option<serde_json::Value>, String> {
    let folder = project_folder(&id);
    let doc = load_project(&folder)?;
    let Some(score_id) = doc.active_score_id else {
        return Ok(None);
    };
    let path = folder.join("scores").join(format!("{score_id}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(value))
}

#[tauri::command]
pub fn clear_score(id: String) -> Result<ProjectDoc, String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    doc.active_score_id = None;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    Ok(doc)
}

#[tauri::command]
pub fn list_scores(id: String) -> Result<Vec<ScoreSummary>, String> {
    let folder = project_folder(&id).join("scores");
    if !folder.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(&folder)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let value: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| e.to_string())?;
        let score_id = value
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if score_id.is_empty() {
            continue;
        }
        let note_count = value
            .get("voices")
            .and_then(|v| v.as_array())
            .map(|voices| {
                voices
                    .iter()
                    .map(|voice| {
                        voice
                            .get("notes")
                            .and_then(|n| n.as_array())
                            .map(|a| a.len() as u32)
                            .unwrap_or(0)
                    })
                    .sum()
            })
            .unwrap_or(0);
        out.push(ScoreSummary {
            id: score_id,
            parent_score_id: value
                .get("parentScoreId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            branch_name: value
                .get("branchName")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            version: value
                .get("version")
                .and_then(|v| v.as_u64())
                .unwrap_or(1) as u32,
            source: value
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("manual")
                .to_string(),
            note_count,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn load_score_version(
    id: String,
    score_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let path = project_folder(&id)
        .join("scores")
        .join(format!("{score_id}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    Ok(Some(value))
}

#[tauri::command]
pub fn set_active_score(id: String, score_id: String) -> Result<ProjectDoc, String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let path = folder.join("scores").join(format!("{score_id}.json"));
    if !path.exists() {
        return Err("Partition introuvable.".into());
    }
    doc.active_score_id = Some(score_id);
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    Ok(doc)
}

#[tauri::command]
pub fn use_generation(id: String, gen_id: String) -> Result<ProjectDoc, String> {
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let gen_dir = folder.join("generations").join(&gen_id);
    if !gen_dir.exists() {
        return Err("Génération introuvable.".into());
    }
    doc.active_generation_id = Some(gen_id);
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(doc)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImportPayload {
    pub remote_job_id: String,
    pub audio_base64: String,
    pub audio_sha256: String,
    pub score_abc: Option<String>,
    pub score_sha256: Option<String>,
    pub endpoint_base_url: String,
    pub payload_sha256: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImportResult {
    pub project: ProjectDoc,
    pub generation_id: String,
}

/// Import a remote worker WAV/score into a local gen-* folder with provenance (#65).
#[tauri::command]
pub fn import_remote_generation(
    id: String,
    payload: RemoteImportPayload,
) -> Result<RemoteImportResult, String> {
    use base64::Engine;
    let folder = project_folder(&id);
    let mut doc = load_project(&folder)?;
    let gens = folder.join("generations");
    ensure_dir(&gens).map_err(|e| e.to_string())?;
    let gen_id = next_folder_id(&gens, "gen-")?;
    let gen_dir = gens.join(&gen_id);
    ensure_dir(&gen_dir).map_err(|e| e.to_string())?;

    let wav_bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.audio_base64.as_bytes())
        .map_err(|e| format!("Décodage WAV distant: {e}"))?;
    if wav_bytes.len() < 12
        || &wav_bytes[0..4] != b"RIFF"
        || &wav_bytes[8..12] != b"WAVE"
    {
        return Err("Artefact distant : octets reçus sans en-tête WAV RIFF/WAVE.".into());
    }
    let out_wav = gen_dir.join("audio.wav");
    std::fs::write(&out_wav, &wav_bytes).map_err(|e| e.to_string())?;
    let audio_sha = sha256_file(&out_wav)?;
    let expected = payload.audio_sha256.trim().to_ascii_lowercase();
    if !expected.is_empty() && expected != audio_sha {
        let _ = std::fs::remove_dir_all(&gen_dir);
        return Err(format!(
            "Checksum audio distant incorrect : attendu {expected}, obtenu {audio_sha}."
        ));
    }

    let score = if let Some(abc) = payload.score_abc.as_ref().filter(|s| !s.trim().is_empty()) {
        let score_path = gen_dir.join("score.abc");
        std::fs::write(&score_path, abc).map_err(|e| e.to_string())?;
        let score_sha = sha256_file(&score_path)?;
        if let Some(exp) = payload.score_sha256.as_ref().filter(|s| !s.trim().is_empty()) {
            if exp.trim().to_ascii_lowercase() != score_sha {
                let _ = std::fs::remove_dir_all(&gen_dir);
                return Err(format!(
                    "Checksum score distant incorrect : attendu {}, obtenu {score_sha}.",
                    exp.trim().to_ascii_lowercase()
                ));
            }
        }
        json!({ "path": "score.abc", "sha256": score_sha })
    } else {
        json!({ "path": "score.abc", "sha256": null })
    };

    let duration = wav_duration_ms(&out_wav).unwrap_or(0);
    let finished = now_iso();
    let result = json!({
        "schema": SCHEMA_GEN_RESULT,
        "schemaVersion": SCHEMA_VERSION,
        "id": gen_id,
        "state": "generated",
        "decode": "unsupported",
        "startedAt": finished,
        "finishedAt": finished,
        "audio": {
            "path": "audio.wav",
            "sampleRate": SAMPLE_RATE,
            "channels": CHANNELS,
            "durationMs": duration,
            "sha256": audio_sha
        },
        "score": score,
        "provenance": {
            "source": "remote_worker",
            "remoteJobId": payload.remote_job_id,
            "endpointBaseUrl": payload.endpoint_base_url,
            "payloadSha256": payload.payload_sha256
        },
        "error": null
    });
    atomic_write_json(&gen_dir.join("result.json"), &result)?;
    atomic_write_json(
        &gen_dir.join("job.json"),
        &json!({
            "id": gen_id,
            "projectId": id,
            "kind": "remote_yue2_generate",
            "remoteJobId": payload.remote_job_id,
            "state": "succeeded",
            "updatedAt": finished,
        }),
    )?;
    write_checksums(&gen_dir)?;

    doc.active_generation_id = Some(gen_id.clone());
    doc.active_separation_id = None;
    doc.active_mix_id = None;
    doc.updated_at = finished;
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(RemoteImportResult {
        project: doc,
        generation_id: gen_id,
    })
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
    let current: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
    )
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
    let current: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(&path).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    entry.0.push(current);
    atomic_write_json(&path, &next)?;
    let mix: MixDoc = serde_json::from_value(next).map_err(|e| e.to_string())?;
    Ok(Some(mix))
}

fn write_checksums(dir: &Path) -> Result<(), String> {
    let mut map = BTreeMap::new();
    for entry in walkdir::WalkDir::new(dir).max_depth(1) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "checksums.json" {
                continue;
            }
            map.insert(name, sha256_file(entry.path())?);
        }
    }
    atomic_write_json(&dir.join("checksums.json"), &map)
}

fn find_stem_file(dir: &Path, role: &str) -> Result<PathBuf, String> {
    let role_l = role.to_lowercase();
    for entry in walkdir::WalkDir::new(dir).max_depth(2) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.contains(&role_l) && name.ends_with(".wav") && !name.contains("48000") {
            return Ok(entry.path().to_path_buf());
        }
    }
    Err(format!(
        "Stem inconnu ou manquant après séparation : {role}"
    ))
}

fn normalize_stem_separator(raw: &str) -> &'static str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "bs_roformer" | "bs-roformer" | "bsroformer" => "bs_roformer",
        "htdemucs_6s" | "htdemucs-6s" | "htdemucs6s" => "htdemucs_6s",
        _ => "htdemucs",
    }
}

/// BS-RoFormer emits `instrumental.wav` — copy/alias so find_stem_file("other") works.
fn alias_instrumental_to_other(sep_dir: &Path) -> Result<(), String> {
    let instrumental = find_stem_file(sep_dir, "instrumental").ok();
    let other_exists = find_stem_file(sep_dir, "other").is_ok();
    if let Some(src) = instrumental {
        if !other_exists {
            let dest = sep_dir.join("other.wav");
            std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    ensure_dir(dst)?;
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            ensure_dir(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                ensure_dir(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Artefacts résolus pour une continuation mid-song (`semantic_prefix_file`).
#[derive(Debug)]
pub(crate) struct ResolvedSemanticPrefix {
    pub semantic_path: PathBuf,
    pub frame_count: usize,
    pub token_ceiling: usize,
    /// Score ABC du parent, chargé si `cot != "off"` et qu'aucun ABC n'était fourni.
    pub parent_score_abc: Option<String>,
}

/// Gate desktop pour `continuationGenerationId` : exige `result.json` +
/// `semantic.json`, `semanticTruncated=true`, et un préfixe sous le plafond YuE2.
pub(crate) fn resolve_semantic_prefix_for_continuation(
    parent_dir: &Path,
    parent_id: &str,
    cot: &str,
    existing_abc: Option<&str>,
) -> Result<ResolvedSemanticPrefix, String> {
    let suffix = parent_id.strip_prefix("gen-").unwrap_or("");
    if suffix.is_empty() || !suffix.chars().all(|c| c.is_ascii_digit()) {
        return Err("Identifiant de génération parent invalide.".into());
    }
    let semantic = parent_dir.join("semantic.json");
    if !parent_dir.join("result.json").is_file() || !semantic.is_file() {
        return Err(
            "Cette génération n’a pas d’artefact sémantique utilisable pour continuer.".into(),
        );
    }
    let parent_result: serde_json::Value = serde_json::from_slice(
        &std::fs::read(parent_dir.join("result.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if parent_result
        .get("semanticTruncated")
        .and_then(|v| v.as_bool())
        != Some(true)
    {
        return Err("La continuation est réservée aux générations tronquées.".into());
    }

    let mut parent_score_abc = None;
    if cot != "off" {
        let mut abc = existing_abc.map(str::to_string).filter(|s| !s.is_empty());
        if abc.is_none() {
            let score_path = parent_dir.join("score.abc");
            if score_path.is_file() {
                abc = Some(std::fs::read_to_string(score_path).map_err(|e| e.to_string())?);
            }
        }
        if abc.is_none() {
            return Err(
                "Cette continuation en mode mélodie nécessite le score ABC de la prise source."
                    .into(),
            );
        }
        if existing_abc.map(str::trim).filter(|s| !s.is_empty()).is_none() {
            parent_score_abc = abc;
        }
    }

    let prefix: Vec<u32> = serde_json::from_slice(
        &std::fs::read(&semantic).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Tokens de continuation invalides : {e}"))?;
    let frame_count = prefix.len();
    let token_ceiling = (SEMANTIC_MAX_DURATION_SEC * SEMANTIC_HZ) as usize;
    if frame_count >= token_ceiling {
        return Err("Cette prise a déjà atteint la durée maximale prévue pour YuE2.".into());
    }
    Ok(ResolvedSemanticPrefix {
        semantic_path: semantic,
        frame_count,
        token_ceiling,
        parent_score_abc,
    })
}

#[cfg(test)]
mod continuation_tests {
    use super::*;
    use std::fs;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-continuation-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_parent_gen(
        root: &Path,
        truncated: bool,
        with_semantic: bool,
        with_score: bool,
        frames: &[u32],
    ) {
        let gen = root.join("generations").join("gen-001");
        fs::create_dir_all(&gen).unwrap();
        fs::write(
            gen.join("result.json"),
            serde_json::json!({
                "state": "complete",
                "semanticTruncated": truncated
            })
            .to_string(),
        )
        .unwrap();
        if with_semantic {
            fs::write(gen.join("semantic.json"), serde_json::to_string(frames).unwrap()).unwrap();
        }
        if with_score {
            fs::write(gen.join("score.abc"), "X:1\nK:C\nC").unwrap();
        }
    }

    #[test]
    fn accepts_truncated_generation_with_semantic_json() {
        let root = temp_dir("ok");
        write_parent_gen(&root, true, true, true, &[1, 2, 3, 4]);
        let parent = root.join("generations").join("gen-001");
        let resolved =
            resolve_semantic_prefix_for_continuation(&parent, "gen-001", "full", None).unwrap();
        assert_eq!(resolved.frame_count, 4);
        assert_eq!(resolved.semantic_path, parent.join("semantic.json"));
        assert!(resolved.parent_score_abc.is_some());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_when_semantic_json_missing() {
        let root = temp_dir("missing-semantic");
        write_parent_gen(&root, true, false, true, &[]);
        let parent = root.join("generations").join("gen-001");
        let err =
            resolve_semantic_prefix_for_continuation(&parent, "gen-001", "full", None).unwrap_err();
        assert!(err.contains("artefact sémantique"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn refuses_when_source_generation_is_not_truncated() {
        let root = temp_dir("not-truncated");
        write_parent_gen(&root, false, true, true, &[10, 20]);
        let parent = root.join("generations").join("gen-001");
        let err =
            resolve_semantic_prefix_for_continuation(&parent, "gen-001", "melody", None)
                .unwrap_err();
        assert!(err.contains("tronquées"));
        let _ = fs::remove_dir_all(root);
    }
}

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

// --- LoRA NAR training (#61) ---

#[tauri::command]
pub fn lora_train_probe() -> Result<crate::lora_train::TrainerProbeResult, String> {
    crate::lora_train::probe_trainer()
}

#[tauri::command]
pub fn lora_train_probe_audio(path: String) -> Result<crate::lora_train::AudioProbeResult, String> {
    crate::lora_train::probe_audio(path)
}

#[tauri::command]
pub fn lora_train_jobs_root() -> Result<String, String> {
    crate::lora_train::jobs_root_path()
}

#[tauri::command]
pub fn lora_train_write_text(path: String, data: String) -> Result<(), String> {
    crate::lora_train::write_text(path, data)
}

#[tauri::command]
pub fn lora_train_read_text(path: String) -> Result<Option<String>, String> {
    crate::lora_train::read_text(path)
}

#[tauri::command]
pub fn lora_train_path_exists(path: String) -> Result<bool, String> {
    crate::lora_train::path_exists(path)
}

#[tauri::command]
pub fn lora_train_mkdir(path: String) -> Result<(), String> {
    crate::lora_train::mkdir(path)
}

#[tauri::command]
pub fn lora_train_remove(path: String) -> Result<(), String> {
    crate::lora_train::remove_path(path)
}

#[tauri::command]
pub fn lora_train_launch(
    state: tauri::State<'_, AppState>,
    args: crate::lora_train::LaunchTrainerArgs,
) -> Result<crate::lora_train::LaunchTrainerResult, String> {
    crate::lora_train::launch_trainer(&state.lora_train_jobs, args)
}

#[tauri::command]
pub fn lora_train_poll(
    state: tauri::State<'_, AppState>,
    job_id: String,
) -> Result<crate::lora_train::LaunchTrainerResult, String> {
    crate::lora_train::poll_trainer(&state.lora_train_jobs, job_id)
}

#[tauri::command]
pub fn lora_train_cancel_process(
    state: tauri::State<'_, AppState>,
    job_id: String,
) -> Result<crate::lora_train::LaunchTrainerResult, String> {
    crate::lora_train::cancel_trainer(&state.lora_train_jobs, job_id)
}

// --- Project sync (#62) ---

#[tauri::command]
pub fn project_sync_list_artifacts(
    project_id: String,
) -> Result<Vec<crate::project_sync::SyncArtifactMeta>, String> {
    crate::project_sync::list_project_artifacts(project_id)
}

#[tauri::command]
pub fn project_sync_read_bytes(
    project_id: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    crate::project_sync::read_project_bytes(project_id, relative_path)
}

#[tauri::command]
pub fn project_sync_write_bytes(
    project_id: String,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    crate::project_sync::write_project_bytes(project_id, relative_path, bytes)
}

#[tauri::command]
pub fn project_sync_fs_root() -> Result<String, String> {
    crate::project_sync::sync_fs_root()
}

#[tauri::command]
pub fn project_sync_fs_write(
    root: String,
    project_id: String,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    crate::project_sync::sync_fs_write(root, project_id, relative_path, bytes)
}

#[tauri::command]
pub fn project_sync_fs_read(
    root: String,
    project_id: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    crate::project_sync::sync_fs_read(root, project_id, relative_path)
}

#[tauri::command]
pub fn project_sync_fs_list(
    root: String,
    project_id: String,
) -> Result<Vec<crate::project_sync::SyncArtifactMeta>, String> {
    crate::project_sync::sync_fs_list(root, project_id)
}

#[tauri::command]
pub fn project_sync_fs_delete(root: String, project_id: String) -> Result<(), String> {
    crate::project_sync::sync_fs_delete_project(root, project_id)
}
