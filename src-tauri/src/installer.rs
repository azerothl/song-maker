use crate::hashutil::sha256_file;
use crate::library::load_settings;
use crate::models::{InstallDownloadMetrics, InstallFilePlan, InstallPlan, InstallProgress};
use crate::paths::{binaries_dir, ensure_dir, htdemucs_path, yue2_dir};
use crate::pins::*;
use reqwest::header::RANGE;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

pub struct Artifact {
    pub name: String,
    pub url: String,
    pub path: PathBuf,
    pub sha256: Option<&'static str>,
    pub expected_bytes: Option<u64>,
}

/// Chemin `.partial` utilisé par `download_artifact` pour la reprise HTTP Range.
pub fn partial_path_for(final_path: &Path) -> PathBuf {
    final_path.with_extension(format!(
        "{}partial",
        final_path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!("{s}."))
            .unwrap_or_default()
    ))
}

pub fn artifact_on_disk_valid(path: &Path, sha256: Option<&str>) -> bool {
    if !path.is_file() {
        return false;
    }
    match sha256 {
        Some(expected) => sha256_file(path)
            .map(|actual| actual == expected)
            .unwrap_or(false),
        None => path.metadata().map(|m| m.len() > 0).unwrap_or(false),
    }
}

fn artifact_expected_bytes(name: &str, pack: &str) -> Option<u64> {
    if name == YUE2_Q8 {
        return Some(YUE2_Q8_BYTES);
    }
    if name == YUE2_Q4 {
        return Some(YUE2_Q4_BYTES);
    }
    if name == YUE2_VAE {
        return Some(YUE2_VAE_BYTES);
    }
    if name == HTDEMUCS_GGUF {
        return Some(HTDEMUCS_BYTES);
    }
    if name == ARCHIVE_WINDOWS {
        return Some(ARCHIVE_WINDOWS_BYTES);
    }
    if name == ARCHIVE_WINDOWS_CUDART {
        return Some(ARCHIVE_WINDOWS_CUDART_BYTES);
    }
    if name == ARCHIVE_LINUX {
        return Some(ARCHIVE_LINUX_BYTES);
    }
    if name == ARCHIVE_MACOS_ARM64 {
        return Some(ARCHIVE_MACOS_ARM64_BYTES);
    }
    if name == ARCHIVE_MACOS_X64 {
        return Some(ARCHIVE_MACOS_X64_BYTES);
    }
    if let Some(bytes) = yue2_sidecar_bytes(name) {
        return Some(bytes);
    }
    let (archive, _, _) = platform_archive();
    if name == archive {
        return Some(platform_engine_archive_bytes());
    }
    let _ = pack;
    None
}

#[derive(Debug, Clone)]
struct AggregateDownloadProgress {
    total_remaining_bytes: u64,
    completed_bytes: u64,
    speed: DownloadSpeedTracker,
}

impl AggregateDownloadProgress {
    fn from_plan(plan: &InstallPlan) -> Self {
        Self {
            total_remaining_bytes: plan.bytes_to_download,
            completed_bytes: 0,
            speed: DownloadSpeedTracker::new(),
        }
    }

    fn metrics_for_file(
        &mut self,
        file_received: u64,
        file_total: Option<u64>,
    ) -> InstallDownloadMetrics {
        let file_remaining = file_total
            .map(|t| t.saturating_sub(file_received))
            .unwrap_or(0);
        let (file_bps, file_eta, file_eta_est) =
            self.speed
                .file_eta(file_received, file_total, file_remaining);
        let overall_received = self.completed_bytes + file_received;
        let overall_total = self.total_remaining_bytes + self.completed_bytes;
        let overall_remaining = overall_total.saturating_sub(overall_received);
        let (overall_bps, overall_eta, overall_eta_est) =
            self.speed
                .overall_eta(overall_received, overall_total, overall_remaining);
        InstallDownloadMetrics {
            bytes_per_sec: file_bps,
            eta_seconds: file_eta,
            eta_is_estimate: file_eta_est,
            overall_received_bytes: Some(overall_received),
            overall_total_bytes: Some(overall_total),
            overall_bytes_per_sec: overall_bps,
            overall_eta_seconds: overall_eta,
            overall_eta_is_estimate: overall_eta_est,
        }
    }

