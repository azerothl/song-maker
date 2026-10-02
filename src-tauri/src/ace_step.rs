//! ACE-Step 1.5 Turbo BF16 — modèle de génération optionnel téléchargé à la demande.

use crate::hashutil::sha256_file;
use crate::models::InstallProgress;
use crate::paths::{ace_step_weights_path, ace_step_weights_present, ensure_dir};
use crate::pins::{
    ACE_STEP_BYTES, ACE_STEP_GGUF, ACE_STEP_REMOTE, ACE_STEP_REPO, ACE_STEP_REVISION, ACE_STEP_SHA,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const HF_URL: &str = "https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/7bf52723f5a95b6cec53ea905fd10eca1c8b942e/ACE-Step1.5-GGUF/turbo/ace-step-1.5-turbo-bf16.gguf";

/// Text shown before the opt-in download. Records known source conflict and Qwen/VAE review limits.
pub const LICENSE_NOTICE_FR: &str = "\
ACE-Step 1.5 Turbo BF16 est optionnel (~9,4 Gio) et absent de l’installeur. La carte originale affiche MIT ; la conversion audio.cpp déclare « other » et renvoie à l’original. Composants déclarés Qwen3-Embedding-0.6B et Qwen3-1.7B : Apache-2.0 sur leurs cartes (texte Apache joint pour Qwen3-1.7B ; pas de fichier LICENSE à la révision Embedding examinée). VAE sans licence séparée au-delà de la carte parente. Composition binaire du GGUF, données d’entraînement et droits sur les sorties non vérifiés. Les auteurs précisent : « The authors are not responsible for any misuse of the model ».";
pub const LICENSE_NOTICE_EN: &str = "\
ACE-Step 1.5 Turbo BF16 is optional (~9.4 GiB) and is not included in the installer. The original model card lists MIT; the audio.cpp conversion declares “other” and points back to the original. Declared Qwen3-Embedding-0.6B and Qwen3-1.7B components: Apache-2.0 on their cards (Apache text bundled for Qwen3-1.7B; no LICENSE file at the examined Embedding revision). VAE has no separate license beyond the parent card. Binary GGUF composition, training data, and output rights are unverified. The authors state: “The authors are not responsible for any misuse of the model”.";

pub fn weights_valid(cache: &Path) -> bool {
    ace_step_weights_present(cache)
}

pub fn verify_sha256(cache: &Path) -> Result<(), String> {
    let path = ace_step_weights_path(cache);
    if !path.is_file() {
        return Err(format!("Poids ACE-Step absents : {}", path.display()));
    }
    let len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if len != ACE_STEP_BYTES {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "Taille ACE-Step incorrecte ({len} ≠ {ACE_STEP_BYTES}). Fichier retiré."
        ));
    }
    let got = sha256_file(&path)?;
    if !got.eq_ignore_ascii_case(ACE_STEP_SHA) {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "SHA-256 ACE-Step incorrect (attendu {ACE_STEP_SHA}, obtenu {got}). Fichier retiré."
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallInfo {
    pub gguf: String,
    pub sha256: String,
    pub bytes: u64,
    pub repo: String,
    pub revision: String,
    pub remote_path: String,
    pub url: String,
    pub license_notice_fr: String,
    pub license_notice_en: String,
    pub path: String,
    pub available: bool,
}

pub fn install_info(cache: &Path) -> InstallInfo {
    InstallInfo {
        gguf: ACE_STEP_GGUF.into(),
        sha256: ACE_STEP_SHA.into(),
        bytes: ACE_STEP_BYTES,
        repo: ACE_STEP_REPO.into(),
        revision: ACE_STEP_REVISION.into(),
        remote_path: ACE_STEP_REMOTE.into(),
        url: HF_URL.into(),
        license_notice_fr: LICENSE_NOTICE_FR.into(),
        license_notice_en: LICENSE_NOTICE_EN.into(),
        path: ace_step_weights_path(cache).display().to_string(),
        available: weights_valid(cache),
    }
}

fn emit(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit("ace-step-progress", &progress);
    let _ = app.emit("setup-progress", &progress);
}

fn ensure_disk_space(dest_dir: &Path) -> Result<(), String> {
    let probe = if dest_dir.is_dir() {
        dest_dir
    } else {
        dest_dir.parent().unwrap_or(dest_dir)
    };
    #[cfg(windows)]
    let output = {
        let escaped = probe.display().to_string().replace('\'', "''");
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!("(Get-Item -LiteralPath '{escaped}').PSDrive.Free"),
            ])
            .output()
    };
    #[cfg(unix)]
    let output = std::process::Command::new("df")
        .args(["-Pk"])
        .arg(probe)
        .output();
    #[cfg(not(any(windows, unix)))]
    let output: Result<std::process::Output, std::io::Error> =
        Err(std::io::Error::other("unsupported"));

    let Ok(output) = output else { return Ok(()) };
    if !output.status.success() {
        return Ok(());
    }
    let text = String::from_utf8_lossy(&output.stdout);
    #[cfg(windows)]
    let free = text.trim().parse::<u64>().ok();
    #[cfg(unix)]
    let free = text
        .lines()
        .nth(1)
        .and_then(|line| line.split_whitespace().nth(3))
        .and_then(|value| value.parse::<u64>().ok())
        .map(|kb| kb.saturating_mul(1024));
    let required = ACE_STEP_BYTES
        .saturating_add(ACE_STEP_BYTES / 5)
        .max(ACE_STEP_BYTES + 512 * 1024 * 1024);
    if let Some(free) = free.filter(|free| *free < required) {
        return Err(format!("Espace disque insuffisant pour ACE-Step : {free} o libres, environ {required} o requis."));
    }
    Ok(())
}

