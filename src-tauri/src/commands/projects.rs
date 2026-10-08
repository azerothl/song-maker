use super::shared::copy_dir_all;
use crate::form::{validate_draft_form, validate_target_duration, validate_title};
use crate::library::{
    delete_library_row, library_row_from_project, list_library, load_project, project_folder,
    save_project, upsert_library_row,
};
use crate::models::*;
use crate::paths::{ensure_dir, now_iso, projects_root};
use crate::pins::*;
use uuid::Uuid;

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
        instrumental_mode: false,
        active_generation_id: None,
        active_separation_id: None,
        active_mix_id: None,
        active_score_id: None,
        generation_names: Default::default(),
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
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    let mut doc = load_project(&folder)?;
    doc.title = form.title.trim().to_string();
    doc.style = form.style.trim().to_string();
    doc.lyrics = form.lyrics.clone();
    doc.cot = form.cot.clone();
    doc.singing_language = form.singing_language.filter(|s| !s.trim().is_empty());
    doc.tempo_bpm = form.tempo_bpm;
    doc.key = form.key;
    doc.meter = form.meter;
    doc.target_duration_sec =
        validate_target_duration(form.target_duration_sec).map_err(|e| e.to_string())?;
    doc.prefer_full_lyrics = form.prefer_full_lyrics;
    doc.instrumental_mode = form.instrumental_mode;
    doc.updated_at = now_iso();
    save_project(&folder, &doc)?;
    upsert_library_row(&library_row_from_project(&folder, &doc))?;
    Ok(doc)
}

#[tauri::command]
pub fn rename_project(id: String, title: String) -> Result<ProjectDoc, String> {
    validate_title(&title).map_err(|e| e.to_string())?;
    let folder = project_folder(&id);
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
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
