use super::AppState;

#[tauri::command]
pub fn transcribe_basicpitch(
    _state: tauri::State<'_, AppState>,
    id: String,
    track_id: String,
) -> Result<crate::basicpitch::BasicPitchResult, String> {
    crate::basicpitch::transcribe_track(&id, &track_id)
}
