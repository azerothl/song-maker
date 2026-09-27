//! Rééchantillonnage FFmpeg + libsoxr (precision=28).

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

fn ffmpeg_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(custom) = std::env::var("SONG_MAKER_FFMPEG") {
        if !custom.trim().is_empty() {
            out.push(PathBuf::from(custom));
        }
    }
    out.push(PathBuf::from("ffmpeg"));
    #[cfg(windows)]
    {
        out.push(PathBuf::from("ffmpeg.exe"));
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            // winget ajoute un shim ici même si le PATH du processus GUI est figé
            let links = PathBuf::from(&local)
                .join(r"Microsoft\WinGet\Links\ffmpeg.exe");
            if links.is_file() {
                out.push(links);
            }
            // winget Gyan.FFmpeg et variantes courantes
            let winget = PathBuf::from(&local).join(r"Microsoft\WinGet\Packages");
            if winget.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&winget) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                        if !name.contains("ffmpeg") {
                            continue;
                        }
                        if let Ok(walk) = std::fs::read_dir(entry.path()) {
                            for sub in walk.flatten() {
                                let candidate = sub.path().join("bin").join("ffmpeg.exe");
                                if candidate.is_file() {
                                    out.push(candidate);
                                }
                                let nested = sub.path().join("ffmpeg.exe");
                                if nested.is_file() {
                                    out.push(nested);
                                }
                            }
                        }
                        let direct = entry.path().join("bin").join("ffmpeg.exe");
                        if direct.is_file() {
                            out.push(direct);
                        }
                    }
                }
            }
            out.push(
                PathBuf::from(&local)
                    .join("song-maker")
                    .join("bin")
                    .join("ffmpeg.exe"),
            );
        }
        if let Ok(pf) = std::env::var("ProgramFiles") {
            out.push(PathBuf::from(&pf).join("ffmpeg").join("bin").join("ffmpeg.exe"));
            out.push(PathBuf::from(&pf).join("FFmpeg").join("bin").join("ffmpeg.exe"));
        }
        out.push(PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"));
    }
    out
}

fn run_ffmpeg_version(bin: &Path) -> Option<String> {
    let mut cmd = Command::new(bin);
    cmd.arg("-hide_banner").arg("-version");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

fn ffmpeg_supports_soxr(bin: &Path) -> bool {
    let Some(version) = run_ffmpeg_version(bin) else {
        return false;
    };
    // Builds Gyan / BtbN listent souvent --enable-libsoxr dans la config.
    version.to_ascii_lowercase().contains("libsoxr")
        || version.to_ascii_lowercase().contains("soxr")
}

/// Chemin résolu une fois (PATH, SONG_MAKER_FFMPEG, emplacements Windows courants).
pub fn resolve_ffmpeg() -> Result<PathBuf, String> {
    static CACHED: OnceLock<PathBuf> = OnceLock::new();
    if let Some(path) = CACHED.get() {
        return Ok(path.clone());
    }
    let mut found_without_soxr: Option<PathBuf> = None;
    for candidate in ffmpeg_candidates() {
        let bin = if candidate.is_file() || candidate.components().count() == 1 {
            candidate
        } else {
            continue;
        };
        // "ffmpeg" sur le PATH : tester via spawn
        if bin.components().count() == 1 || bin.is_file() {
            if let Some(ver) = run_ffmpeg_version(&bin) {
                let lower = ver.to_ascii_lowercase();
                if lower.contains("libsoxr") || lower.contains("soxr") {
                    let resolved = if bin.components().count() == 1 {
                        which_ffmpeg().unwrap_or(bin)
                    } else {
                        bin
                    };
                    let _ = CACHED.set(resolved.clone());
                    return Ok(resolved);
                }
                found_without_soxr.get_or_insert(bin);
            }
        }
    }
    if let Some(bin) = found_without_soxr {
        return Err(format!(
            "ffmpeg trouvé ({}) mais sans libsoxr. Installez une build full (ex. winget install Gyan.FFmpeg) ou définissez SONG_MAKER_FFMPEG.",
            bin.display()
        ));
    }
    Err(
        "ffmpeg introuvable. Windows : winget install Gyan.FFmpeg — puis redémarrez Song Maker. Ou définissez SONG_MAKER_FFMPEG vers ffmpeg.exe."
            .into(),
    )
}

fn which_ffmpeg() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("where");
        cmd.arg("ffmpeg");
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        let output = cmd.output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let line = text.lines().next()?.trim();
        if line.is_empty() {
            return None;
        }
        Some(PathBuf::from(line))
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("which").arg("ffmpeg").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let line = String::from_utf8_lossy(&output.stdout);
        let line = line.lines().next()?.trim();
        if line.is_empty() {
            None
        } else {
            Some(PathBuf::from(line))
        }
    }
}

fn ffmpeg_command(bin: &Path) -> Command {
    let mut cmd = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn resample_soxr(input: &Path, output: &Path, target_rate: u32) -> Result<(), String> {
    if let Some(parent) = output.parent() {
        crate::paths::ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let ffmpeg = resolve_ffmpeg()?;
    let filter = format!("aresample=resampler=soxr:precision=28:osr={target_rate}");
    let status = ffmpeg_command(&ffmpeg)
        .args([
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            &input.display().to_string(),
            "-af",
            &filter,
            "-c:a",
            "pcm_f32le",
            &output.display().to_string(),
        ])
        .status()
        .map_err(|e| format!("Échec lancement ffmpeg ({}): {e}", ffmpeg.display()))?;
    if !status.success() {
        // Si soxr n'est pas compilé, ffmpeg échoue avec une erreur de filtre.
        if !ffmpeg_supports_soxr(&ffmpeg) {
            return Err(format!(
                "ffmpeg ({}) ne semble pas lié à libsoxr. winget install Gyan.FFmpeg",
                ffmpeg.display()
            ));
        }
        return Err(format!(
            "ffmpeg a échoué pour {} → {} (soxr {target_rate})",
            input.display(),
            output.display()
        ));
    }
    Ok(())
}

pub fn run_ffmpeg(args: &[&str]) -> Result<(), String> {
    let ffmpeg = resolve_ffmpeg()?;
    let status = ffmpeg_command(&ffmpeg)
        .args(args)
        .status()
        .map_err(|e| format!("Échec lancement ffmpeg ({}): {e}", ffmpeg.display()))?;
    if !status.success() {
        return Err(format!("ffmpeg a échoué ({})", args.join(" ")));
    }
    Ok(())
}

/// Stub documenté : même contrat, pour tests sans ffmpeg — copie refusée.
#[cfg(test)]
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