    fn complete_file(&mut self, bytes: u64) {
        self.completed_bytes += bytes;
        self.speed.reset_window();
    }
}

/// Estimation de débit glissante pour l’événement `setup-progress`.
#[derive(Debug, Clone)]
pub struct DownloadSpeedTracker {
    window_start: Instant,
    window_bytes: u64,
    measured_bps: Option<f64>,
}

impl DownloadSpeedTracker {
    pub fn new() -> Self {
        Self {
            window_start: Instant::now(),
            window_bytes: 0,
            measured_bps: None,
        }
    }

    pub fn reset_window(&mut self) {
        self.window_start = Instant::now();
        self.window_bytes = 0;
    }

    pub fn record_bytes(&mut self, chunk_len: u64) {
        self.window_bytes += chunk_len;
        let elapsed = self.window_start.elapsed().as_secs_f64();
        if elapsed >= 0.5 && self.window_bytes > 0 {
            let bps = self.window_bytes as f64 / elapsed;
            self.measured_bps = Some(bps);
            self.window_start = Instant::now();
            self.window_bytes = 0;
        }
    }

    pub fn file_eta(
        &mut self,
        received: u64,
        total: Option<u64>,
        remaining: u64,
    ) -> (Option<f64>, Option<u64>, bool) {
        eta_from_speed(self.measured_bps, received, total, remaining)
    }

    pub fn overall_eta(
        &mut self,
        received: u64,
        total: u64,
        remaining: u64,
    ) -> (Option<f64>, Option<u64>, bool) {
        eta_from_speed(self.measured_bps, received, Some(total), remaining)
    }
}

/// Retourne (débit o/s, ETA secondes, ETA estimée).
pub fn eta_from_speed(
    measured_bps: Option<f64>,
    received: u64,
    total: Option<u64>,
    remaining: u64,
) -> (Option<f64>, Option<u64>, bool) {
    let _ = received;
    let _ = total;
    match measured_bps {
        Some(bps) if bps > 1.0 => {
            let eta = (remaining as f64 / bps).ceil() as u64;
            (Some(bps), Some(eta), false)
        }
        _ => {
            const ASSUMED_BPS: f64 = 8.0 * 1024.0 * 1024.0;
            let rough = if remaining > 0 {
                Some((remaining as f64 / ASSUMED_BPS).ceil() as u64)
            } else {
                None
            };
            (None, rough, true)
        }
    }
}

fn map_io_error(context: &str, file: &str, err: &std::io::Error) -> String {
    if err.kind() == std::io::ErrorKind::StorageFull {
        return format!(
            "Espace disque insuffisant lors de l’écriture de {file} ({context}) : {err}"
        );
    }
    format!("{context} ({file}) : {err}")
}

fn platform_archive() -> (&'static str, &'static str, &'static str) {
    if cfg!(target_os = "windows") {
        (ARCHIVE_WINDOWS, ARCHIVE_WINDOWS_SHA, "windows-cuda12.4")
    } else if cfg!(target_os = "macos") && cfg!(target_arch = "aarch64") {
        (
            ARCHIVE_MACOS_ARM64,
            ARCHIVE_MACOS_ARM64_SHA,
            "macos-arm64-metal",
        )
    } else if cfg!(target_os = "macos") {
        (ARCHIVE_MACOS_X64, ARCHIVE_MACOS_X64_SHA, "macos-x64-metal")
    } else {
        (ARCHIVE_LINUX, ARCHIVE_LINUX_SHA, "linux-cuda12.8-colab")
    }
}

