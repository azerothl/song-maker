use crate::pins::{
    ARCHIVE_LINUX, ARCHIVE_LINUX_SHA, ARCHIVE_MACOS_ARM64, ARCHIVE_MACOS_ARM64_SHA,
    ARCHIVE_MACOS_X64, ARCHIVE_MACOS_X64_SHA, ARCHIVE_WINDOWS, ARCHIVE_WINDOWS_CUDART,
    ARCHIVE_WINDOWS_CUDART_SHA, ARCHIVE_WINDOWS_SHA,
};
use dirs::{cache_dir, document_dir, home_dir};
use std::path::{Path, PathBuf};

pub fn song_maker_documents() -> PathBuf {
    if let Ok(dir) = std::env::var("SONG_MAKER_DOCUMENTS_DIR") {
        return PathBuf::from(dir);
    }
    let base = document_dir()
        .or_else(home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("Song Maker")
}

pub fn legacy_projects_root() -> PathBuf {
    song_maker_documents().join("projects")
}

pub fn legacy_library_db_path() -> PathBuf {
    song_maker_documents().join("library.sqlite")
}

pub fn projects_root() -> PathBuf {
    if crate::profiles::try_active_projects_root().is_some() {
        crate::profiles::active_projects_root()
    } else {
        legacy_projects_root()
    }
}

pub fn library_db_path() -> PathBuf {
    if crate::profiles::try_active_projects_root().is_some() {
        crate::profiles::active_library_db_path()
    } else {
        legacy_library_db_path()
    }
}

pub fn settings_path() -> PathBuf {
    song_maker_documents().join("settings.json")
}

pub fn default_cache_dir() -> PathBuf {
    cache_dir()
        .unwrap_or_else(|| {
            home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".cache")
        })
        .join("song-maker")
}

pub fn binaries_dir(cache: &Path) -> PathBuf {
    cache.join("binaries").join(crate::pins::AUDIOCPP_TAG)
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

pub fn bs_roformer_path(cache: &Path) -> PathBuf {
    cache
        .join("models")
        .join("bs_roformer")
        .join(crate::pins::BS_ROFORMER_GGUF)
}

pub fn mel_band_roformer_path(cache: &Path) -> PathBuf {
    cache
        .join("models")
        .join("mel_band_roformer")
        .join(crate::pins::MEL_BAND_ROFORMER_GGUF)
}

/// Opt-in SheetSage2 GGUF (hors installeur) — `sheetsage2-orig.gguf`.
pub fn sheetsage2_weights_path(cache: &Path) -> PathBuf {
    cache
        .join("models")
        .join("SheetSage2-GGUF")
        .join(crate::pins::SHEETSAGE2_GGUF)
}

/// Opt-in ACE-Step 1.5 Turbo BF16 weights (hors installeur).
pub fn ace_step_weights_path(cache: &Path) -> PathBuf {
    cache
        .join("models")
        .join("ACE-Step1.5-GGUF")
        .join("turbo")
        .join(crate::pins::ACE_STEP_GGUF)
}

pub fn ace_step_weights_present(cache: &Path) -> bool {
    let path = ace_step_weights_path(cache);
    matches!(std::fs::metadata(path), Ok(meta) if meta.is_file() && meta.len() == crate::pins::ACE_STEP_BYTES)
}

pub fn sheetsage2_weights_present(cache: &Path) -> bool {
    let path = sheetsage2_weights_path(cache);
    path.is_file()
        && std::fs::metadata(&path)
            .map(|m| m.len() == crate::pins::SHEETSAGE2_BYTES)
            .unwrap_or(false)
}

/// Persistent NAR LoRA training jobs (Documents/Song Maker/training-jobs).
pub fn training_jobs_root() -> PathBuf {
    song_maker_documents().join("training-jobs")
}

/// Optional project-sync filesystem root (Documents/Song Maker/sync).
pub fn project_sync_fs_root() -> PathBuf {
    song_maker_documents().join("sync")
}

pub fn demucs_onnx_venv(cache: &Path) -> PathBuf {
    cache.join("tools").join("demucs-onnx")
}

pub fn demucs_onnx_cli(cache: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        demucs_onnx_venv(cache)
            .join("Scripts")
            .join("demucs-onnx.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        demucs_onnx_venv(cache).join("bin").join("demucs-onnx")
    }
}

pub fn demucs_onnx_python(cache: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        demucs_onnx_venv(cache).join("Scripts").join("python.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        demucs_onnx_venv(cache).join("bin").join("python")
    }
}

pub fn demucs_onnx_model_cache(cache: &Path) -> PathBuf {
    cache.join("models").join("demucs-onnx")
}

pub fn bs_roformer_weights_present(cache: &Path) -> bool {
    let path = bs_roformer_path(cache);
    matches!(std::fs::metadata(&path), Ok(meta) if meta.is_file() && meta.len() == crate::pins::BS_ROFORMER_BYTES)
}

pub fn mel_band_roformer_weights_present(cache: &Path) -> bool {
    let path = mel_band_roformer_path(cache);
    matches!(std::fs::metadata(&path), Ok(meta) if meta.is_file() && meta.len() == crate::pins::MEL_BAND_ROFORMER_BYTES)
}

pub fn pinned_archive_name() -> &'static str {
    if cfg!(target_os = "windows") {
        ARCHIVE_WINDOWS
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        ARCHIVE_MACOS_ARM64
    } else if cfg!(target_os = "macos") {
        ARCHIVE_MACOS_X64
    } else {
        ARCHIVE_LINUX
    }
}

pub fn pinned_archive_sha256() -> &'static str {
    if cfg!(target_os = "windows") {
        ARCHIVE_WINDOWS_SHA
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        ARCHIVE_MACOS_ARM64_SHA
    } else if cfg!(target_os = "macos") {
        ARCHIVE_MACOS_X64_SHA
    } else {
        ARCHIVE_LINUX_SHA
    }
}

/// Archive runtime CUDA Windows (DLL à côté du binaire). `None` hors Windows.
pub fn pinned_cudart_archive() -> Option<(&'static str, &'static str)> {
    if cfg!(target_os = "windows") {
        Some((ARCHIVE_WINDOWS_CUDART, ARCHIVE_WINDOWS_CUDART_SHA))
    } else {
        None
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

/// Best-effort ISO timestamp from filesystem mtime (Versions timeline, #133).
pub fn file_mtime_iso(path: &Path) -> Option<String> {
    let modified = path.metadata().ok()?.modified().ok()?;
    let datetime: chrono::DateTime<chrono::Utc> = modified.into();
    Some(datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string())
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
