use crate::pins::{ARCHIVE_LINUX, ARCHIVE_WINDOWS};
use dirs::{cache_dir, document_dir, home_dir};
use std::path::{Path, PathBuf};

pub fn song_maker_documents() -> PathBuf {
    let base = document_dir()
        .or_else(home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Song Maker")
}

pub fn projects_root() -> PathBuf {
    song_maker_documents().join("projects")
}

pub fn library_db_path() -> PathBuf {
    song_maker_documents().join("library.sqlite")
}

pub fn settings_path() -> PathBuf {
    song_maker_documents().join("settings.json")
}

pub fn default_cache_dir() -> PathBuf {
    cache_dir()
        .unwrap_or_else(|| home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".cache"))
        .join("song-maker")
}

pub fn binaries_dir(cache: &Path) -> PathBuf {
    cache.join("binaries").join("v0.8.1")
}

pub fn yue2_dir(cache: &Path) -> PathBuf {
    cache.join("models").join("Yue2-3B-GGUF")
}

pub fn htdemucs_path(cache: &Path) -> PathBuf {
    cache
        .join("models")
        .join("htdemucs")
        .join(crate::pins::HTDEMUCS_GGUF)
}

pub fn pinned_archive_name() -> &'static str {
    if cfg!(target_os = "windows") {
        ARCHIVE_WINDOWS
    } else {
        ARCHIVE_LINUX
    }
}

pub fn ensure_dir(path: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(path)
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_dir(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

pub fn atomic_write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    atomic_write(path, format!("{text}\n").as_bytes()).map_err(|e| e.to_string())
}

pub fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub fn next_folder_id(parent: &Path, prefix: &str) -> Result<String, String> {
    ensure_dir(parent).map_err(|e| e.to_string())?;
    let mut max = 0u32;
    for entry in std::fs::read_dir(parent).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let stem = name.strip_suffix(".json").unwrap_or(&name);
        if let Some(rest) = stem.strip_prefix(prefix) {
            if let Ok(n) = rest.parse::<u32>() {
                max = max.max(n);
            }
        }
    }
    Ok(format!("{prefix}{:03}", max + 1))
}
