//! SheetSage2 transcription host — `audiocpp_cli --task midi --family sheetsage2`
//! or server `/v1/tasks/run` when weights are present. Never invents ABC.
//! Opt-in GGUF install (hors premier build, CC BY-NC 4.0) from the Reprise panel.

use crate::audiocpp::AudioCppServer;
use crate::hashutil::sha256_file;
use crate::library::load_settings;
use crate::models::InstallProgress;
use crate::paths::{
    binaries_dir, ensure_dir, sheetsage2_weights_path, sheetsage2_weights_present,
};
use crate::pins::{
    backend_name, SHEETSAGE2_BYTES, SHEETSAGE2_GGUF, SHEETSAGE2_REMOTE, SHEETSAGE2_REPO,
    SHEETSAGE2_SHA,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const HF_URL: &str =
    "https://huggingface.co/audio-cpp/SheetSage2-GGUF/resolve/main/sheetsage2-orig.gguf";

/// License notice shown before / during opt-in install.
pub const LICENSE_NOTICE_FR: &str = "\
SheetSage2 (GGUF) est optionnel (~2,7 Go). Source : Hugging Face audio-cpp/SheetSage2-GGUF. \
Les poids ne sont pas inclus dans l’installeur premier build — téléchargement opt-in depuis \
Partition → Reprise. Licence CC BY-NC 4.0 : usage commercial des poids interdit.";

pub fn download_url() -> &'static str {
    HF_URL
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetsageProbeResult {
    pub binary_present: bool,
    pub binary_path: Option<String>,
    pub cli_present: bool,
    pub cli_path: Option<String>,
    pub weights_present: bool,
    pub weights_path: Option<String>,
    pub weights_sha256_verified: bool,
    pub disk_bytes_available: Option<u64>,
    pub acceleration: String,
    pub message_fr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetsageTranscribeArgs {
    pub job_id: String,
    pub audio_path: String,
    pub out_abc_path: Option<String>,
    pub mode: Option<String>,
    pub license_accepted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetsageTranscribeOutcome {
    pub status: String,
    pub job_id: String,
    pub abc: Option<String>,
    pub warnings: Vec<String>,
    pub message_fr: String,
    pub out_abc_path: Option<String>,
}

pub struct SheetsageJobs {
    children: Mutex<HashMap<String, Child>>,
}

impl Default for SheetsageJobs {
    fn default() -> Self {
        Self {
            children: Mutex::new(HashMap::new()),
        }
    }
}

pub fn find_cli_binary(cache: &Path) -> Result<PathBuf, String> {
    let expected = if cfg!(target_os = "windows") {
        "audiocpp_cli.exe"
    } else {
        "audiocpp_cli"
    };
    let candidates = [
        binaries_dir(cache).join("extracted"),
        binaries_dir(cache).join("windows-cuda12.4"),
        binaries_dir(cache).join("linux-cuda12.8-colab"),
        binaries_dir(cache).join("macos-arm64-metal"),
        binaries_dir(cache).join("macos-x64-metal"),
    ];
    for extract in candidates {
        if !extract.exists() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&extract).max_depth(4) {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_name().to_string_lossy() == expected {
                return Ok(entry.path().to_path_buf());
            }
        }
    }
    Err(format!(
        "{expected} introuvable à côté du runtime audio.cpp. Installez le pack moteur (installeur principal)."
    ))
}

fn free_disk_bytes(dir: &Path) -> Option<u64> {
    let probe = if dir.is_dir() {
        dir.to_path_buf()
    } else {
        dir.parent()?.to_path_buf()
    };
    #[cfg(unix)]
    {
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
        Some(avail_kb.saturating_mul(1024))
    }
    #[cfg(windows)]
    {
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "(Get-Item -LiteralPath '{}').PSDrive.Free",
                    probe.display()
                ),
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
    let want = needed
        .saturating_add(needed / 5)
        .max(needed + 512 * 1024 * 1024);
    match free_disk_bytes(dest_dir) {
        Some(free) if free < want => Err(format!(
            "Espace disque insuffisant pour SheetSage2 : {free} o libres, ~{want} o requis \
             ({SHEETSAGE2_GGUF} ≈ {SHEETSAGE2_BYTES} o)."
        )),
        Some(_) => Ok(()),
        None => Ok(()),
    }
}

pub fn weights_valid(cache: &Path) -> bool {
    sheetsage2_weights_present(cache)
}

pub fn verify_sha256(cache: &Path) -> Result<(), String> {
    let path = sheetsage2_weights_path(cache);
    if !path.is_file() {
        return Err(format!("GGUF SheetSage2 absent : {}", path.display()));
    }
    let got = sha256_file(&path)?;
    if !got.eq_ignore_ascii_case(SHEETSAGE2_SHA) {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "SHA-256 SheetSage2 incorrect (attendu {SHEETSAGE2_SHA}, obtenu {got}). Fichier retiré."
        ));
    }
    let len = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    if len != SHEETSAGE2_BYTES {
        let _ = std::fs::remove_file(&path);
        return Err(format!(
            "Taille SheetSage2 incorrecte (attendu {SHEETSAGE2_BYTES} o, obtenu {len}). Fichier retiré."
        ));
    }
    Ok(())
}

