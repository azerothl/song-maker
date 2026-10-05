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

/// A file left by a failed or cancelled job is not a published take.
pub(crate) fn published_generation_wav(
    folder: &std::path::Path,
    gen_id: &str,
) -> Result<std::path::PathBuf, String> {
    let suffix = gen_id.strip_prefix("gen-").unwrap_or("");
    if suffix.is_empty() || !suffix.bytes().all(|b| b.is_ascii_digit()) {
        return Err("Identifiant de prise invalide.".into());
    }
    let dir = folder.join("generations").join(gen_id);
    let result: serde_json::Value = serde_json::from_slice(
        &std::fs::read(dir.join("result.json"))
            .map_err(|_| "Cette prise n’est pas terminée.".to_string())?,
    )
    .map_err(|_| "Le résultat de cette prise est illisible.".to_string())?;
    if result["state"] != "generated" || result["audio"]["path"] != "audio.wav" {
        return Err(
            "Cette prise n’a pas de résultat audio utilisable. Le morceau reste inchangé.".into(),
        );
    }
    let wav = dir.join("audio.wav");
    let reader = hound::WavReader::open(&wav)
        .map_err(|_| "Le fichier audio de cette prise est illisible.".to_string())?;
    if reader.spec().sample_rate == 0 || reader.spec().channels == 0 || reader.duration() == 0 {
        return Err("Le fichier audio de cette prise est vide.".into());
    }
    // Compare the publication hash without decoding every sample again when
    // selecting a long take. Generation/import already validates the samples.
    let sha = crate::hashutil::sha256_file(&wav)?;
    if result["audio"]["sha256"].as_str() != Some(sha.as_str()) {
        return Err(
            "Le fichier audio de cette prise a changé ou est incomplet. Le morceau reste inchangé."
                .into(),
        );
    }
    Ok(wav)
}

#[cfg(test)]
mod published_take_tests {
    use super::*;
    #[test]
    fn unpublished_audio_cannot_be_imported() {
        let root = std::env::temp_dir().join(format!("take-publish-{}", uuid::Uuid::new_v4()));
        let dir = root.join("generations/gen-001");
        std::fs::create_dir_all(&dir).unwrap();
        let wav = dir.join("audio.wav");
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&wav, spec).unwrap();
        for _ in 0..1600 {
            writer.write_sample(0i16).unwrap();
        }
        writer.finalize().unwrap();
        let sha = crate::hashutil::sha256_file(&wav).unwrap();
        for state in ["cancelled", "failed", "interrupted", "generating"] {
            std::fs::write(
                dir.join("result.json"),
                serde_json::json!({"state":state,"audio":{"path":"audio.wav","sha256":sha}})
                    .to_string(),
            )
            .unwrap();
            assert!(published_generation_wav(&root, "gen-001").is_err());
        }
        std::fs::write(
            dir.join("result.json"),
            serde_json::json!({"state":"generated","audio":{"path":"audio.wav","sha256":sha}})
                .to_string(),
        )
        .unwrap();
        assert_eq!(published_generation_wav(&root, "gen-001").unwrap(), wav);
        assert!(published_generation_wav(&root, "../gen-001").is_err());
        std::fs::write(&wav, b"partial audio").unwrap();
        assert!(published_generation_wav(&root, "gen-001").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
