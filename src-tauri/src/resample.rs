//! Rééchantillonnage FFmpeg + libsoxr (precision=28).

use std::path::Path;
use std::process::Command;

pub fn resample_soxr(input: &Path, output: &Path, target_rate: u32) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        crate::paths::ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let filter = format!("aresample=resampler=soxr:precision=28:osr={target_rate}");
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            &input.display().to_string(),
            "-af",
            &filter,
            "-c:a",
            "pcm_f32le",
            &output.display().to_string(),
        ])
        .status()
        .map_err(|e| {
            format!(
                "ffmpeg introuvable ou échec ({e}). Installez ffmpeg lié à libsoxr."
            )
        })?;
    if !status.success() {
        return Err(format!(
            "ffmpeg a échoué pour {} → {} (soxr {target_rate})",
            input.display(),
            output.display()
        ));
    }
    Ok(())
}

/// Stub documenté : même contrat, pour tests sans ffmpeg — copie refusée.
pub fn resample_stub_unavailable() -> Result<(), String> {
    Err(
        "Stub soxr : utilisez ffmpeg -af aresample=resampler=soxr:precision=28 (chemin FFmpeg)."
            .into(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stub_is_explicit() {
        assert!(resample_stub_unavailable().is_err());
    }
}