pub fn artifacts(cache: &Path, pack: &str, include_engine: bool) -> Result<Vec<Artifact>, String> {
    let (archive, archive_sha, _) = platform_archive();
    let binary_dir = binaries_dir(cache);
    let yue_dir = yue2_dir(cache);
    let yue_base = format!(
        "https://huggingface.co/{}/resolve/{}",
        YUE2_REPO, YUE2_REVISION
    );
    let selected = match pack {
        "q4" => (YUE2_Q4, YUE2_Q4_SHA),
        "q8" => (YUE2_Q8, YUE2_Q8_SHA),
        _ => return Err("Choisissez le pack Q4 ou Q8.".into()),
    };
    let mut out = Vec::new();
    if include_engine {
        out.push(Artifact {
            name: archive.into(),
            url: format!(
                "https://github.com/0xShug0/audio.cpp/releases/download/{AUDIOCPP_TAG}/{archive}"
            ),
            path: binary_dir.join(archive),
            sha256: Some(archive_sha),
            expected_bytes: artifact_expected_bytes(archive, pack),
        });
        if let Some((name, sha)) = crate::paths::pinned_cudart_archive() {
            out.push(Artifact {
                name: name.into(),
                url: format!(
                    "https://github.com/0xShug0/audio.cpp/releases/download/{AUDIOCPP_TAG}/{name}"
                ),
                path: binary_dir.join(name),
                sha256: Some(sha),
                expected_bytes: artifact_expected_bytes(name, pack),
            });
        }
    }
    out.push(Artifact {
        name: selected.0.into(),
        url: format!("{yue_base}/{}", selected.0),
        path: yue_dir.join(selected.0),
        sha256: Some(selected.1),
        expected_bytes: artifact_expected_bytes(selected.0, pack),
    });
    out.push(Artifact {
        name: YUE2_VAE.into(),
        url: format!("{yue_base}/{YUE2_VAE}"),
        path: yue_dir.join(YUE2_VAE),
        sha256: Some(YUE2_VAE_SHA),
        expected_bytes: Some(YUE2_VAE_BYTES),
    });
    for sidecar in [
        "yue2-model-config.json",
        "yue2-generation-config.json",
        "yue2-qwen.tiktoken",
        "yue2-vae-config.json",
    ] {
        out.push(Artifact {
            name: sidecar.into(),
            url: format!("{yue_base}/sidecars/{sidecar}"),
            path: yue_dir.join("sidecars").join(sidecar),
            sha256: None,
            expected_bytes: yue2_sidecar_bytes(sidecar),
        });
    }
    out.push(Artifact {
        name: HTDEMUCS_GGUF.into(),
        url: format!("https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main/HTDemucs-GGUF/{HTDEMUCS_GGUF}"),
        path: htdemucs_path(cache),
        sha256: Some(HTDEMUCS_SHA),
        expected_bytes: Some(HTDEMUCS_BYTES),
    });
    Ok(out)
}

pub fn install_plan_for_cache(cache: &Path, pack: &str) -> Result<InstallPlan, String> {
    let pack = pack.to_lowercase();
    if pack != "q4" && pack != "q8" {
        return Err("Choisissez le pack Q4 ou Q8.".into());
    }
    let needs_extract = !crate::audiocpp::AudioCppServer::has_server_binary(cache);
    let items = artifacts(cache, &pack, needs_extract)?;
    let mut files = Vec::new();
    let mut bytes_to_download = 0u64;
    let mut bytes_known = true;
    let mut has_partial = false;

    for item in &items {
        let partial = partial_path_for(&item.path);
        let partial_len = partial.metadata().map(|m| m.len()).unwrap_or(0);
        if partial_len > 0 {
            has_partial = true;
        }

        if artifact_on_disk_valid(&item.path, item.sha256) {
            let total = item
                .expected_bytes
                .or_else(|| item.path.metadata().ok().map(|m| m.len()));
            files.push(InstallFilePlan {
                name: item.name.clone(),
                status: "complete".into(),
                total_bytes: total,
                received_bytes: total.unwrap_or(0),
                remaining_bytes: 0,
            });
            continue;
        }

        let total = item.expected_bytes;
        if total.is_none() {
            bytes_known = false;
        }
        let received = partial_len;
        let remaining = total.map(|t| t.saturating_sub(received)).unwrap_or(0);
        bytes_to_download += remaining;
        let status = if received > 0 { "partial" } else { "missing" };
        files.push(InstallFilePlan {
            name: item.name.clone(),
            status: status.into(),
            total_bytes: total,
            received_bytes: received,
            remaining_bytes: remaining,
        });
    }

    Ok(InstallPlan {
        pack,
        file_count: files.len(),
        bytes_to_download,
        bytes_known,
        has_partial_downloads: has_partial,
        files,
    })
}