/// Explicitly accepted opt-in download; file is pinned by revision, exact size, and SHA-256.
pub async fn install(
    app: AppHandle,
    cache: PathBuf,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    cancel.store(false, Ordering::SeqCst);
    let dest = ace_step_weights_path(&cache);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    if weights_valid(&cache) {
        tokio::task::spawn_blocking({
            let cache = cache.clone();
            move || verify_sha256(&cache)
        })
        .await
        .map_err(|e| e.to_string())??;
        emit(&app, InstallProgress::complete());
        return Ok(dest.display().to_string());
    }
    ensure_disk_space(dest.parent().unwrap_or(cache.as_path()))?;
    emit(
        &app,
        InstallProgress::phase(
            &format!("ACE-Step — {LICENSE_NOTICE_FR} Téléchargement de {ACE_STEP_REMOTE}…"),
            0,
            1,
        ),
    );

    let partial = dest.with_extension("gguf.partial");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(7_200))
        .user_agent("SongMaker/0.1 ace-step-installer")
        .build()
        .map_err(|e| e.to_string())?;
    let mut resumed = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if resumed >= ACE_STEP_BYTES {
        let _ = tokio::fs::remove_file(&partial).await;
        resumed = 0;
    }
    let mut request = client.get(HF_URL);
    if resumed > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={resumed}-"));
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Téléchargement ACE-Step : {e}"))?;
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && resumed > 0 {
        let _ = tokio::fs::remove_file(&partial).await;
        resumed = 0;
        response = client
            .get(HF_URL)
            .send()
            .await
            .map_err(|e| format!("Téléchargement ACE-Step : {e}"))?;
    }
    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
    {
        return Err(format!(
            "Téléchargement ACE-Step HTTP {} — poids absents ou inaccessibles.",
            response.status()
        ));
    }
    let append = resumed > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let received_before = if append { resumed } else { 0 };
    let total = response
        .content_length()
        .map(|n| n + received_before)
        .or(Some(ACE_STEP_BYTES));
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
        InstallProgress::downloading(ACE_STEP_GGUF, 1, 1, received, total),
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Téléchargement ACE-Step : {e}"))?
    {
        if cancel.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            emit(
                &app,
                InstallProgress::failed("Téléchargement ACE-Step annulé."),
            );
            return Err("Téléchargement ACE-Step annulé.".into());
        }
        received = received.saturating_add(chunk.len() as u64);
        if received > ACE_STEP_BYTES {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(
                "Le téléchargement ACE-Step dépasse la taille épinglée; fichier retiré.".into(),
            );
        }
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        if last_emit.elapsed() >= Duration::from_millis(400) {
            emit(
                &app,
                InstallProgress::downloading(ACE_STEP_GGUF, 1, 1, received, total),
            );
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    if cancel.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err("Téléchargement ACE-Step annulé.".into());
    }

    let actual = tokio::task::spawn_blocking({
        let path = partial.clone();
        move || sha256_file(&path)
    })
    .await
    .map_err(|e| e.to_string())??;
    if !actual.eq_ignore_ascii_case(ACE_STEP_SHA) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!("SHA-256 ACE-Step incorrect après téléchargement (attendu {ACE_STEP_SHA}). Fichier retiré."));
    }
    let len = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if len != ACE_STEP_BYTES {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "Taille ACE-Step incorrecte ({len} ≠ {ACE_STEP_BYTES}). Fichier retiré."
        ));
    }
    tokio::fs::rename(&partial, &dest)
        .await
        .map_err(|e| e.to_string())?;
    emit(&app, InstallProgress::file_done(ACE_STEP_GGUF, 1, 1));
    emit(&app, InstallProgress::complete());
    Ok(dest.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-ace-step-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn install_info_exposes_the_exact_pinned_model_metadata() {
        let dir = temp_dir("info");
        let info = install_info(&dir);
        assert_eq!(info.revision, ACE_STEP_REVISION);
        assert_eq!(info.sha256, ACE_STEP_SHA);
        assert_eq!(info.bytes, ACE_STEP_BYTES);
        assert!(!info.available);
        assert!(info.license_notice_fr.contains("déclare « other »"));
        assert!(info.license_notice_fr.contains("Apache-2.0"));
        assert!(info.license_notice_fr.contains("VAE"));
        assert!(info.license_notice_en.contains("Apache-2.0"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn incomplete_weights_are_not_registered_as_installed() {
        let dir = temp_dir("partial");
        let path = ace_step_weights_path(&dir);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"partial").unwrap();
        assert!(!weights_valid(&dir));
        let _ = std::fs::remove_dir_all(dir);
    }
}
