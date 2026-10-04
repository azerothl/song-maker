//! Import JSON, file persistante et exécution série (#368).
//! Capacité GPU admise = 1 (file `JobQueue` exclusive). Pas de pool audiocpp isolé.

use super::AppState;
use crate::batch::{
    batch_snapshot, export_ready_results, list_batch_summaries, load_live_tasks, load_manifest,
    parse_batch_bytes, patch_manifest, persist_new_batch, plan_batch, save_task, task_to_form,
    BatchError, BatchOptionSet, PendingImport, PlannedTask, ADMITTED_PARALLEL, EXAMPLE_JSON,
    MAX_FILE_BYTES,
};
use crate::commands::generation::start_generation;
use crate::commands::projects::{create_project, save_project_form};
use crate::library::{
    library_row_from_project, load_project, project_folder, save_project, upsert_library_row,
};
use crate::models::CreateProjectInput;
use crate::paths::atomic_write_json;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchPreviewOverrides {
    pub generations: Option<u32>,
    pub max_parallel_generations: Option<u32>,
}

fn emit_batch(app: &AppHandle, batch_id: &str, snapshot: &serde_json::Value) {
    let _ = app.emit("batch-updated", snapshot);
    let _ = app.emit(
        "batch-task-updated",
        json!({ "batchId": batch_id, "revision": snapshot.get("revision") }),
    );
}

fn validate_ok(preview: crate::batch::BatchPreview) -> serde_json::Value {
    json!({
        "ok": true,
        "preview": preview,
        "admittedParallel": ADMITTED_PARALLEL,
    })
}

fn validate_err(errors: Vec<BatchError>) -> serde_json::Value {
    json!({
        "ok": false,
        "errors": errors,
        "admittedParallel": ADMITTED_PARALLEL,
    })
}

fn store_pending(
    state: &AppState,
    file: crate::batch::BatchFile,
    raw: String,
    preview: crate::batch::BatchPreview,
) {
    let token = preview.start_token.clone();
    let mut pending = state.pending_batches.lock().expect("pending batches");
    pending.insert(
        token,
        PendingImport {
            file,
            input_raw: raw,
            preview,
        },
    );
}

