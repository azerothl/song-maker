use super::AppState;

#[tauri::command]
pub async fn transcribe_basicpitch(
    _state: tauri::State<'_, AppState>,
    id: String,
    track_id: String,
) -> Result<crate::basicpitch::BasicPitchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::basicpitch::transcribe_track(&id, &track_id)
    })
    .await
    .map_err(|error| error.to_string())?
}
