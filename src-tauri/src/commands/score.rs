use crate::abc_metadata::AbcAlignRequest;
use crate::library::{load_project, project_folder, save_project};
use crate::models::*;
use crate::paths::{atomic_write_json, ensure_dir, file_mtime_iso, next_folder_id, now_iso};
use crate::pins::*;
use serde_json::json;

#[tauri::command]
pub fn read_score_abc(id: String, gen_id: String) -> Result<Option<String>, String> {
    let folder = project_folder(&id);
    let path = folder.join("generations").join(gen_id).join("score.abc");
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc = load_project(&folder)?;
    let align = AbcAlignRequest::from_form(doc.tempo_bpm, doc.key.clone(), doc.meter.clone());
    let aligned = crate::abc_metadata::align_abc_headers(&raw, &align);
    // Persist alignment for older takes so Partition ABC stays consistent (#106).
    if aligned != raw {
        let _ = std::fs::write(&path, &aligned);
    }
    Ok(Some(aligned))
}

#[tauri::command]
pub fn save_score(id: String, document: serde_json::Value) -> Result<(ProjectDoc, String), String> {
    let folder = project_folder(&id);
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
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
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
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
        let value: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
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
        let created_at = value
            .get("createdAt")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| file_mtime_iso(&path));
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
            version: value.get("version").and_then(|v| v.as_u64()).unwrap_or(1) as u32,
            source: value
                .get("source")
                .and_then(|v| v.as_str())
                .unwrap_or("manual")
                .to_string(),
            note_count,
            created_at,
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
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
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
