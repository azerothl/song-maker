use super::AppState;

#[tauri::command]
pub async fn transcribe_basicpitch(
    _state: tauri::State<'_, AppState>,
    id: String,
    track_id: String,
    options: Option<crate::basicpitch::ExtractionOptions>,
    mix_snapshot: Option<crate::models::MixDoc>,
) -> Result<crate::basicpitch::BasicPitchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::basicpitch::transcribe_track(&id, &track_id, options, mix_snapshot)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn discard_basicpitch_preview(id: String, preview_id: String) -> Result<(), String> {
    crate::basicpitch::discard_preview(&id, &preview_id)
}

/// Preserve the current (including unsaved) score and activate the extraction atomically.
#[tauri::command]
pub fn apply_basicpitch_score(
    id: String,
    expected_score_id: Option<String>,
    before_document: Option<serde_json::Value>,
    after_document: serde_json::Value,
) -> Result<(crate::models::ProjectDoc, String, Option<String>), String> {
    use crate::library::{load_project, project_folder, save_project};
    use crate::paths::{atomic_write_json, ensure_dir, next_folder_id, now_iso};
    let folder = project_folder(&id);
    let lock = crate::project_transaction::lock_for(&folder);
    let _guard = lock.lock();
    let mut project = load_project(&folder)?;
    if project.active_score_id != expected_score_id {
        return Err("La partition active a changé. Rouvrez l’aperçu avant d’appliquer.".into());
    }
    let mut after = after_document;
    if !after.is_object() || !after["voices"].is_array() || !after["noteExtraction"].is_object() {
        return Err("Aperçu de partition invalide.".into());
    }
    let scores = folder.join("scores");
    ensure_dir(&scores).map_err(|error| error.to_string())?;
    let before_document = match (before_document, expected_score_id.as_ref()) {
        (Some(document), _) => Some(document),
        (None, Some(score_id)) => {
            if !valid_score_id(score_id) {
                return Err("Identifiant de partition invalide.".into());
            }
            let bytes = std::fs::read(scores.join(format!("{score_id}.json")))
                .map_err(|e| e.to_string())?;
            Some(serde_json::from_slice(&bytes).map_err(|e| e.to_string())?)
        }
        _ => None,
    };
    let previous_id = if let Some(mut before) = before_document {
        if !before.is_object() || !before["voices"].is_array() {
            return Err("Partition précédente invalide.".into());
        }
        let previous_id = next_folder_id(&scores, "score-v")?;
        before["id"] = serde_json::json!(&previous_id);
        before["schema"] = serde_json::json!(crate::pins::SCHEMA_SCORE);
        before["schemaVersion"] = serde_json::json!(crate::pins::SCHEMA_VERSION);
        atomic_write_json(&scores.join(format!("{previous_id}.json")), &before)?;
        Some(previous_id)
    } else {
        None
    };
    let score_id = next_folder_id(&scores, "score-v")?;
    after["id"] = serde_json::json!(&score_id);
    after["schema"] = serde_json::json!(crate::pins::SCHEMA_SCORE);
    after["schemaVersion"] = serde_json::json!(crate::pins::SCHEMA_VERSION);
    after["parentScoreId"] = serde_json::json!(&previous_id);
    after["noteExtraction"]["previousScoreId"] = serde_json::json!(&previous_id);
    atomic_write_json(&scores.join(format!("{score_id}.json")), &after)?;
    project.active_score_id = Some(score_id.clone());
    project.updated_at = now_iso();
    save_project(&folder, &project)?;
    Ok((project, score_id, previous_id))
}

#[tauri::command]
pub fn undo_basicpitch_score(
    id: String,
    expected_score_id: String,
) -> Result<crate::models::ProjectDoc, String> {
    use crate::library::{load_project, project_folder, save_project};
    let folder = project_folder(&id);
    let lock = crate::project_transaction::lock_for(&folder);
    let _guard = lock.lock();
    let mut project = load_project(&folder)?;
    if !valid_score_id(&expected_score_id) {
        return Err("Identifiant de partition invalide.".into());
    }
    if project.active_score_id.as_deref() != Some(&expected_score_id) {
        return Err(
            "La partition active a changé. Actualisez le projet avant de la restaurer.".into(),
        );
    }
    // Only app-created score IDs can be restored, never arbitrary paths.
    let path = folder
        .join("scores")
        .join(format!("{expected_score_id}.json"));
    let current: serde_json::Value =
        serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let extraction = current
        .get("noteExtraction")
        .filter(|value| value.is_object())
        .ok_or_else(|| "Cette partition n’a pas d’extraction à annuler.".to_string())?;
    let previous = extraction
        .get("previousScoreId")
        .ok_or("Partition précédente inconnue.")?;
    project.active_score_id = if let Some(previous) = previous.as_str() {
        if !valid_score_id(previous)
            || !folder
                .join("scores")
                .join(format!("{previous}.json"))
                .is_file()
        {
            return Err("Partition précédente introuvable.".into());
        }
        Some(previous.to_string())
    } else if previous.is_null() {
        None
    } else {
        return Err("Partition précédente invalide.".into());
    };
    project.updated_at = crate::paths::now_iso();
    save_project(&folder, &project)?;
    Ok(project)
}

fn valid_score_id(value: &str) -> bool {
    value
        .strip_prefix("score-v")
        .is_some_and(|suffix| !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()))
}
