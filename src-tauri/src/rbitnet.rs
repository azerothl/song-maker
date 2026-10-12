//! Rbitnet sidecar for the mix assistant (Phase 2a).
//!
//! - Deferred download of pinned `rbitnet-server` release assets (not MSI-bloated).
//! - Deferred GGUF + tokenizer download (Qwen GGUF or BitNet b1.58).
//! - Process spawn on loopback `127.0.0.1:8080` with `GET /ready` health.

use crate::hashutil::sha256_file;
use crate::models::InstallProgress;
use crate::paths::{ensure_dir, rbitnet_bin_dir, rbitnet_model_dir};
use crate::pins::{
    rbitnet_platform_archive, RBITNET_BIND_HOST, RBITNET_BIND_PORT, RBITNET_BITNET_BYTES,
    RBITNET_BITNET_FILE, RBITNET_BITNET_ID, RBITNET_BITNET_REPO, RBITNET_BITNET_SHA,
    RBITNET_BITNET_TOKENIZER_BYTES, RBITNET_BITNET_TOKENIZER_REPO, RBITNET_QWEN_BYTES,
    RBITNET_QWEN_FILE, RBITNET_QWEN_ID, RBITNET_QWEN_REPO, RBITNET_QWEN_SHA,
    RBITNET_QWEN_TOKENIZER_BYTES, RBITNET_QWEN_TOKENIZER_REPO, RBITNET_REPO, RBITNET_TAG,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const TOKENIZER_FILE: &str = "tokenizer.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RbitnetModelKind {
    QwenGguf,
    BitNetB158,
}

impl RbitnetModelKind {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            RBITNET_QWEN_ID | "qwen" | "qwen_gguf" => Some(Self::QwenGguf),
            RBITNET_BITNET_ID | "bitnet" | "bitnet_b158" | "bitnet-b1.58" => Some(Self::BitNetB158),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::QwenGguf => RBITNET_QWEN_ID,
            Self::BitNetB158 => RBITNET_BITNET_ID,
        }
    }

    fn gguf_repo(self) -> &'static str {
        match self {
            Self::QwenGguf => RBITNET_QWEN_REPO,
            Self::BitNetB158 => RBITNET_BITNET_REPO,
        }
    }

    fn gguf_file(self) -> &'static str {
        match self {
            Self::QwenGguf => RBITNET_QWEN_FILE,
            Self::BitNetB158 => RBITNET_BITNET_FILE,
        }
    }

    fn gguf_sha(self) -> &'static str {
        match self {
            Self::QwenGguf => RBITNET_QWEN_SHA,
            Self::BitNetB158 => RBITNET_BITNET_SHA,
        }
    }

    fn gguf_bytes(self) -> u64 {
        match self {
            Self::QwenGguf => RBITNET_QWEN_BYTES,
            Self::BitNetB158 => RBITNET_BITNET_BYTES,
        }
    }

    fn tokenizer_repo(self) -> &'static str {
        match self {
            Self::QwenGguf => RBITNET_QWEN_TOKENIZER_REPO,
            Self::BitNetB158 => RBITNET_BITNET_TOKENIZER_REPO,
        }
    }

    fn tokenizer_bytes(self) -> u64 {
        match self {
            Self::QwenGguf => RBITNET_QWEN_TOKENIZER_BYTES,
            Self::BitNetB158 => RBITNET_BITNET_TOKENIZER_BYTES,
        }
    }

    fn chat_format(self) -> &'static str {
        match self {
            Self::QwenGguf => "chatml",
            Self::BitNetB158 => "raw",
        }
    }

    fn label_fr(self) -> &'static str {
        match self {
            Self::QwenGguf => "Qwen 2.5 1.5B Instruct (GGUF Q4_K_M)",
            Self::BitNetB158 => "BitNet b1.58 2B-4T (natif Rbitnet)",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RbitnetStatus {
    pub release_tag: String,
    pub binary_present: bool,
    pub binary_path: Option<String>,
    pub running: bool,
    pub ready: bool,
    pub base_url: String,
    pub selected_model_id: String,
    pub model_present: bool,
    pub model_path: Option<String>,
    pub tokenizer_present: bool,
    pub catalog: Vec<RbitnetCatalogEntry>,
    pub message_fr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RbitnetCatalogEntry {
    pub id: String,
    pub label_fr: String,
    pub gguf_repo: String,
    pub gguf_file: String,
    pub bytes: u64,
    pub present: bool,
}

pub struct RbitnetSidecar {
    child: Mutex<Option<Child>>,
    model_id: Mutex<String>,
}

impl Default for RbitnetSidecar {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            model_id: Mutex::new(RBITNET_QWEN_ID.to_string()),
        }
    }
}