fn emit(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit("sheetsage2-progress", &progress);
    let _ = app.emit("setup-progress", &progress);
}

/// Opt-in download of sheetsage2-orig.gguf (not in first-build installer).
pub async fn install(
    app: AppHandle,
    cache: PathBuf,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    cancel.store(false, Ordering::SeqCst);
    let dest = sheetsage2_weights_path(&cache);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }

    if weights_valid(&cache) {
        verify_sha256(&cache)?;
        emit(&app, InstallProgress::complete());
        return Ok(dest.display().to_string());
    }
    if dest.is_file() {
        let _ = tokio::fs::remove_file(&dest).await;
    }

    ensure_disk_space(dest.parent().unwrap_or(cache.as_path()), SHEETSAGE2_BYTES)?;

    emit(
        &app,
        InstallProgress::phase(
            &format!(
                "SheetSage2 — {LICENSE_NOTICE_FR} Téléchargement de {SHEETSAGE2_REMOTE}…"
            ),
            0,
            1,
        ),
    );

    let partial = dest.with_extension("gguf.partial");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(7_200))
        .user_agent("SongMaker/0.1 sheetsage2-installer")
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
        .map_err(|e| format!("Téléchargement SheetSage2 : {e}"))?;
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && resumed > 0 {
        let _ = tokio::fs::remove_file(&partial).await;
        response = client
            .get(HF_URL)
            .send()
            .await
            .map_err(|e| format!("Téléchargement SheetSage2 : {e}"))?;
    }
    if !response.status().is_success() && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
    {
        return Err(format!(
            "Téléchargement SheetSage2 HTTP {} — poids absent ou inaccessible. Aucune ABC inventée.",
            response.status()
        ));
    }
    let append =
        resumed > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let received_before = if append { resumed } else { 0 };
    let total = response
        .content_length()
        .map(|n| n + received_before)
        .or(Some(SHEETSAGE2_BYTES));

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
        InstallProgress::downloading(SHEETSAGE2_GGUF, 1, 1, received, total),
    );

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Téléchargement SheetSage2 : {e}"))?
    {
        if cancel.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            emit(
                &app,
                InstallProgress::failed("Téléchargement SheetSage2 annulé."),
            );
            return Err("Téléchargement SheetSage2 annulé.".into());
        }
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(400) {
            emit(
                &app,
                InstallProgress::downloading(SHEETSAGE2_GGUF, 1, 1, received, total),
            );
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    if cancel.load(Ordering::SeqCst) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err("Téléchargement SheetSage2 annulé.".into());
    }

    let actual = tokio::task::spawn_blocking({
        let path = partial.clone();
        move || sha256_file(&path)
    })
    .await
    .map_err(|e| e.to_string())??;
    if !actual.eq_ignore_ascii_case(SHEETSAGE2_SHA) {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "SHA-256 SheetSage2 incorrect après téléchargement (attendu {SHEETSAGE2_SHA}). \
             Aucun faux succès — aucune ABC inventée."
        ));
    }
    let len = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if len != SHEETSAGE2_BYTES {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "Taille SheetSage2 incorrecte ({len} ≠ {SHEETSAGE2_BYTES}). Fichier retiré."
        ));
    }

    tokio::fs::rename(&partial, &dest)
        .await
        .map_err(|e| e.to_string())?;
    emit(&app, InstallProgress::file_done(SHEETSAGE2_GGUF, 1, 1));
    emit(&app, InstallProgress::complete());
    Ok(dest.display().to_string())
}