#[tauri::command]
pub fn download_batch_example(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .set_file_name("example.batch.json")
        .add_filter("JSON", &["json"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, EXAMPLE_JSON).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
pub fn validate_batch_import(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(json!({ "ok": false, "cancelled": true }));
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let raw = std::fs::read(&path).map_err(|e| e.to_string())?;
    if raw.len() as u64 > MAX_FILE_BYTES {
        return Ok(json!({
            "ok": false,
            "errors": [{ "path": "$", "messageFr": "Fichier trop volumineux (plafond 10 Mio)." }],
        }));
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("lot")
        .to_string();
    match parse_batch_bytes(&raw, &stem) {
        Err(errors) => Ok(validate_err(errors)),
        Ok(file) => match plan_batch(&file, None, None) {
            Err(errors) => Ok(validate_err(errors)),
            Ok(preview) => {
                let raw_text = String::from_utf8(raw).map_err(|e| e.to_string())?;
                let out = validate_ok(preview.clone());
                store_pending(&state, file, raw_text, preview);
                Ok(out)
            }
        },
    }
}

#[tauri::command]
pub fn update_batch_preview(
    state: tauri::State<'_, AppState>,
    start_token: String,
    overrides: BatchPreviewOverrides,
) -> Result<serde_json::Value, String> {
    let pending = {
        let g = state.pending_batches.lock().expect("pending batches");
        g.get(&start_token)
            .cloned()
            .ok_or_else(|| "Aperçu périmé. Réimportez le fichier.".to_string())?
    };
    let ov = BatchOptionSet {
        generations: overrides.generations,
        ..BatchOptionSet::default()
    };
    match plan_batch(&pending.file, Some(&ov), overrides.max_parallel_generations) {
        Err(errors) => Ok(validate_err(errors)),
        Ok(mut preview) => {
            preview.revision = pending.preview.revision.saturating_add(1);
            let out = validate_ok(preview.clone());
            state
                .pending_batches
                .lock()
                .expect("pending batches")
                .remove(&start_token);
            store_pending(&state, pending.file, pending.input_raw, preview);
            Ok(out)
        }
    }
}

fn assign_projects(tasks: &mut [PlannedTask]) -> Result<(), String> {
    let mut projects: HashMap<String, String> = HashMap::new();
    for task in tasks.iter_mut() {
        if let Some(existing) = projects.get(&task.song_id) {
            task.project_id = Some(existing.clone());
            continue;
        }
        let doc = create_project(CreateProjectInput {
            title: task.title.clone(),
        })?;
        let form = task_to_form(task);
        let _ = save_project_form(doc.id.clone(), form)?;
        projects.insert(task.song_id.clone(), doc.id.clone());
        task.project_id = Some(doc.id);
    }
    Ok(())
}

fn spawn_runner(app: AppHandle, state: &AppState, batch_id: String) {
    let mut inflight = state.batch_inflight.lock().expect("batch inflight");
    if !inflight.insert(batch_id.clone()) {
        return;
    }
    drop(inflight);
    tauri::async_runtime::spawn(async move {
        run_batch_loop(app.clone(), batch_id.clone()).await;
        if let Some(state) = app.try_state::<AppState>() {
            state
                .batch_inflight
                .lock()
                .expect("batch inflight")
                .remove(&batch_id);
        }
    });
}

#[tauri::command]
pub async fn start_batch(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    start_token: String,
    revision: u32,
) -> Result<serde_json::Value, String> {
    {
        let started = state.started_batch_tokens.lock().expect("started tokens");
        if let Some(id) = started.get(&start_token) {
            return Ok(json!({ "batchId": id, "idempotent": true }));
        }
    }
    let pending = {
        let mut g = state.pending_batches.lock().expect("pending batches");
        g.remove(&start_token)
            .ok_or_else(|| "Aperçu périmé. Réimportez le fichier.".to_string())?
    };
    if pending.preview.revision != revision {
        return Err("Aperçu périmé (révision différente). Recalculez le plan.".into());
    }
    if !pending.preview.can_launch {
        return Err(pending
            .preview
            .launch_block_fr
            .unwrap_or_else(|| "Lancement bloqué : capacité GPU insuffisante.".into()));
    }
    let mut tasks = pending.preview.tasks.clone();
    assign_projects(&mut tasks)?;
    let batch_id = persist_new_batch(&pending.preview, &pending.input_raw, &tasks)?;
    state
        .started_batch_tokens
        .lock()
        .expect("started tokens")
        .insert(start_token, batch_id.clone());
    spawn_runner(app.clone(), &state, batch_id.clone());
    let snap = batch_snapshot(&batch_id)?;
    emit_batch(&app, &batch_id, &snap);
    Ok(json!({ "batchId": batch_id, "idempotent": false }))
}

#[tauri::command]
pub fn list_batches() -> Result<Vec<serde_json::Value>, String> {
    let mut out = Vec::new();
    for man in list_batch_summaries()? {
        let Some(id) = man.get("batchId").and_then(|v| v.as_str()) else {
            continue;
        };
        if let Ok(snap) = batch_snapshot(id) {
            out.push(snap);
        } else {
            out.push(man);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn get_batch_status(batch_id: String) -> Result<serde_json::Value, String> {
    batch_snapshot(&batch_id)
}

#[tauri::command]
pub fn pause_batch(app: AppHandle, batch_id: String) -> Result<serde_json::Value, String> {
    patch_manifest(&batch_id, |man| {
        man["pauseRequested"] = json!(true);
        man["state"] = json!("pausing");
    })?;
    let snap = batch_snapshot(&batch_id)?;
    emit_batch(&app, &batch_id, &snap);
    Ok(snap)
}

#[tauri::command]
pub async fn resume_batch(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    batch_id: String,
) -> Result<serde_json::Value, String> {
    patch_manifest(&batch_id, |man| {
        man["pauseRequested"] = json!(false);
        man["cancelRequested"] = json!(false);
        man["state"] = json!("running");
    })?;
    spawn_runner(app.clone(), &state, batch_id.clone());
    let snap = batch_snapshot(&batch_id)?;
    emit_batch(&app, &batch_id, &snap);
    Ok(snap)
}

#[tauri::command]
pub fn cancel_batch(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    batch_id: String,
) -> Result<serde_json::Value, String> {
    patch_manifest(&batch_id, |man| {
        man["cancelRequested"] = json!(true);
        man["state"] = json!("cancelling");
    })?;
    let mut tasks = load_live_tasks(&batch_id)?;
    for task in &mut tasks {
        if matches!(task.state.as_str(), "queued" | "retry_wait") {
            task.state = "cancelled".into();
            save_task(&batch_id, task)?;
        } else if matches!(task.state.as_str(), "running" | "preparing" | "publishing") {
            task.state = "cancel_requested".into();
            save_task(&batch_id, task)?;
            let _ = state.queue.request_cancel();
        }
    }
    let snap = batch_snapshot(&batch_id)?;
    emit_batch(&app, &batch_id, &snap);
    Ok(snap)
}

#[tauri::command]
pub fn cancel_batch_task(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    batch_id: String,
    task_id: String,
) -> Result<serde_json::Value, String> {
    let mut tasks = load_live_tasks(&batch_id)?;
    let Some(task) = tasks.iter_mut().find(|t| t.task_id == task_id) else {
        return Err(format!("Tâche inconnue : {task_id}"));
    };
    match task.state.as_str() {
        "queued" | "retry_wait" => {
            task.state = "cancelled".into();
            save_task(&batch_id, task)?;
        }
        "running" | "preparing" | "publishing" => {
            task.state = "cancel_requested".into();
            save_task(&batch_id, task)?;
            let _ = state.queue.request_cancel();
        }
        _ => {}
    }
    let snap = batch_snapshot(&batch_id)?;
    emit_batch(&app, &batch_id, &snap);
    Ok(json!({ "task": task, "batch": snap }))
}

#[tauri::command]
pub async fn retry_batch_tasks(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    batch_id: String,
    task_ids: Vec<String>,
) -> Result<serde_json::Value, String> {
    let mut tasks = load_live_tasks(&batch_id)?;
    for task in &mut tasks {
        if task_ids.contains(&task.task_id)
            && matches!(task.state.as_str(), "failed" | "interrupted")
        {
            task.state = "queued".into();
            task.last_error = None;
            task.attempt = task.attempt.saturating_add(1);
            save_task(&batch_id, task)?;
        }
    }
    patch_manifest(&batch_id, |man| {
        man["pauseRequested"] = json!(false);
        man["cancelRequested"] = json!(false);
        man["state"] = json!("running");
    })?;
    spawn_runner(app.clone(), &state, batch_id.clone());
    let snap = batch_snapshot(&batch_id)?;
    emit_batch(&app, &batch_id, &snap);
    Ok(snap)
}

#[tauri::command]
pub fn export_batch_results(app: AppHandle, batch_id: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let dest = picked.into_path().map_err(|e| e.to_string())?;
    let out = export_ready_results(&batch_id, &dest)?;
    Ok(Some(out.display().to_string()))
}

fn is_transient(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("mémoire")
        || lower.contains("memory")
        || lower.contains("oom")
        || lower.contains("timeout")
        || lower.contains("connexion")
        || lower.contains("connection")
        || lower.contains("worker")
        || lower.contains("refus de connexion")
}

async fn run_batch_loop(app: AppHandle, batch_id: String) {
    loop {
        let Ok(man) = load_manifest(&batch_id) else {
            break;
        };
        let cancel = man
            .get("cancelRequested")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let pause = man
            .get("pauseRequested")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let Ok(mut tasks) = load_live_tasks(&batch_id) else {
            break;
        };
        let on_error = load_plan_on_error(&batch_id);
        let retry_max = load_plan_retry_max(&batch_id);

        if cancel {
            for task in &mut tasks {
                if matches!(task.state.as_str(), "queued" | "retry_wait") {
                    task.state = "cancelled".into();
                    let _ = save_task(&batch_id, task);
                }
            }
            let still_active = tasks
                .iter()
                .any(|t| matches!(t.state.as_str(), "running" | "preparing" | "publishing"));
            if !still_active {
                let _ = patch_manifest(&batch_id, |m| {
                    m["state"] = json!("cancelled");
                    m["cancelRequested"] = json!(false);
                });
                if let Ok(snap) = batch_snapshot(&batch_id) {
                    emit_batch(&app, &batch_id, &snap);
                }
                break;
            }
        }

        if pause && !cancel {
            let still_active = tasks
                .iter()
                .any(|t| matches!(t.state.as_str(), "running" | "preparing" | "publishing"));
            if !still_active {
                let _ = patch_manifest(&batch_id, |m| {
                    m["state"] = json!("paused");
                });
                if let Ok(snap) = batch_snapshot(&batch_id) {
                    emit_batch(&app, &batch_id, &snap);
                }
                break;
            }
        }

        let next = tasks.iter().position(|t| t.state == "queued");
        let Some(idx) = next else {
            finalize_batch(&batch_id, &tasks);
            if let Ok(snap) = batch_snapshot(&batch_id) {
                emit_batch(&app, &batch_id, &snap);
            }
            break;
        };
        if pause || cancel {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            continue;
        }

        let mut task = tasks[idx].clone();
        if let Err(e) = run_one_task(&app, &batch_id, &mut task).await {
            task.last_error = Some(e.clone());
            let attempts_used = task.attempt.max(1);
            if is_transient(&e) && attempts_used < retry_max {
                let wait = 2u64.saturating_pow(attempts_used.min(4));
                task.state = "retry_wait".into();
                let _ = save_task(&batch_id, &task);
                tokio::time::sleep(std::time::Duration::from_secs(wait)).await;
                if task.state == "retry_wait" {
                    task.attempt = attempts_used.saturating_add(1);
                    task.state = "queued".into();
                    let _ = save_task(&batch_id, &task);
                }
            } else {
                task.state = "failed".into();
                let _ = save_task(&batch_id, &task);
                if on_error == "pause" {
                    let _ = patch_manifest(&batch_id, |m| {
                        m["pauseRequested"] = json!(true);
                        m["state"] = json!("pausing");
                    });
                }
            }
        }
        if let Ok(snap) = batch_snapshot(&batch_id) {
            emit_batch(&app, &batch_id, &snap);
        }
    }
}

fn load_plan_on_error(batch_id: &str) -> String {
    crate::batch::load_plan(batch_id)
        .ok()
        .and_then(|p| {
            p.get("onError")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "continue".into())
}

fn load_plan_retry_max(batch_id: &str) -> u32 {
    crate::batch::load_plan(batch_id)
        .ok()
        .and_then(|p| p.get("retryMaxAttempts").and_then(|v| v.as_u64()))
        .unwrap_or(1) as u32
}

fn finalize_batch(batch_id: &str, tasks: &[PlannedTask]) {
    let failed = tasks.iter().any(|t| {
        matches!(
            t.state.as_str(),
            "failed" | "interrupted" | "cancelled" | "cancel_requested"
        )
    });
    let cancel = load_manifest(batch_id)
        .ok()
        .and_then(|m| m.get("cancelRequested").and_then(|v| v.as_bool()))
        .unwrap_or(false);
    let state = if cancel {
        "cancelled"
    } else if failed {
        "completed_with_errors"
    } else {
        "completed"
    };
    let _ = patch_manifest(batch_id, |m| {
        m["state"] = json!(state);
        m["pauseRequested"] = json!(false);
        m["cancelRequested"] = json!(false);
    });
}

async fn run_one_task(
    app: &AppHandle,
    batch_id: &str,
    task: &mut PlannedTask,
) -> Result<(), String> {
    let Some(project_id) = task.project_id.clone() else {
        return Err("Projet manquant pour la tâche.".into());
    };
    if task.attempt == 0 {
        task.attempt = 1;
    }
    task.state = "preparing".into();
    save_task(batch_id, task)?;
    let form = task_to_form(task);
    let state = app.state::<AppState>();
    task.state = "running".into();
    save_task(batch_id, task)?;
    let result = start_generation(
        state,
        project_id.clone(),
        form,
        None,
        None,
        None,
        None,
        None,
    )
    .await;
    let live = load_live_tasks(batch_id).unwrap_or_default();
    let cancelled = live
        .iter()
        .find(|t| t.task_id == task.task_id)
        .is_some_and(|t| t.state == "cancel_requested");
    match result {
        Ok(doc) => {
            let gen_id = doc.active_generation_id.clone();
            if cancelled {
                task.state = "cancelled".into();
                task.generation_id = gen_id;
                save_task(batch_id, task)?;
                return Ok(());
            }
            task.state = "publishing".into();
            if let Some(ref gid) = gen_id {
                tag_generation_request(&project_id, gid, batch_id, task);
            }
            task.generation_id = gen_id;
            task.state = "succeeded".into();
            task.last_error = None;
            save_task(batch_id, task)?;
            restore_smallest_active(batch_id, &task.song_id, &project_id);
            Ok(())
        }
        Err(e) if e == "cancelled" || cancelled => {
            task.state = "cancelled".into();
            save_task(batch_id, task)?;
            Ok(())
        }
        Err(e) => Err(e),
    }
}

fn tag_generation_request(
    project_id: &str,
    generation_id: &str,
    batch_id: &str,
    task: &PlannedTask,
) {
    let path = project_folder(project_id)
        .join("generations")
        .join(generation_id)
        .join("request.json");
    let Ok(text) = std::fs::read_to_string(&path) else {
        return;
    };
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return;
    };
    value["parentGenerationId"] = json!(null);
    value["batch"] = json!({
        "batchId": batch_id,
        "songId": task.song_id,
        "taskId": task.task_id,
        "variantIndex": task.variant_index,
        "attempt": task.attempt,
    });
    let _ = atomic_write_json(&path, &value);
}

fn restore_smallest_active(batch_id: &str, song_id: &str, project_id: &str) {
    let Ok(tasks) = load_live_tasks(batch_id) else {
        return;
    };
    let Some(best) = tasks
        .iter()
        .filter(|t| t.song_id == song_id && t.state == "succeeded" && t.generation_id.is_some())
        .min_by_key(|t| t.variant_index)
    else {
        return;
    };
    let folder = project_folder(project_id);
    let Ok(mut doc) = load_project(&folder) else {
        return;
    };
    doc.active_generation_id = best.generation_id.clone();
    let _ = save_project(&folder, &doc);
    let _ = upsert_library_row(&library_row_from_project(&folder, &doc));
}
