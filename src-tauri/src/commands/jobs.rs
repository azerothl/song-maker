use super::AppState;
use crate::models::*;

#[tauri::command]
pub fn get_job_status(state: tauri::State<'_, AppState>) -> JobStatus {
    state.queue.status()
}

#[tauri::command]
pub fn cancel_job(state: tauri::State<'_, AppState>) -> bool {
    state.queue.request_cancel()
}