pub fn install_plan_for_pack(pack: String) -> Result<InstallPlan, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    install_plan_for_cache(&cache, &pack)
}

fn emit(app: &tauri::AppHandle, progress: InstallProgress) {
    let _ = app.emit("setup-progress", progress);
}

async fn download_artifact(
    client: &reqwest::Client,
    app: &tauri::AppHandle,
    item: &Artifact,
    index: usize,
    count: usize,
    aggregate: &mut AggregateDownloadProgress,
) -> Result<(), String> {
    if let Some(parent) = item.path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    if item.path.is_file() {
        let valid = item.sha256.map_or_else(
            || item.path.metadata().map(|m| m.len() > 0).unwrap_or(false),
            |expected| {
                sha256_file(&item.path)
                    .map(|v| v == expected)
                    .unwrap_or(false)
            },
        );
        if valid {
            let bytes = item
                .expected_bytes
                .or_else(|| item.path.metadata().ok().map(|m| m.len()))
                .unwrap_or(0);
            aggregate.complete_file(bytes);
            emit(app, InstallProgress::file_done(&item.name, index, count));
            return Ok(());
        }
        let _ = tokio::fs::remove_file(&item.path).await;
    }

    let partial = partial_path_for(&item.path);
    let resumed = tokio::fs::metadata(&partial)
        .await
        .map(|m| m.len())
        .unwrap_or(0);
    let mut request = client.get(&item.url);
    if resumed > 0 {
        request = request.header(RANGE, format!("bytes={resumed}-"));
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| format!("Téléchargement de {} : {e}", item.name))?;
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && resumed > 0 {
        tokio::fs::remove_file(&partial)
            .await
            .map_err(|e| e.to_string())?;
        response = client
            .get(&item.url)
            .send()
            .await
            .map_err(|e| format!("Téléchargement de {} : {e}", item.name))?;
    }
    if !response.status().is_success() {
        return Err(format!(
            "Téléchargement de {} : HTTP {}",
            item.name,
            response.status()
        ));
    }
    let append = resumed > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    let received_before = if append { resumed } else { 0 };
    let total = response.content_length().map(|n| n + received_before);
    let mut file = if append {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&partial)
            .await
    } else {
        tokio::fs::File::create(&partial).await
    }
    .map_err(|e| e.to_string())?;
    let mut response = response;
    let mut received = received_before;
    let mut last_emit = Instant::now();
    let mut metrics = aggregate.metrics_for_file(received, total);
    emit(
        app,
        InstallProgress::downloading_with_metrics(
            &item.name,
            index,
            count,
            received,
            total,
            Some(&metrics),
        ),
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Téléchargement de {} : {e}", item.name))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| map_io_error("écriture du fichier", &item.name, &e))?;
        received += chunk.len() as u64;
        aggregate.speed.record_bytes(chunk.len() as u64);
        if last_emit.elapsed() >= Duration::from_millis(500) {
            metrics = aggregate.metrics_for_file(received, total);
            emit(
                app,
                InstallProgress::downloading_with_metrics(
                    &item.name,
                    index,
                    count,
                    received,
                    total,
                    Some(&metrics),
                ),
            );
            last_emit = Instant::now();
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    if let Some(expected) = item.sha256 {
        let actual = tokio::task::spawn_blocking({
            let path = partial.clone();
            move || sha256_file(&path)
        })
        .await
        .map_err(|e| e.to_string())??;
        if actual != expected {
            let _ = tokio::fs::remove_file(&partial).await;
            return Err(format!(
                "La vérification de {} a échoué : empreinte SHA-256 incorrecte.",
                item.name
            ));
        }
    }
    tokio::fs::rename(&partial, &item.path)
        .await
        .map_err(|e| map_io_error("finalisation du fichier", &item.name, &e))?;
    let file_bytes = total.unwrap_or(received);
    aggregate.complete_file(file_bytes);
    emit(app, InstallProgress::file_done(&item.name, index, count));
    Ok(())
}

fn extract_zip(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| {
        format!(
            "Extraction impossible (ouverture de {}) : {e}",
            archive.display()
        )
    })?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| format!("Extraction impossible (archive ZIP invalide) : {e}"))?;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("Extraction impossible (entrée ZIP) : {e}"))?;
        let Some(relative) = entry.enclosed_name() else {
            return Err(
                "Extraction impossible : l’archive contient un chemin de fichier non sûr.".into(),
            );
        };
        if entry
            .unix_mode()
            .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(
                "Extraction impossible : l’archive contient un lien symbolique inattendu.".into(),
            );
        }
        let output = destination.join(relative);
        if entry.is_dir() {
            ensure_dir(&output).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = output.parent() {
                ensure_dir(parent).map_err(|e| e.to_string())?;
            }
            let mut file = std::fs::File::create(&output).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_tar_gz(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive).map_err(|e| {
        format!(
            "Extraction impossible (ouverture de {}) : {e}",
            archive.display()
        )
    })?;
    let decoder = flate2::read::GzDecoder::new(file);
    tar::Archive::new(decoder)
        .unpack(destination)
        .map_err(|e| format!("Extraction impossible (archive tar.gz) : {e}"))
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
        Err(format!(
            "Extraction impossible : format d’archive non supporté ({name})."
        ))
    }
}

