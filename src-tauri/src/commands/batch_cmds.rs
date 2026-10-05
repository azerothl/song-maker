//! Import JSON, persistent queue and isolated batch workers (#368).

use super::AppState;
use crate::batch::{
    batch_snapshot, batches_root, export_ready_results, list_batch_summaries, load_live_tasks,
    load_manifest, load_plan, parse_batch_bytes, patch_manifest, persist_new_batch, plan_batch,
    save_task, task_to_form, BatchError, BatchOptionSet, PendingImport, PlannedTask,
    ADMITTED_PARALLEL, EXAMPLE_JSON, MAX_FILE_BYTES,
};
use crate::commands::generation::generate_worker_take;
use crate::commands::projects::{create_project, save_project_form};
use crate::library::{
    library_row_from_project, load_project, load_settings, project_folder, save_project,
    upsert_library_row,
};
use crate::models::{AppSettings, CreateProjectInput};
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

pub(crate) fn resources_pinned() -> bool {
    list_batch_summaries()
        .map(|lots| {
            lots.iter().any(|lot| {
                matches!(
                    lot["state"].as_str(),
                    Some("running" | "pausing" | "paused" | "cancelling" | "interrupted")
                )
            })
        })
        .unwrap_or(true)
}

fn validate_ok(preview: crate::batch::BatchPreview) -> serde_json::Value {
    let admitted = preview.admitted_parallel;
    json!({
        "ok": true,
        "preview": preview,
        "admittedParallel": admitted,
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
                let preview = super::batch_capacity::apply_capacity(&state, preview);
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
            preview = super::batch_capacity::apply_capacity(&state, preview);
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
    let mut started = state.started_batch_tokens.lock().expect("started tokens");
    if let Some(id) = started.get(&start_token) {
        return Ok(json!({ "batchId": id, "idempotent": true }));
    }
    let pending = {
        let g = state.pending_batches.lock().expect("pending batches");
        g.get(&start_token)
            .cloned()
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
    let _preparation = state.batch_workers.prepare();
    let settings = load_settings()?;
    super::batch_capacity::verify_before_start(&state, &pending.preview)?;
    if !matches!(settings.generation_engine.as_str(), "yue2" | "ace_step") {
        return Err("Choisissez YuE2 ou ACE-Step dans Paramètres avant de lancer ce lot.".into());
    }
    let mut tasks = pending.preview.tasks.clone();
    for task in &tasks {
        crate::form::validate_form_for_engine(&task_to_form(task), &settings.generation_engine)
            .map_err(|error| format!("{} : {error}", task.title))?;
    }
    assign_projects(&mut tasks)?;
    let batch_id = persist_new_batch(&pending.preview, &pending.input_raw, &tasks)?;
    let mut plan = load_plan(&batch_id)?;
    plan["generationSettings"] = batch_generation_settings(&settings);
    plan["profileId"] = json!(crate::profiles::active_profile_id());
    if pending.preview.effective_parallel > 1 {
        plan["capacityKey"] = super::batch_capacity::capacity_key(&pending.preview)?;
    }
    atomic_write_json(&batches_root().join(&batch_id).join("plan.json"), &plan)?;
    started.insert(start_token.clone(), batch_id.clone());
    state
        .pending_batches
        .lock()
        .expect("pending batches")
        .remove(&start_token);
    drop(started);
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
    let tasks = load_live_tasks(&batch_id)?;
    if tasks.iter().any(|task| batch_task_pending(&task.state)) {
        patch_manifest(&batch_id, |man| {
            man["pauseRequested"] = json!(true);
            man["state"] = json!("pausing");
        })?;
    } else {
        finalize_batch(&batch_id, &tasks);
    }
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
        if matches!(task.state.as_str(), "queued" | "retry_wait" | "interrupted") {
            task.state = "cancelled".into();
            save_task(&batch_id, task)?;
        } else if matches!(task.state.as_str(), "running" | "preparing" | "publishing") {
            task.state = "cancel_requested".into();
            save_task(&batch_id, task)?;
            state.batch_workers.cancel(&batch_id, None);
        }
    }
    if !state
        .batch_inflight
        .lock()
        .expect("batch inflight")
        .contains(&batch_id)
    {
        finalize_batch(&batch_id, &load_live_tasks(&batch_id)?);
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
            state.batch_workers.cancel(&batch_id, Some(&task_id));
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
        || lower.contains("error sending request")
}

async fn run_batch_loop(app: AppHandle, batch_id: String) {
    let mut jobs = tokio::task::JoinSet::new();
    loop {
        let Ok(man) = load_manifest(&batch_id) else {
            break;
        };
        let cancel = man["cancelRequested"].as_bool().unwrap_or(false);
        let pause = man["pauseRequested"].as_bool().unwrap_or(false);
        let Ok(mut tasks) = load_live_tasks(&batch_id) else {
            break;
        };
        let state = app.state::<AppState>();
        let plan = load_plan(&batch_id).unwrap_or_default();
        let verified = super::batch_capacity::verified_for_plan(&state, &batch_id);
        let requested = plan["effectiveParallel"].as_u64().unwrap_or(1) as usize;
        let limit = if verified { requested.clamp(1, 2) } else { 1 };
        if man.get("effectiveParallel").and_then(|v| v.as_u64()) != Some(limit as u64) {
            let _ = patch_manifest(&batch_id, |m| {
                m["effectiveParallel"] = json!(limit);
                m["capacityReasonFr"] = if requested > limit {
                    json!("Une prise à la fois : la vérification pour deux prises simultanées n’est plus valable dans cette session.")
                } else {
                    plan["capacityReasonFr"].clone()
                };
            });
        }
        let capacity_lost = requested > limit && plan["parallelismPolicy"] == "requireRequested";
        if capacity_lost && !pause && !cancel {
            let _ = patch_manifest(&batch_id, |m| {
                m["pauseRequested"] = json!(true);
                m["state"] = json!("pausing");
                m["capacityReasonFr"] = json!("La simultanéité doit être vérifiée à nouveau avant de reprendre avec cette exigence.");
            });
        }
        if cancel {
            for task in &mut tasks {
                if matches!(task.state.as_str(), "queued" | "retry_wait") {
                    task.state = "cancelled".into();
                    let _ = save_task(&batch_id, task);
                }
            }
        }
        if !pause && !cancel && !capacity_lost {
            for task in tasks.iter_mut().filter(|t| t.state == "queued") {
                if jobs.len() >= limit {
                    break;
                }
                task.state = "preparing".into();
                if save_task(&batch_id, task).is_err() {
                    break;
                }
                let task = task.clone();
                let task_app = app.clone();
                let task_batch = batch_id.clone();
                jobs.spawn(async move {
                    run_attempt(task_app, task_batch, task).await;
                });
            }
        }
        if jobs.is_empty() {
            if cancel {
                finalize_batch(&batch_id, &tasks);
            } else if (pause || capacity_lost) && tasks.iter().any(|t| batch_task_pending(&t.state))
            {
                let _ = patch_manifest(&batch_id, |m| m["state"] = json!("paused"));
            } else {
                finalize_batch(&batch_id, &tasks);
            }
            if let Ok(snap) = batch_snapshot(&batch_id) {
                emit_batch(&app, &batch_id, &snap);
            }
            break;
        }
        if let Some(Err(error)) = jobs.join_next().await {
            let _ = patch_manifest(&batch_id, |m| {
                m["pauseRequested"] = json!(true);
                m["state"] = json!("pausing");
                m["error"] = json!(format!("Une tâche a été interrompue : {error}"));
            });
            let active_ids: Vec<_> = load_live_tasks(&batch_id)
                .unwrap_or_default()
                .into_iter()
                .filter(|task| task.state == "running" || task.state == "preparing")
                .collect();
            // Surviving workers drain before recovery marks their task states.
            while jobs.join_next().await.is_some() {}
            for mut task in active_ids {
                let current = load_live_tasks(&batch_id)
                    .unwrap_or_default()
                    .into_iter()
                    .find(|t| t.task_id == task.task_id);
                if current.is_some_and(|t| matches!(t.state.as_str(), "running" | "preparing")) {
                    task.state = "interrupted".into();
                    let _ = save_task(&batch_id, &task);
                }
            }
        }
        if let Ok(snap) = batch_snapshot(&batch_id) {
            emit_batch(&app, &batch_id, &snap);
        }
    }
    // Never drop a running worker future while its child process still owns GPU memory.
    while jobs.join_next().await.is_some() {}
}

async fn run_attempt(app: AppHandle, batch_id: String, mut task: PlannedTask) {
    if let Err(e) = run_one_task(&app, &batch_id, &mut task).await {
        task.last_error = Some(e.clone());
        let lower = e.to_lowercase();
        if lower.contains("oom") || lower.contains("out of memory") || lower.contains("mémoire") {
            *app.state::<AppState>()
                .batch_workers
                .proof
                .lock()
                .expect("capacity proof") = None;
            let _ = patch_manifest(&batch_id, |m| {
                m["effectiveParallel"] = json!(1);
                m["capacityReasonFr"] = json!(
                    "Mémoire insuffisante : une prise à la fois après la fin des tâches en cours."
                );
            });
        }
        let attempts_used = task.attempt.max(1);
        if is_transient(&e) && attempts_used < load_plan_retry_max(&batch_id) {
            task.state = "retry_wait".into();
            let _ = save_task(&batch_id, &task);
            tokio::time::sleep(std::time::Duration::from_secs(
                2u64.saturating_pow(attempts_used.min(4)),
            ))
            .await;
            let still_waiting = load_live_tasks(&batch_id)
                .ok()
                .and_then(|tasks| tasks.into_iter().find(|live| live.task_id == task.task_id))
                .is_some_and(|live| live.state == "retry_wait");
            let cancelled = load_manifest(&batch_id)
                .ok()
                .and_then(|m| m["cancelRequested"].as_bool())
                .unwrap_or(true);
            if still_waiting && !cancelled {
                task.attempt = attempts_used.saturating_add(1);
                task.state = "queued".into();
                let _ = save_task(&batch_id, &task);
            }
        } else {
            task.state = "failed".into();
            let _ = save_task(&batch_id, &task);
            if load_plan_on_error(&batch_id) == "pause" {
                let _ = patch_manifest(&batch_id, |m| {
                    m["pauseRequested"] = json!(true);
                    m["state"] = json!("pausing");
                });
            }
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
    let plan = load_plan(batch_id)?;
    let settings = load_settings()?;
    if plan.get("generationSettings") != Some(&batch_generation_settings(&settings))
        || plan.get("profileId") != Some(&json!(crate::profiles::active_profile_id()))
    {
        return Err("Les réglages du moteur ont changé depuis le lancement de ce lot, ou ce lot ancien ne les conserve pas. Rétablissez les réglages initiaux ou importez un nouveau lot.".into());
    }
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
    let verified = super::batch_capacity::verified_for_plan(&state, batch_id);
    let lease = state
        .batch_workers
        .acquire(&state, batch_id, &task.task_id, settings, verified)
        .await?;
    if verified && !super::batch_capacity::verified_for_plan(&state, batch_id) {
        task.state = "queued".into();
        save_task(batch_id, task)?;
        return Ok(());
    }
    // Cancellation/pause can arrive while this task waits for another lot or an
    // interactive job to release the GPU. Never start inference in that case.
    let live = load_live_tasks(batch_id)?;
    let cancelled = live
        .iter()
        .find(|t| t.task_id == task.task_id)
        .is_some_and(|t| matches!(t.state.as_str(), "cancelled" | "cancel_requested"));
    let manifest = load_manifest(batch_id)?;
    if cancelled || manifest["cancelRequested"].as_bool().unwrap_or(false) {
        task.state = "cancelled".into();
        save_task(batch_id, task)?;
        return Ok(());
    }
    if manifest["pauseRequested"].as_bool().unwrap_or(false) {
        task.state = "queued".into();
        save_task(batch_id, task)?;
        return Ok(());
    }
    task.state = "running".into();
    save_task(batch_id, task)?;
    let result = generate_worker_take(
        app.state::<AppState>(),
        project_id.clone(),
        form,
        &lease.worker,
    )
    .await;
    let live = load_live_tasks(batch_id).unwrap_or_default();
    let cancelled = live
        .iter()
        .find(|t| t.task_id == task.task_id)
        .is_some_and(|t| t.state == "cancel_requested");
    match result {
        Ok(result) => {
            let gen_id = Some(result.generation_id);
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
    let project_lock = crate::project_transaction::lock_for(&folder);
    let _project_guard = project_lock.lock();
    let Ok(mut doc) = load_project(&folder) else {
        return;
    };
    if !select_batch_default(&mut doc.active_generation_id, &best.generation_id) {
        return;
    }
    let _ = save_project(&folder, &doc);
    let _ = upsert_library_row(&library_row_from_project(&folder, &doc));
}

fn select_batch_default(active: &mut Option<String>, candidate: &Option<String>) -> bool {
    if active.is_some() || candidate.is_none() {
        return false;
    }
    *active = candidate.clone();
    true
}

fn batch_task_pending(state: &str) -> bool {
    matches!(
        state,
        "queued" | "retry_wait" | "preparing" | "running" | "publishing" | "cancel_requested"
    )
}

pub(crate) fn batch_generation_settings(settings: &AppSettings) -> serde_json::Value {
    // Only generation configuration is persisted; assistant credentials are excluded.
    json!({
        "engine": settings.generation_engine,
        "cacheDir": settings.cache_dir,
        "binaryTag": settings.binary_tag,
        "binaryArchive": settings.binary_archive,
        "binarySha256": settings.binary_sha256,
        "modelPack": settings.model_pack,
        "modelGguf": settings.model_gguf,
        "modelSha256": settings.model_sha256,
        "localYue2Enabled": settings.local_yue2_enabled,
        "arLora": settings.yue2_ar_lora,
        "narLora": settings.yue2_nar_lora,
        "arLoraScale": settings.yue2_ar_lora_scale,
        "narLoraScale": settings.yue2_nar_lora_scale,
    })
}

#[cfg(test)]
mod selection_tests {
    use super::{batch_generation_settings, batch_task_pending, select_batch_default};

    #[test]
    fn batch_configuration_tracks_generation_changes_only() {
        let mut settings = crate::library::default_settings();
        let original = batch_generation_settings(&settings);
        settings.mix_llm_provider = "external".into();
        assert_eq!(original, batch_generation_settings(&settings));
        settings.generation_engine = "ace_step".into();
        assert_ne!(original, batch_generation_settings(&settings));
        settings.generation_engine = "yue2".into();
        settings.yue2_ar_lora = Some("models/lora/another.gguf".into());
        assert_ne!(original, batch_generation_settings(&settings));
    }

    #[test]
    fn a_finished_batch_has_no_work_to_pause() {
        for state in ["succeeded", "failed", "cancelled", "interrupted"] {
            assert!(!batch_task_pending(state));
        }
        assert!(batch_task_pending("queued"));
        assert!(batch_task_pending("running"));
    }

    #[test]
    fn later_batch_results_preserve_the_user_selection() {
        let mut active = None;
        assert!(select_batch_default(&mut active, &Some("gen-001".into())));
        active = Some("gen-user-choice".into());
        assert!(!select_batch_default(&mut active, &Some("gen-002".into())));
        assert_eq!(active.as_deref(), Some("gen-user-choice"));
    }
}
