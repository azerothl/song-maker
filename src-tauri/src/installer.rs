use crate::hashutil::sha256_file;
use crate::models::InstallProgress;
use crate::paths::{binaries_dir, ensure_dir, htdemucs_path, yue2_dir};
use crate::pins::*;
use reqwest::header::RANGE;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;

struct Artifact {
    name: String,
    url: String,
    path: PathBuf,
    sha256: Option<&'static str>,
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

fn artifacts(cache: &Path, pack: &str, include_engine: bool) -> Result<Vec<Artifact>, String> {
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
        });
        if let Some((name, sha)) = crate::paths::pinned_cudart_archive() {
            out.push(Artifact {
            name: name.into(),
            url: format!(
                "https://github.com/0xShug0/audio.cpp/releases/download/{AUDIOCPP_TAG}/{name}"
            ),
            path: binary_dir.join(name),
            sha256: Some(sha),
            });
        }
    }
    out.push(Artifact {
        name: selected.0.into(),
        url: format!("{yue_base}/{}", selected.0),
        path: yue_dir.join(selected.0),
        sha256: Some(selected.1),
    });
    out.push(Artifact {
        name: YUE2_VAE.into(),
        url: format!("{yue_base}/{YUE2_VAE}"),
        path: yue_dir.join(YUE2_VAE),
        sha256: Some(YUE2_VAE_SHA),
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
        });
    }
    out.push(Artifact {
        name: HTDEMUCS_GGUF.into(),
        url: format!("https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/main/HTDemucs-GGUF/{HTDEMUCS_GGUF}"),
        path: htdemucs_path(cache),
        sha256: Some(HTDEMUCS_SHA),
    });
    Ok(out)
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
            emit(app, InstallProgress::file_done(&item.name, index, count));
            return Ok(());
        }
        let _ = tokio::fs::remove_file(&item.path).await;
    }

    let partial = item.path.with_extension(format!(
        "{}partial",
        item.path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!("{s}."))
            .unwrap_or_default()
    ));
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
        .map_err(|e| format!("{} : {e}", item.name))?;
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE && resumed > 0 {
        tokio::fs::remove_file(&partial)
            .await
            .map_err(|e| e.to_string())?;
        response = client
            .get(&item.url)
            .send()
            .await
            .map_err(|e| format!("{} : {e}", item.name))?;
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
    emit(
        app,
        InstallProgress::downloading(&item.name, index, count, received, total),
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("{} : {e}", item.name))?
    {
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(500) {
            emit(
                app,
                InstallProgress::downloading(&item.name, index, count, received, total),
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
                "La vérification de {} a échoué (SHA-256).",
                item.name
            ));
        }
    }
    tokio::fs::rename(&partial, &item.path)
        .await
        .map_err(|e| e.to_string())?;
    emit(app, InstallProgress::file_done(&item.name, index, count));
    Ok(())
}

fn extract_archive(archive: &Path, destination: &Path) -> Result<(), String> {
    ensure_dir(destination).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let mut zip =
            zip::ZipArchive::new(file).map_err(|e| format!("Archive ZIP invalide : {e}"))?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let Some(relative) = entry.enclosed_name() else {
                return Err("L’archive contient un chemin de fichier non sûr.".into());
            };
            if entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
            {
                return Err("L’archive contient un lien symbolique inattendu.".into());
            }
            let output = destination.join(relative);
            if entry.is_dir() {
                ensure_dir(&output).map_err(|e| e.to_string())?;
            } else {
                if let Some(parent) = output.parent() {
                    ensure_dir(parent).map_err(|e| e.to_string())?;
                }
                let mut file = std::fs::File::create(output).map_err(|e| e.to_string())?;
                std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
            }
        }
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let decoder = flate2::read::GzDecoder::new(file);
        tar::Archive::new(decoder)
            .unpack(destination)
            .map_err(|e| format!("Extraction de l’archive impossible : {e}"))
    }
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
        emit(&app, InstallProgress::failed(error));
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
    let needs_extract = !crate::audiocpp::AudioCppServer::has_server_binary(&cache);
    let items = artifacts(&cache, &pack, needs_extract)?;
    let count = items.len();
    let client = reqwest::Client::builder()
        .user_agent("SongMaker/0.1 model-installer")
        .build()
        .map_err(|e| e.to_string())?;
    emit(&app, InstallProgress::starting(count));
    for (offset, item) in items.iter().enumerate() {
        download_artifact(&client, &app, item, offset + 1, count).await?;
    }

    let (archive, _, platform) = platform_archive();
    let archive_path = binaries_dir(&cache).join(archive);
    let extract_dir = binaries_dir(&cache).join(platform);
    emit(
        &app,
        InstallProgress::phase("Préparation du moteur audio…", count, count),
    );
    if needs_extract {
        tokio::task::spawn_blocking(move || extract_archive(&archive_path, &extract_dir))
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
    if !crate::audiocpp::AudioCppServer::has_server_binary(&PathBuf::from(&settings.cache_dir)) {
        return Err("Le serveur audio.cpp est absent de l’archive téléchargée.".into());
    }
    emit(&app, InstallProgress::complete());
    Ok(format!(
        "Installation terminée : YuE2 {pack}, HTDemucs et moteur audio."
    ))
}
