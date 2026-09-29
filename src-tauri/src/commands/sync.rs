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