impl RbitnetSidecar {
    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    fn is_child_alive(&self) -> bool {
        let Ok(mut guard) = self.child.lock() else {
            return false;
        };
        match guard.as_mut() {
            Some(child) => match child.try_wait() {
                Ok(None) => true,
                Ok(Some(_)) => {
                    *guard = None;
                    false
                }
                Err(_) => false,
            },
            None => false,
        }
    }
}

fn server_exe_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "rbitnet-server.exe"
    } else {
        "rbitnet-server"
    }
}

fn find_server_binary(cache: &Path) -> Option<PathBuf> {
    let expected = server_exe_name();
    let root = rbitnet_bin_dir(cache);
    if !root.exists() {
        return None;
    }
    for entry in walkdir::WalkDir::new(&root).max_depth(4) {
        let Ok(entry) = entry else {
            continue;
        };
        if entry.file_name().to_string_lossy() == expected && entry.file_type().is_file() {
            return Some(entry.path().to_path_buf());
        }
    }
    None
}

fn model_paths(cache: &Path, kind: RbitnetModelKind) -> (PathBuf, PathBuf) {
    let dir = rbitnet_model_dir(cache, kind.id());
    (dir.join(kind.gguf_file()), dir.join(TOKENIZER_FILE))
}

fn model_present(cache: &Path, kind: RbitnetModelKind) -> bool {
    let (gguf, tok) = model_paths(cache, kind);
    let gguf_ok = gguf.is_file()
        && std::fs::metadata(&gguf)
            .map(|m| m.len() == kind.gguf_bytes())
            .unwrap_or(false);
    let tok_ok = tok.is_file()
        && std::fs::metadata(&tok)
            .map(|m| m.len() == kind.tokenizer_bytes())
            .unwrap_or(false);
    gguf_ok && tok_ok
}

fn resolve_kind(model_id: &str) -> RbitnetModelKind {
    RbitnetModelKind::parse(model_id).unwrap_or(RbitnetModelKind::QwenGguf)
}

fn ready_url() -> String {
    format!("http://{RBITNET_BIND_HOST}:{RBITNET_BIND_PORT}/ready")
}

fn base_url() -> String {
    format!("http://{RBITNET_BIND_HOST}:{RBITNET_BIND_PORT}")
}

