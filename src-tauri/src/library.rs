use crate::models::{AppSettings, LibraryRow, ProjectDoc};
use crate::paths::{atomic_write_json, ensure_dir, library_db_path, projects_root, settings_path};
use crate::pins::*;
use rusqlite::{params, Connection};
use std::path::{Path, PathBuf};

pub fn open_library() -> Result<Connection, String> {
    let path = library_db_path();
    if let Some(parent) = path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            folder_path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            duration_ms INTEGER,
            status TEXT NOT NULL,
            cot TEXT NOT NULL,
            active_generation_id TEXT
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn upsert_library_row(row: &LibraryRow) -> Result<(), String> {
    let conn = open_library()?;
    conn.execute(
        "INSERT INTO project (id, title, folder_path, created_at, updated_at, duration_ms, status, cot, active_generation_id)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,
           folder_path=excluded.folder_path,
           updated_at=excluded.updated_at,
           duration_ms=excluded.duration_ms,
           status=excluded.status,
           cot=excluded.cot,
           active_generation_id=excluded.active_generation_id",
        params![
            row.id,
            row.title,
            row.folder_path,
            row.created_at,
            row.updated_at,
            row.duration_ms,
            row.status,
            row.cot,
            row.active_generation_id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_library_row(id: &str) -> Result<(), String> {
    let conn = open_library()?;
    conn.execute("DELETE FROM project WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_library(query: Option<String>) -> Result<Vec<LibraryRow>, String> {
    let conn = open_library()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, folder_path, created_at, updated_at, duration_ms, status, cot, active_generation_id
             FROM project ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(LibraryRow {
                id: r.get(0)?,
                title: r.get(1)?,
                folder_path: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                duration_ms: r.get(5)?,
                status: r.get(6)?,
                cot: r.get(7)?,
                active_generation_id: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        if let Some(ref q) = query {
            if !row.title.to_lowercase().contains(&q.to_lowercase()) {
                continue;
            }
        }
        out.push(row);
    }

    if out.is_empty() {
        // Rebuild from folders if DB empty
        rebuild_from_disk()?;
        return list_library_only(query);
    }
    Ok(out)
}

fn list_library_only(query: Option<String>) -> Result<Vec<LibraryRow>, String> {
    let conn = open_library()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, folder_path, created_at, updated_at, duration_ms, status, cot, active_generation_id
             FROM project ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(LibraryRow {
                id: r.get(0)?,
                title: r.get(1)?,
                folder_path: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
                duration_ms: r.get(5)?,
                status: r.get(6)?,
                cot: r.get(7)?,
                active_generation_id: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        if let Some(ref q) = query {
            if !row.title.to_lowercase().contains(&q.to_lowercase()) {
                continue;
            }
        }
        out.push(row);
    }
    Ok(out)
}

pub fn rebuild_from_disk() -> Result<(), String> {
    let root = projects_root();
    if !root.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(&root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let project_json = entry.path().join("project.json");
        if project_json.exists() {
            let text = std::fs::read_to_string(&project_json).map_err(|e| e.to_string())?;
            let doc: ProjectDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            if doc.schema_version != SCHEMA_VERSION {
                continue;
            }
            let row = LibraryRow {
                id: doc.id.clone(),
                title: doc.title.clone(),
                folder_path: entry.path().display().to_string(),
                created_at: doc.created_at.clone(),
                updated_at: doc.updated_at.clone(),
                duration_ms: None,
                status: "empty".into(),
                cot: doc.cot.clone(),
                active_generation_id: doc.active_generation_id.clone(),
            };
            upsert_library_row(&row)?;
        }
    }
    Ok(())
}

pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if path.exists() {
        let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        return serde_json::from_str(&text).map_err(|e| e.to_string());
    }
    let defaults = default_settings();
    save_settings(&defaults)?;
    Ok(defaults)
}

pub fn default_settings() -> AppSettings {
    let cache = crate::paths::default_cache_dir();
    let archive = crate::paths::pinned_archive_name();
    let sha = if cfg!(target_os = "windows") {
        ARCHIVE_WINDOWS_SHA
    } else {
        ARCHIVE_LINUX_SHA
    };
    AppSettings {
        projects_dir: projects_root().display().to_string(),
        cache_dir: cache.display().to_string(),
        binary_tag: AUDIOCPP_TAG.into(),
        binary_archive: archive.into(),
        binary_sha256: sha.into(),
        model_pack: "q8".into(),
        model_gguf: YUE2_Q8.into(),
        model_sha256: YUE2_Q8_SHA.into(),
        server_host: DEFAULT_HOST.into(),
        server_port: DEFAULT_PORT,
        output_device: None,
    }
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    atomic_write_json(&settings_path(), settings)
}

pub fn project_folder(id: &str) -> PathBuf {
    projects_root().join(id)
}

pub fn load_project(folder: &Path) -> Result<ProjectDoc, String> {
    let path = folder.join("project.json");
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let doc: ProjectDoc = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if doc.schema != SCHEMA_PROJECT || doc.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "schemaVersion inconnu ou schema invalide: {}",
            doc.schema_version
        ));
    }
    Ok(doc)
}

pub fn save_project(folder: &Path, doc: &ProjectDoc) -> Result<(), String> {
    atomic_write_json(&folder.join("project.json"), doc)
}
