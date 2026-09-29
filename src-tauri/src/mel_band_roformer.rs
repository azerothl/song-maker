//! Opt-in Mel-Band RoFormer GGUF install (hors premier build).
//! Download + SHA-256 + size + disk-space + cancel — then register in audiocpp config.

use crate::hashutil::sha256_file;
use crate::models::InstallProgress;
use crate::paths::{ensure_dir, mel_band_roformer_path};
use crate::pins::{
    MEL_BAND_ROFORMER_BYTES, MEL_BAND_ROFORMER_GGUF, MEL_BAND_ROFORMER_REMOTE,
    MEL_BAND_ROFORMER_SHA,
};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const HF_URL: &str =
    "https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main/Mel-Band-RoFormer-GGUF/mel-band-roformer-q8_0.gguf";

/// License notice shown before / during opt-in install (weights from audio-cpp/audio.cpp-gguf).
pub const LICENSE_NOTICE_FR: &str = "\
Mel-Band RoFormer « Kim Vocal 2 » (GGUF q8_0) est optionnel (~240 Mo). Source : Hugging Face audio-cpp/audio.cpp-gguf. \
Licence non vérifiée (aucune source primaire confirmée ; une conversion tierce ne suffit pas). \
Le poids n’est pas inclus dans l’installeur premier build. HTDemucs reste le séparateur par défaut.";

pub fn download_url() -> &'static str {
    HF_URL
}

pub fn weights_valid(cache: &Path) -> bool {
    crate::paths::mel_band_roformer_weights_present(cache)
}

pub fn verify_sha256(cache: &Path) -> Result<(), String> {
    let path = mel_band_roformer_path(cache);
    if !path.is_file() {
        return Err(format!(
            "GGUF Mel-Band RoFormer absent : {}",
            path.display()
        ));
    }
    let got = sha256_file(&path)?;
    if got != MEL_BAND_ROFORMER_SHA {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "SHA-256 Mel-Band RoFormer incorrect (attendu {MEL_BAND_ROFORMER_SHA}, obtenu {got}). Fichier retiré."
        ));
    }
    let len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if len != MEL_BAND_ROFORMER_BYTES {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "Taille Mel-Band RoFormer incorrecte (attendu {MEL_BAND_ROFORMER_BYTES} o, obtenu {len}). Fichier retiré."
        ));
    }
    Ok(())
}

fn free_disk_bytes(dir: &Path) -> Option<u64> {
    let probe = if dir.is_dir() {
        dir.to_path_buf()
    } else {
        dir.parent()?.to_path_buf()
    };
    #[cfg(unix)]
    {
        use std::ffi::CString;
        let Ok(c_path) = CString::new(probe.to_string_lossy().as_bytes()) else {
            return None;
        };
        // libc is a transitive dep of many crates; call via libc if linked.
        // Fallback: `df -Bk`.
        let output = std::process::Command::new("df")
            .args(["-Pk"])
            .arg(&probe)
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let line = text.lines().nth(1)?;
        let avail_kb: u64 = line.split_whitespace().nth(3)?.parse().ok()?;
        let _ = c_path; // silence unused when df works
        Some(avail_kb.saturating_mul(1024))
    }
    #[cfg(windows)]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("(Get-Item -LiteralPath '{}').PSDrive.Free", probe.display()),
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        text.parse::<u64>().ok()
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = probe;
        None
    }
}

fn ensure_disk_space(dest_dir: &Path, needed: u64) -> Result<(), String> {
    // Require ~20% headroom above the GGUF size.
    let want = needed
        .saturating_add(needed / 5)
        .max(needed + 32 * 1024 * 1024);
    match free_disk_bytes(dest_dir) {
        Some(free) if free < want => Err(format!(
            "Espace disque insuffisant pour Mel-Band RoFormer : {free} o libres, ~{want} o requis \
             ({MEL_BAND_ROFORMER_GGUF} ≈ {MEL_BAND_ROFORMER_BYTES} o)."
        )),
        Some(_) => Ok(()),
        None => {
            // Best-effort: refuse only when we can measure. Log-friendly soft pass.
            Ok(())
        }
    }
}

fn emit(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit("mel-band-roformer-progress", &progress);
    let _ = app.emit("setup-progress", &progress);
}