pub fn probe() -> Result<SheetsageProbeResult, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let weights_path = sheetsage2_weights_path(&cache);
    let weights_present = sheetsage2_weights_present(&cache);
    let mut weights_sha256_verified = false;
    if weights_present {
        if let Ok(sha) = sha256_file(&weights_path) {
            weights_sha256_verified = sha.eq_ignore_ascii_case(SHEETSAGE2_SHA);
        }
    }
    let server_bin = AudioCppServer::find_server_binary(&cache).ok();
    let cli_bin = find_cli_binary(&cache).ok();
    let binary_present = server_bin.is_some() || cli_bin.is_some();
    let disk_bytes_available = free_disk_bytes(&cache);
    let acceleration = if cfg!(target_os = "macos") {
        "cpu"
    } else {
        "cuda"
    };
    let message_fr = if !binary_present {
        "Runtime audio.cpp (serveur ou audiocpp_cli) introuvable. Installez le pack moteur via l’installeur principal.".into()
    } else if !weights_present {
        format!(
            "Poids SheetSage2 absents ({SHEETSAGE2_GGUF}, ~{:.1} Go). Téléchargement opt-in depuis cet écran (CC BY-NC 4.0).",
            SHEETSAGE2_BYTES as f64 / 1e9
        )
    } else if !weights_sha256_verified {
        "Poids SheetSage2 présents mais empreinte SHA-256 non vérifiée — vérifiez le fichier."
            .into()
    } else {
        "Runtime SheetSage2 prêt (binaire + poids).".into()
    };
    Ok(SheetsageProbeResult {
        binary_present,
        binary_path: server_bin.map(|p| p.display().to_string()),
        cli_present: cli_bin.is_some(),
        cli_path: cli_bin.map(|p| p.display().to_string()),
        weights_present,
        weights_path: if weights_present {
            Some(weights_path.display().to_string())
        } else {
            None
        },
        weights_sha256_verified,
        disk_bytes_available,
        acceleration: acceleration.into(),
        message_fr,
    })
}

fn looks_like_abc(text: &str) -> bool {
    let trimmed = text.trim();
    !trimmed.is_empty() && trimmed.lines().any(|l| l.starts_with("X:"))
}

fn run_cli_transcribe(
    cli: &Path,
    model: &Path,
    audio: &Path,
    out_abc: &Path,
    jobs: &SheetsageJobs,
    job_id: &str,
) -> Result<(), String> {
    let mut cmd = Command::new(cli);
    cmd.arg("--task")
        .arg("midi")
        .arg("--family")
        .arg("sheetsage2")
        .arg("--model")
        .arg(model)
        .arg("--backend")
        .arg(backend_name())
        .arg("--audio")
        .arg(audio)
        .arg("--out")
        .arg(out_abc)
        .arg("--log")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let child = cmd
        .spawn()
        .map_err(|e| format!("Échec lancement audiocpp_cli SheetSage2 : {e}"))?;
    {
        jobs.children
            .lock()
            .unwrap()
            .insert(job_id.to_string(), child);
    }
    let status = {
        let mut map = jobs.children.lock().unwrap();
        let child = map
            .get_mut(job_id)
            .ok_or_else(|| "Job SheetSage2 introuvable (annulé ?).".to_string())?;
        child
            .wait()
            .map_err(|e| format!("Attente audiocpp_cli : {e}"))?
    };
    jobs.children.lock().unwrap().remove(job_id);
    if !status.success() {
        return Err(format!(
            "audiocpp_cli SheetSage2 a échoué (code {:?}). Aucune ABC inventée.",
            status.code()
        ));
    }
    Ok(())
}