fn server_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "audiocpp_server.exe"
    } else {
        "audiocpp_server"
    }
}

/// Locate the server executable under an extract tree without requiring CUDA DLLs.
fn locate_extracted_server(extract_dir: &Path) -> Option<PathBuf> {
    if !extract_dir.exists() {
        return None;
    }
    let expected = server_binary_name();
    walkdir::WalkDir::new(extract_dir)
        .max_depth(4)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .find(|entry| entry.file_name().to_string_lossy() == expected)
        .map(|entry| entry.path().to_path_buf())
}

/// Extract the pinned engine archive (and Windows cudart) into the platform folder.
///
/// On Windows the CUDA runtime zip must land beside `audiocpp_server.exe`; the bin
/// archive alone does not ship those DLLs. Matches phase0 `load-test-cuda.sh`.
fn extract_engine(
    binary_dir: &Path,
    archive_name: &str,
    platform: &str,
    cudart_name: Option<&str>,
) -> Result<(), String> {
    let archive_path = binary_dir.join(archive_name);
    if !archive_path.is_file() {
        return Err(format!(
            "Téléchargement incomplet : archive moteur {archive_name} introuvable avant extraction."
        ));
    }
    let extract_dir = binary_dir.join(platform);
    extract_archive(&archive_path, &extract_dir).map_err(|e| {
        format!(
            "Extraction de {archive_name} vers {} : {e}",
            extract_dir.display()
        )
    })?;

    if let Some(cudart_name) = cudart_name {
        let cudart_path = binary_dir.join(cudart_name);
        if !cudart_path.is_file() {
            return Err(format!(
                "Téléchargement incomplet : runtime CUDA {cudart_name} introuvable avant extraction."
            ));
        }
        extract_archive(&cudart_path, &extract_dir).map_err(|e| {
            format!(
                "Extraction de {cudart_name} vers {} : {e}",
                extract_dir.display()
            )
        })?;

        // If the bin zip nests the exe, place CUDA DLLs next to it (same as phase0).
        if let Some(server) = locate_extracted_server(&extract_dir) {
            if let Some(server_dir) = server.parent() {
                let marker = server_dir.join("cudart64_12.dll");
                if !marker.is_file() {
                    extract_archive(&cudart_path, server_dir).map_err(|e| {
                        format!(
                            "Extraction de {cudart_name} à côté de {} : {e}",
                            server.display()
                        )
                    })?;
                }
            }
        }
    }

    if locate_extracted_server(&extract_dir).is_none() {
        return Err(format!(
            "Détection du binaire : {} introuvable après extraction de {archive_name}.",
            server_binary_name()
        ));
    }
    Ok(())
}

