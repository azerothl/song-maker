use crate::hashutil::sha256_file;
use crate::paths::{atomic_write_json, ensure_dir};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub(crate) fn write_checksums(dir: &Path) -> Result<(), String> {
    let mut map = BTreeMap::new();
    for entry in walkdir::WalkDir::new(dir).max_depth(1) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "checksums.json" {
                continue;
            }
            map.insert(name, sha256_file(entry.path())?);
        }
    }
    atomic_write_json(&dir.join("checksums.json"), &map)
}

pub(crate) fn find_stem_file(dir: &Path, role: &str) -> Result<PathBuf, String> {
    let role_l = role.to_lowercase();
    for entry in walkdir::WalkDir::new(dir).max_depth(2) {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.contains(&role_l) && name.ends_with(".wav") && !name.contains("48000") {
            return Ok(entry.path().to_path_buf());
        }
    }
    Err(format!(
        "Stem inconnu ou manquant après séparation : {role}"
    ))
}

pub(crate) fn normalize_stem_separator(raw: &str) -> &'static str {
    match raw.trim().to_ascii_lowercase().as_str() {
        "bs_roformer" | "bs-roformer" | "bsroformer" => "bs_roformer",
        "mel_band_roformer" | "mel-band-roformer" | "melbandroformer" | "kim_vocal_2" => {
            "mel_band_roformer"
        }
        "htdemucs_6s" | "htdemucs-6s" | "htdemucs6s" => "htdemucs_6s",
        _ => "htdemucs",
    }
}

/// BS-RoFormer emits `instrumental.wav` — copy/alias so find_stem_file("other") works.
pub(crate) fn alias_instrumental_to_other(sep_dir: &Path) -> Result<(), String> {
    let instrumental = find_stem_file(sep_dir, "instrumental").ok();
    let other_exists = find_stem_file(sep_dir, "other").is_ok();
    if let Some(src) = instrumental {
        if !other_exists {
            let dest = sep_dir.join("other.wav");
            std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub(crate) fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    ensure_dir(dst)?;
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry?;
        let rel = entry.path().strip_prefix(src).unwrap();
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            ensure_dir(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                ensure_dir(parent)?;
            }
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}
