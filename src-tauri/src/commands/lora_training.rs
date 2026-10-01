use super::AppState;

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