async fn run_server_transcribe(
    state_server: &AudioCppServer,
    audio: &Path,
    out_abc: &Path,
) -> Result<(), String> {
    let settings = load_settings()?;
    let base = state_server.ensure_started(&settings)?;
    let body = json!({
        "model": "sheetsage2",
        "request": {
            "audio": audio.display().to_string(),
            "out": out_abc.display().to_string(),
        }
    });
    let response = AudioCppServer::run_task(&base, body).await?;
    if let Some(abc) = response
        .get("abc")
        .and_then(|v| v.as_str())
        .or_else(|| response.get("text").and_then(|v| v.as_str()))
        .or_else(|| response.get("score").and_then(|v| v.as_str()))
    {
        if looks_like_abc(abc) {
            if let Some(parent) = out_abc.parent() {
                ensure_dir(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(out_abc, abc).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    if out_abc.is_file() {
        return Ok(());
    }
    Err(
        "Réponse serveur SheetSage2 sans ABC valide — aucune partition fictive n’est inventée."
            .into(),
    )
}

pub async fn transcribe(
    state_server: &AudioCppServer,
    jobs: &SheetsageJobs,
    args: SheetsageTranscribeArgs,
) -> Result<SheetsageTranscribeOutcome, String> {
    if !args.license_accepted {
        return Ok(SheetsageTranscribeOutcome {
            status: "license_not_accepted".into(),
            job_id: args.job_id,
            abc: None,
            warnings: vec![],
            message_fr: "Licence CC BY-NC 4.0 SheetSage2 non acceptée.".into(),
            out_abc_path: None,
        });
    }
    let audio = PathBuf::from(&args.audio_path);
    if !audio.is_file() {
        return Ok(SheetsageTranscribeOutcome {
            status: "failed".into(),
            job_id: args.job_id,
            abc: None,
            warnings: vec!["invalid_audio".into()],
            message_fr: format!(
                "Fichier audio introuvable : {}. Aucune ABC inventée.",
                audio.display()
            ),
            out_abc_path: None,
        });
    }
    let probe = probe()?;
    if !probe.binary_present || !probe.weights_present {
        return Ok(SheetsageTranscribeOutcome {
            status: "missing_runtime".into(),
            job_id: args.job_id,
            abc: None,
            warnings: vec![],
            message_fr: probe.message_fr,
            out_abc_path: None,
        });
    }
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let model = sheetsage2_weights_path(&cache);
    let out_abc = args
        .out_abc_path
        .as_ref()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let dir = cache.join("sheetsage-jobs").join(&args.job_id);
            let _ = ensure_dir(&dir);
            dir.join("score.abc")
        });
    if let Some(parent) = out_abc.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }

    let run_result = if let Ok(cli_path) = find_cli_binary(&cache) {
        let job_id = args.job_id.clone();
        let model = model.clone();
        let audio = audio.clone();
        let out_abc = out_abc.clone();
        tokio::task::block_in_place(|| {
            run_cli_transcribe(&cli_path, &model, &audio, &out_abc, jobs, &job_id)
        })
    } else {
        run_server_transcribe(state_server, &audio, &out_abc).await
    };

    if let Err(e) = run_result {
        return Ok(SheetsageTranscribeOutcome {
            status: "failed".into(),
            job_id: args.job_id,
            abc: None,
            warnings: vec!["runner_failed".into()],
            message_fr: e,
            out_abc_path: Some(out_abc.display().to_string()),
        });
    }

    let abc_text = std::fs::read_to_string(&out_abc).unwrap_or_default();
    if !looks_like_abc(&abc_text) {
        return Ok(SheetsageTranscribeOutcome {
            status: "failed".into(),
            job_id: args.job_id,
            abc: None,
            warnings: vec!["empty_or_invalid_abc".into()],
            message_fr:
                "Le runner n’a produit aucune ABC valide. Aucune partition fictive n’est inventée."
                    .into(),
            out_abc_path: Some(out_abc.display().to_string()),
        });
    }
    let _ = args.mode;
    Ok(SheetsageTranscribeOutcome {
        status: "ok".into(),
        job_id: args.job_id,
        abc: Some(abc_text),
        warnings: if probe.weights_sha256_verified {
            vec![]
        } else {
            vec!["weights_sha_unverified".into()]
        },
        message_fr: "Transcription SheetSage2 terminée — corrigez puis confirmez avant YuE2."
            .into(),
        out_abc_path: Some(out_abc.display().to_string()),
    })
}

pub fn cancel(jobs: &SheetsageJobs, job_id: &str) -> Result<String, String> {
    let mut map = jobs.children.lock().unwrap();
    if let Some(mut child) = map.remove(job_id) {
        let _ = child.kill();
        return Ok("Job SheetSage2 annulé.".into());
    }
    Ok("Aucun processus SheetSage2 actif pour ce job.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_match_public_package_metadata() {
        assert_eq!(SHEETSAGE2_GGUF, "sheetsage2-orig.gguf");
        assert_eq!(SHEETSAGE2_SHA.len(), 64);
        assert_eq!(SHEETSAGE2_BYTES, 2_708_224_512);
        assert_eq!(SHEETSAGE2_REPO, "audio-cpp/SheetSage2-GGUF");
        assert!(download_url().contains("SheetSage2-GGUF"));
        assert!(LICENSE_NOTICE_FR.contains("CC BY-NC"));
    }
}