pub async fn install(
    app: AppHandle,
    cache: PathBuf,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    cancel.store(false, Ordering::SeqCst);
    let dest = mel_band_roformer_path(&cache);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }

    if weights_valid(&cache) {
        // Fast path: size match. Confirm SHA once so UI never trusts a corrupt file.
        verify_sha256(&cache)?;
        emit(&app, InstallProgress::complete());
        return Ok(dest.display().to_string());
    }
    if dest.is_file() {
        let _ = tokio::fs::remove_file(&dest).await;
    }

    ensure_disk_space(
        dest.parent().unwrap_or(cache.as_path()),
        MEL_BAND_ROFORMER_BYTES,
    )?;

    emit(
        &app,
        InstallProgress::phase(
            &format!("Mel-Band RoFormer — {LICENSE_NOTICE_FR} Téléchargement de {MEL_BAND_ROFORMER_REMOTE}…"),
            0,
            1,
        ),
    );

    let partial = dest.with_extension("gguf.partial");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent("SongMaker/0.1 mel-band-roformer-installer")
        .build()
        .map_err(|e| e.to_string())?;

    let resumed = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    let mut request = client.get(HF_URL);
    if resumed > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={resumed}-"));
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Téléchargement Mel-Band RoFormer : {e}"))?;
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && resumed > 0 {
        let _ = tokio::fs::remove_file(&partial).await;
        response = client
            .get(HF_URL)
            .send()
            .await
            .map_err(|e| format!("Téléchargement Mel-Band RoFormer : {e}"))?;
    }
    if !response.status().is_success() {
        return Err(format!(
            "Téléchargement Mel-Band RoFormer HTTP {} — poids absent ou inaccessible. HTDemucs reste disponible.",
            response.status()
        ));
    }
    let append = resumed > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let received_before = if append { resumed } else { 0 };
    let total = response
        .content_length()
        .map(|n| n + received_before)
        .or(Some(MEL_BAND_ROFORMER_BYTES));

    let mut file = if append {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&partial)
            .await
    } else {
        tokio::fs::File::create(&partial).await
    }
    .map_err(|e| e.to_string())?;

    let mut received = received_before;
    let mut last_emit = Instant::now();
    emit(
        &app,
        InstallProgress::downloading(MEL_BAND_ROFORMER_GGUF, 1, 1, received, total),
    );

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Téléchargement Mel-Band RoFormer : {e}"))?
    {
        if cancel.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            emit(
                &app,
                InstallProgress::failed("Téléchargement Mel-Band RoFormer annulé."),
            );
            return Err("Téléchargement Mel-Band RoFormer annulé.".into());
        }
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(400) {
            emit(
                &app,
                InstallProgress::downloading(MEL_BAND_ROFORMER_GGUF, 1, 1, received, total),
            );
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    if cancel.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err("Téléchargement Mel-Band RoFormer annulé.".into());
    }

    let actual = tokio::task::spawn_blocking({
        let path = partial.clone();
        move || sha256_file(&path)
    })
    .await
    .map_err(|e| e.to_string())??;
    if actual != MEL_BAND_ROFORMER_SHA {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "SHA-256 Mel-Band RoFormer incorrect après téléchargement (attendu {MEL_BAND_ROFORMER_SHA}). \
             Aucun faux succès — HTDemucs reste le chemin stable."
        ));
    }
    let len = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if len != MEL_BAND_ROFORMER_BYTES {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "Taille Mel-Band RoFormer incorrecte ({len} ≠ {MEL_BAND_ROFORMER_BYTES}). Fichier retiré."
        ));
    }

    tokio::fs::rename(&partial, &dest)
        .await
        .map_err(|e| e.to_string())?;
    emit(
        &app,
        InstallProgress::file_done(MEL_BAND_ROFORMER_GGUF, 1, 1),
    );
    emit(&app, InstallProgress::complete());
    Ok(dest.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_match_public_package_metadata() {
        assert_eq!(MEL_BAND_ROFORMER_GGUF, "mel-band-roformer-q8_0.gguf");
        assert_eq!(MEL_BAND_ROFORMER_SHA.len(), 64);
        assert_eq!(MEL_BAND_ROFORMER_BYTES, 251_748_928);
        assert!(download_url().contains("audio-cpp/audio.cpp-gguf"));
    }
}