fn http_ready_sync() -> bool {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    let Ok(addr) = format!("{RBITNET_BIND_HOST}:{RBITNET_BIND_PORT}").parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(1)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
    let req = format!(
        "GET /ready HTTP/1.1\r\nHost: {RBITNET_BIND_HOST}:{RBITNET_BIND_PORT}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 128];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let text = String::from_utf8_lossy(&buf[..n]);
    text.contains(" 200 ")
}

async fn http_ready_async() -> bool {
    let Ok(client) = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(2))
        .build()
    else {
        return false;
    };
    client
        .get(ready_url())
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

pub fn status(cache: &Path, sidecar: &RbitnetSidecar, selected_model_id: &str) -> RbitnetStatus {
    let kind = resolve_kind(selected_model_id);
    let binary = find_server_binary(cache);
    let (gguf, tok) = model_paths(cache, kind);
    let running = sidecar.is_child_alive() || http_ready_sync();
    let ready = http_ready_sync();
    let catalog = [RbitnetModelKind::QwenGguf, RbitnetModelKind::BitNetB158]
        .into_iter()
        .map(|k| RbitnetCatalogEntry {
            id: k.id().to_string(),
            label_fr: k.label_fr().to_string(),
            gguf_repo: k.gguf_repo().to_string(),
            gguf_file: k.gguf_file().to_string(),
            bytes: k.gguf_bytes(),
            present: model_present(cache, k),
        })
        .collect();
    let message_fr = if ready {
        "Sidecar Rbitnet prêt.".to_string()
    } else if binary.is_none() {
        "Binaire rbitnet-server absent — hors installeur, téléchargement différé requis."
            .to_string()
    } else if !model_present(cache, kind) {
        format!(
            "Poids « {} » absents — hors installeur, téléchargement différé requis.",
            kind.label_fr()
        )
    } else if running {
        "Processus démarré, /ready pas encore OK.".to_string()
    } else {
        "Sidecar arrêté. Lancez Rbitnet depuis l’assistant de mix.".to_string()
    };
    RbitnetStatus {
        release_tag: RBITNET_TAG.to_string(),
        binary_present: binary.is_some(),
        binary_path: binary.map(|p| p.display().to_string()),
        running,
        ready,
        base_url: base_url(),
        selected_model_id: kind.id().to_string(),
        model_present: model_present(cache, kind),
        model_path: gguf.is_file().then(|| gguf.display().to_string()),
        tokenizer_present: tok.is_file(),
        catalog,
        message_fr,
    }
}

fn emit(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit("install-progress", progress);
}

fn hf_resolve_url(repo: &str, file: &str) -> String {
    format!("https://huggingface.co/{repo}/resolve/main/{file}")
}

fn release_url(asset: &str) -> String {
    format!("https://github.com/{RBITNET_REPO}/releases/download/{RBITNET_TAG}/{asset}")
}

#[allow(clippy::too_many_arguments)]
async fn download_file(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    expected_sha: Option<&str>,
    expected_bytes: u64,
    label: &str,
    index: usize,
    count: usize,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let partial = dest.with_extension(format!(
        "{}.partial",
        dest.extension().and_then(|e| e.to_str()).unwrap_or("bin")
    ));

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement {label} : {e}"))?
        .error_for_status()
        .map_err(|e| format!("Téléchargement {label} : {e}"))?;
    let total = response
        .content_length()
        .unwrap_or(expected_bytes)
        .max(expected_bytes);

    let mut file = tokio::fs::File::create(&partial)
        .await
        .map_err(|e| e.to_string())?;
    let mut received = 0u64;
    let mut last_emit = Instant::now();
    emit(
        app,
        InstallProgress::downloading(label, index, count, received, Some(total)),
    );

    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Téléchargement {label} : {e}"))?
    {
        if cancel.load(Ordering::SeqCst) {
            drop(file);
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(format!("Téléchargement {label} annulé."));
        }
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(400) {
            emit(
                app,
                InstallProgress::downloading(label, index, count, received, Some(total)),
            );
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    if let Some(sha) = expected_sha {
        let actual = tokio::task::spawn_blocking({
            let path = partial.clone();
            move || sha256_file(&path)
        })
        .await
        .map_err(|e| e.to_string())??;
        if actual != sha {
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(format!(
                "SHA-256 {label} incorrect (attendu {sha}, obtenu {actual})."
            ));
        }
    }
    let len = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    if len != expected_bytes {
        let _ = tokio::fs::remove_file(&partial).await;
        return Err(format!(
            "Taille {label} incorrecte ({len} ≠ {expected_bytes})."
        ));
    }
    tokio::fs::rename(&partial, dest)
        .await
        .map_err(|e| e.to_string())?;
    emit(app, InstallProgress::file_done(label, index, count));
    Ok(())
}

fn extract_zip(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(relative) = entry.enclosed_name() else {
            return Err("Archive Rbitnet : chemin non sûr.".into());
        };
        let output = destination.join(relative);
        if entry.is_dir() {
            ensure_dir(&output).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = output.parent() {
                ensure_dir(parent).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&output).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_tar_gz(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    let decoder = flate2::read::GzDecoder::new(file);
    tar::Archive::new(decoder)
        .unpack(destination)
        .map_err(|e| format!("Extraction Rbitnet tar.gz : {e}"))
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    ensure_dir(destination).map_err(|e| e.to_string())?;
    let name = archive
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    if name.ends_with(".zip") {
        extract_zip(archive, destination)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive, destination)
    } else {
        Err(format!("Format d’archive Rbitnet non supporté ({name})."))
    }
}

#[cfg(unix)]
fn mark_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    let mut perms = meta.permissions();
    perms.set_mode(perms.mode() | 0o755);
    std::fs::set_permissions(path, perms).map_err(|e| e.to_string())
}

#[cfg(not(unix))]
fn mark_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

/// Download + extract pinned `rbitnet-server` for this platform.
pub async fn install_binary(
    app: AppHandle,
    cache: PathBuf,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let (asset, sha, bytes) = rbitnet_platform_archive();
    let bin_dir = rbitnet_bin_dir(&cache);
    ensure_dir(&bin_dir).map_err(|e| e.to_string())?;
    let archive_path = bin_dir.join(asset);
    emit(&app, InstallProgress::starting(1));
    download_file(
        &app,
        &release_url(asset),
        &archive_path,
        Some(sha),
        bytes,
        asset,
        1,
        1,
        &cancel,
    )
    .await?;
    let extract_dir = bin_dir.join("extracted");
    if extract_dir.exists() {
        let _ = std::fs::remove_dir_all(&extract_dir);
    }
    ensure_dir(&extract_dir).map_err(|e| e.to_string())?;
    extract_archive(&archive_path, &extract_dir)?;
    let bin = find_server_binary(&cache).ok_or_else(|| {
        format!(
            "{exe} introuvable après extraction de {asset}.",
            exe = server_exe_name()
        )
    })?;
    mark_executable(&bin)?;
    emit(&app, InstallProgress::complete());
    Ok(bin.display().to_string())
}

/// Deferred GGUF + tokenizer download for a catalog model.
pub async fn install_model(
    app: AppHandle,
    cache: PathBuf,
    model_id: String,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    let kind = RbitnetModelKind::parse(&model_id)
        .ok_or_else(|| format!("Modèle Rbitnet inconnu : {model_id}"))?;
    let dir = rbitnet_model_dir(&cache, kind.id());
    ensure_dir(&dir).map_err(|e| e.to_string())?;
    let (gguf, tok) = model_paths(&cache, kind);
    emit(&app, InstallProgress::starting(2));
    if !(gguf.is_file()
        && std::fs::metadata(&gguf)
            .map(|m| m.len() == kind.gguf_bytes())
            .unwrap_or(false))
    {
        download_file(
            &app,
            &hf_resolve_url(kind.gguf_repo(), kind.gguf_file()),
            &gguf,
            Some(kind.gguf_sha()),
            kind.gguf_bytes(),
            kind.gguf_file(),
            1,
            2,
            &cancel,
        )
        .await?;
    } else {
        emit(&app, InstallProgress::file_done(kind.gguf_file(), 1, 2));
    }
    if !(tok.is_file()
        && std::fs::metadata(&tok)
            .map(|m| m.len() == kind.tokenizer_bytes())
            .unwrap_or(false))
    {
        download_file(
            &app,
            &hf_resolve_url(kind.tokenizer_repo(), TOKENIZER_FILE),
            &tok,
            None,
            kind.tokenizer_bytes(),
            TOKENIZER_FILE,
            2,
            2,
            &cancel,
        )
        .await?;
    } else {
        emit(&app, InstallProgress::file_done(TOKENIZER_FILE, 2, 2));
    }
    emit(&app, InstallProgress::complete());
    Ok(gguf.display().to_string())
}

fn spawn_server(
    bin: &Path,
    gguf: &Path,
    tokenizer: &Path,
    kind: RbitnetModelKind,
) -> Result<Child, String> {
    let mut cmd = Command::new(bin);
    cmd.env("RBITNET_MODEL", gguf)
        .env("RBITNET_TOKENIZER", tokenizer)
        .env(
            "RBITNET_BIND",
            format!("{RBITNET_BIND_HOST}:{RBITNET_BIND_PORT}"),
        )
        .env("RBITNET_BACKEND", "cpu")
        .env("RBITNET_CHAT_FORMAT", kind.chat_format())
        .env("RBITNET_STRUCTURED_OUTPUT", "json")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::process_utils::configure_no_window(&mut cmd);
    cmd.spawn()
        .map_err(|e| format!("Impossible de démarrer rbitnet-server : {e}"))
}

/// Ensure binary + weights present, then spawn sidecar and wait for `/ready`.
pub async fn ensure_started(
    sidecar: &RbitnetSidecar,
    cache: &Path,
    model_id: &str,
) -> Result<String, String> {
    let kind = resolve_kind(model_id);
    if let Ok(mut guard) = sidecar.model_id.lock() {
        *guard = kind.id().to_string();
    }
    if http_ready_async().await {
        return Ok(base_url());
    }
    if sidecar.is_child_alive() {
        for _ in 0..40 {
            if http_ready_async().await {
                return Ok(base_url());
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
    let bin = find_server_binary(cache)
        .ok_or_else(|| "SERVICE_UNAVAILABLE:RBITNET_BINARY_MISSING".to_string())?;
    if !model_present(cache, kind) {
        return Err("MODEL_MISSING:RBITNET_WEIGHTS".into());
    }
    let (gguf, tok) = model_paths(cache, kind);
    {
        let mut guard = sidecar
            .child
            .lock()
            .map_err(|_| "SERVICE_UNAVAILABLE".to_string())?;
        if let Some(mut old) = guard.take() {
            let _ = old.kill();
            let _ = old.wait();
        }
        *guard = Some(spawn_server(&bin, &gguf, &tok, kind)?);
    }
    for _ in 0..80 {
        if http_ready_async().await {
            return Ok(base_url());
        }
        if !sidecar.is_child_alive() {
            return Err("SERVICE_UNAVAILABLE:RBITNET_EXITED".into());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err("SERVICE_UNAVAILABLE:RBITNET_NOT_READY".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_ids_parse() {
        assert_eq!(
            RbitnetModelKind::parse(RBITNET_QWEN_ID),
            Some(RbitnetModelKind::QwenGguf)
        );
        assert_eq!(
            RbitnetModelKind::parse(RBITNET_BITNET_ID),
            Some(RbitnetModelKind::BitNetB158)
        );
        assert_eq!(RbitnetModelKind::parse("nope"), None);
    }

    #[test]
    fn pins_match_release_assets() {
        let (name, sha, bytes) = rbitnet_platform_archive();
        assert!(name.contains("rbitnet-server-v0.1.0"));
        assert_eq!(sha.len(), 64);
        assert!(bytes > 1_000_000);
        assert_eq!(RBITNET_TAG, "v0.1.0");
        assert_eq!(RBITNET_QWEN_BYTES, 1_117_320_736);
        assert_eq!(RBITNET_BITNET_BYTES, 1_187_801_280);
    }

    #[test]
    fn status_reports_missing_binary() {
        let tmp =
            std::env::temp_dir().join(format!("song-maker-rbitnet-status-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let sidecar = RbitnetSidecar::default();
        let st = status(&tmp, &sidecar, RBITNET_QWEN_ID);
        assert!(!st.binary_present);
        assert!(!st.model_present);
        assert_eq!(st.catalog.len(), 2);
        assert_eq!(st.release_tag, "v0.1.0");
        assert!(st.message_fr.contains("hors installeur"));
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