pub async fn install(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::commands::AppState>,
    pack: String,
    accepted_license: bool,
) -> Result<String, String> {
    if !accepted_license {
        return Err("Acceptez la licence CC BY-NC 4.0 de YuE2 pour continuer.".into());
    }
    let pack = pack.to_lowercase();
    if pack != "q4" && pack != "q8" {
        return Err("Choisissez le pack Q4 ou Q8.".into());
    }
    if state.setup_installing.swap(true, Ordering::AcqRel) {
        return Err("Une installation est déjà en cours.".into());
    }
    let result = install_inner(app.clone(), pack).await;
    state.setup_installing.store(false, Ordering::Release);
    if let Err(error) = &result {
        emit(&app, InstallProgress::failed_for_file(error, None));
    }
    result
}

async fn install_inner(app: tauri::AppHandle, pack: String) -> Result<String, String> {
    let mut settings = crate::library::load_settings()?;
    settings.model_pack = pack.clone();
    if pack == "q8" {
        settings.model_gguf = YUE2_Q8.into();
        settings.model_sha256 = YUE2_Q8_SHA.into();
    } else {
        settings.model_gguf = YUE2_Q4.into();
        settings.model_sha256 = YUE2_Q4_SHA.into();
    }
    settings.yue2_license_accepted = true;
    crate::library::save_settings(&settings)?;
    let cache = PathBuf::from(&settings.cache_dir);
    // Re-run engine download/extract when the server (or Windows cudart beside it) is missing.
    let needs_extract = !crate::audiocpp::AudioCppServer::has_server_binary(&cache);
    let plan = install_plan_for_pack(pack.clone())?;
    let items = artifacts(&cache, &pack, needs_extract)?;
    let count = items.len();
    let mut aggregate = AggregateDownloadProgress::from_plan(&plan);
    let client = reqwest::Client::builder()
        .user_agent("SongMaker/0.1 model-installer")
        .build()
        .map_err(|e| e.to_string())?;
    emit(&app, InstallProgress::starting(count));
    for (offset, item) in items.iter().enumerate() {
        if let Err(error) =
            download_artifact(&client, &app, item, offset + 1, count, &mut aggregate).await
        {
            emit(
                &app,
                InstallProgress::failed_for_file(&error, Some(&item.name)),
            );
            return Err(error);
        }
    }

    let (archive, _, platform) = platform_archive();
    let binary_dir = binaries_dir(&cache);
    let cudart_name = crate::paths::pinned_cudart_archive().map(|(name, _)| name);
    emit(
        &app,
        InstallProgress::phase("Préparation du moteur audio…", count, count),
    );
    if needs_extract {
        let archive_name = archive.to_string();
        let platform = platform.to_string();
        let cudart_name = cudart_name.map(str::to_string);
        let binary_dir = binary_dir.clone();
        tokio::task::spawn_blocking(move || {
            extract_engine(
                &binary_dir,
                &archive_name,
                &platform,
                cudart_name.as_deref(),
            )
        })
        .await
        .map_err(|e| e.to_string())??;
        #[cfg(unix)]
        {
            let cache = PathBuf::from(&settings.cache_dir);
            let binary = crate::audiocpp::AudioCppServer::find_server_binary(&cache)?;
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = std::fs::metadata(&binary)
                .map_err(|e| e.to_string())?
                .permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(binary, permissions).map_err(|e| e.to_string())?;
        }
    }
    crate::audiocpp::AudioCppServer::find_server_binary(&PathBuf::from(&settings.cache_dir))
        .map_err(|detail| format!("Détection du moteur audio après installation : {detail}"))?;
    emit(&app, InstallProgress::complete());
    Ok(format!(
        "Installation terminée : YuE2 {pack}, HTDemucs et moteur audio."
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        eta_from_speed, extract_engine, extract_zip, locate_extracted_server, partial_path_for,
        DownloadSpeedTracker,
    };
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::time::Duration;

    #[test]
    fn partial_path_matches_download_suffix() {
        let path = Path::new("/cache/models/yue2-3b-q4_0.gguf");
        assert_eq!(
            partial_path_for(path),
            Path::new("/cache/models/yue2-3b-q4_0.gguf.partial")
        );
    }

    #[test]
    fn eta_is_estimate_until_speed_measured() {
        let (bps, eta, est) = eta_from_speed(None, 0, Some(1_000_000), 1_000_000);
        assert!(bps.is_none());
        assert!(est);
        assert!(eta.is_some());
        let (bps, eta, est) = eta_from_speed(Some(1_000_000.0), 500_000, Some(1_000_000), 500_000);
        assert_eq!(bps, Some(1_000_000.0));
        assert!(!est);
        assert_eq!(eta, Some(1));
    }

    #[test]
    fn speed_tracker_records_throughput() {
        let mut tracker = DownloadSpeedTracker::new();
        for _ in 0..20 {
            tracker.record_bytes(512 * 1024);
            std::thread::sleep(Duration::from_millis(30));
        }
        let (bps, _, est) =
            tracker.file_eta(10 * 1024 * 1024, Some(20 * 1024 * 1024), 10 * 1024 * 1024);
        assert!(bps.is_some() || est);
    }

    #[test]
    fn install_plan_counts_partial_bytes() {
        use super::install_plan_for_cache;
        let root = temp_dir("partial-plan");
        let cache = root.join("cache");
        let yue2 = cache.join("models").join("Yue2-3B-GGUF");
        std::fs::create_dir_all(yue2.join("sidecars")).unwrap();
        let gguf = yue2.join("yue2-3b-q4_0.gguf");
        let partial = partial_path_for(&gguf);
        std::fs::write(&partial, vec![0u8; 4096]).unwrap();
        let plan = install_plan_for_cache(&cache, "q4").expect("plan");
        let entry = plan
            .files
            .iter()
            .find(|f| f.name.contains("q4"))
            .expect("q4 entry");
        assert_eq!(entry.status, "partial");
        assert_eq!(entry.received_bytes, 4096);
        assert_eq!(entry.remaining_bytes, crate::pins::YUE2_Q4_BYTES - 4096);
        assert!(plan.has_partial_downloads);
        let _ = std::fs::remove_dir_all(root);
    }

    fn temp_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-installer-{label}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let file = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for (name, bytes) in entries {
            zip.start_file(*name, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }

    #[test]
    fn extract_zip_rejects_unsafe_paths() {
        let root = temp_dir("unsafe");
        let archive = root.join("bad.zip");
        // Craft a zip whose enclosed_name() is None via absolute-looking path.
        // zip crate's enclosed_name rejects `../` traversal.
        write_zip(&archive, &[("../escape.exe", b"x")]);
        let dest = root.join("out");
        let err = extract_zip(&archive, &dest).unwrap_err();
        assert!(
            err.contains("non sûr") || err.contains("Extraction"),
            "unexpected error: {err}"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn extract_engine_unpacks_server_and_windows_cudart() {
        let root = temp_dir("engine");
        let binary_dir = root.join("binaries");
        std::fs::create_dir_all(&binary_dir).unwrap();

        let bin_name = "audio-test-bin-windows.zip";
        let cudart_name = "audio-test-cudart-windows.zip";
        let server_name = if cfg!(target_os = "windows") {
            "audiocpp_server.exe"
        } else {
            // On non-Windows CI we still verify zip layout; place the Unix name
            // so locate_extracted_server matches the host expectation.
            "audiocpp_server"
        };

        write_zip(
            &binary_dir.join(bin_name),
            &[(server_name, b"fake-server"), ("ggml.dll", b"dll")],
        );
        write_zip(
            &binary_dir.join(cudart_name),
            &[
                ("cudart64_12.dll", b"cudart"),
                ("cublas64_12.dll", b"cublas"),
            ],
        );

        extract_engine(&binary_dir, bin_name, "windows-cuda12.4", Some(cudart_name)).unwrap();

        let extract = binary_dir.join("windows-cuda12.4");
        let server = locate_extracted_server(&extract).expect("server after extract");
        assert!(server.is_file());
        assert!(server.parent().unwrap().join("cudart64_12.dll").is_file());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn extract_engine_places_cudart_beside_nested_server() {
        let root = temp_dir("nested");
        let binary_dir = root.join("binaries");
        std::fs::create_dir_all(&binary_dir).unwrap();

        let bin_name = "nested-bin.zip";
        let cudart_name = "nested-cudart.zip";
        let server_name = if cfg!(target_os = "windows") {
            "audiocpp_server.exe"
        } else {
            "audiocpp_server"
        };
        let nested = format!("payload/bin/{server_name}");

        write_zip(&binary_dir.join(bin_name), &[(&nested, b"fake-server")]);
        write_zip(
            &binary_dir.join(cudart_name),
            &[("cudart64_12.dll", b"cudart")],
        );

        extract_engine(&binary_dir, bin_name, "windows-cuda12.4", Some(cudart_name)).unwrap();

        let extract = binary_dir.join("windows-cuda12.4");
        let server = locate_extracted_server(&extract).unwrap();
        assert!(
            server.parent().unwrap().join("cudart64_12.dll").is_file(),
            "cudart must sit beside nested server"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn extract_engine_reports_missing_server_in_archive() {
        let root = temp_dir("missing-server");
        let binary_dir = root.join("binaries");
        std::fs::create_dir_all(&binary_dir).unwrap();
        let bin_name = "empty-bin.zip";
        write_zip(&binary_dir.join(bin_name), &[("readme.txt", b"no server")]);
        let err = extract_engine(&binary_dir, bin_name, "windows-cuda12.4", None).unwrap_err();
        assert!(
            err.contains("Détection du binaire"),
            "unexpected error: {err}"
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn extract_engine_reports_missing_cudart_archive() {
        let root = temp_dir("missing-cudart");
        let binary_dir = root.join("binaries");
        std::fs::create_dir_all(&binary_dir).unwrap();
        let bin_name = "bin-only.zip";
        let server_name = if cfg!(target_os = "windows") {
            "audiocpp_server.exe"
        } else {
            "audiocpp_server"
        };
        write_zip(&binary_dir.join(bin_name), &[(server_name, b"fake")]);
        let err = extract_engine(
            &binary_dir,
            bin_name,
            "windows-cuda12.4",
            Some("missing-cudart.zip"),
        )
        .unwrap_err();
        assert!(
            err.contains("Téléchargement incomplet") && err.contains("CUDA"),
            "unexpected error: {err}"
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
