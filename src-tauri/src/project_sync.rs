//! Project sync host helpers — list/pack project artifacts and filesystem sync root.

use crate::hashutil::sha256_file;
use crate::library::project_folder;
use crate::paths::{ensure_dir, project_sync_fs_root};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncArtifactMeta {
    pub relative_path: String,
    pub content_sha256: String,
    pub byte_length: u64,
}

const EXCLUDED_PREFIXES: &[&str] = &["settings", "tokens", "cache", "lora-cache", ".sync-key"];

fn should_include(rel: &str) -> bool {
    let lower = rel.replace('\\', "/").to_ascii_lowercase();
    if EXCLUDED_PREFIXES
        .iter()
        .any(|p| lower.starts_with(p) || lower.contains(&format!("/{p}")))
    {
        return false;
    }
    // Secrets / credentials patterns
    if lower.contains("token") || lower.contains("secret") || lower.contains("credential") {
        return false;
    }
    true
}

fn walk_artifacts(root: &Path, dir: &Path, out: &mut Vec<SyncArtifactMeta>) -> Result<(), String> {
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if path.is_dir() {
            walk_artifacts(root, &path, out)?;
            continue;
        }
        if !should_include(&rel) {
            continue;
        }
        let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
        let sha = sha256_file(&path)?;
        out.push(SyncArtifactMeta {
            relative_path: rel,
            content_sha256: sha,
            byte_length: meta.len(),
        });
    }
    Ok(())
}

pub fn list_project_artifacts(project_id: String) -> Result<Vec<SyncArtifactMeta>, String> {
    let folder = project_folder(&project_id);
    if !folder.is_dir() {
        return Err(format!("Projet introuvable : {project_id}"));
    }
    let mut out = Vec::new();
    walk_artifacts(&folder, &folder, &mut out)?;
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

pub fn read_project_bytes(project_id: String, relative_path: String) -> Result<Vec<u8>, String> {
    let rel = relative_path.replace('\\', "/");
    if rel.contains("..") || Path::new(&rel).is_absolute() {
        return Err("Chemin relatif invalide.".into());
    }
    if !should_include(&rel) {
        return Err("Artefact exclu de la synchro (secrets/cache).".into());
    }
    let path = project_folder(&project_id).join(&rel);
    std::fs::read(&path).map_err(|e| e.to_string())
}

pub fn write_project_bytes(
    project_id: String,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let rel = relative_path.replace('\\', "/");
    if rel.contains("..") || Path::new(&rel).is_absolute() {
        return Err("Chemin relatif invalide.".into());
    }
    if !should_include(&rel) {
        return Err("Artefact exclu de la synchro (secrets/cache).".into());
    }
    let path = project_folder(&project_id).join(&rel);
    if let Some(parent) = path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

pub fn sync_fs_root() -> Result<String, String> {
    let root = project_sync_fs_root();
    ensure_dir(&root).map_err(|e| e.to_string())?;
    Ok(root.display().to_string())
}

pub fn sync_fs_write(
    root: String,
    project_id: String,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let rel = relative_path.replace('\\', "/");
    if rel.contains("..") {
        return Err("Chemin relatif invalide.".into());
    }
    let base = PathBuf::from(root).join(&project_id);
    let path = base.join(&rel);
    if let Some(parent) = path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

pub fn sync_fs_read(
    root: String,
    project_id: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    let rel = relative_path.replace('\\', "/");
    if rel.contains("..") {
        return Err("Chemin relatif invalide.".into());
    }
    let path = PathBuf::from(root).join(&project_id).join(&rel);
    std::fs::read(&path).map_err(|e| e.to_string())
}

pub fn sync_fs_list(root: String, project_id: String) -> Result<Vec<SyncArtifactMeta>, String> {
    let base = PathBuf::from(root).join(&project_id);
    if !base.is_dir() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    walk_artifacts(&base, &base, &mut out)?;
    out.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(out)
}

pub fn sync_fs_delete_project(root: String, project_id: String) -> Result<(), String> {
    let root_path = PathBuf::from(root);
    let base = root_path.join(&project_id);
    if base.is_dir() {
        std::fs::remove_dir_all(&base).map_err(|e| e.to_string())?;
    }
    // Tombstone marker
    let tomb = root_path.join(format!("{project_id}.tombstone"));
    std::fs::write(&tomb, format!("{}\n", chrono::Utc::now().to_rfc3339()))
        .map_err(|e| e.to_string())?;
    Ok(())
}
