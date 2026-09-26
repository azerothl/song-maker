use crate::hashutil::verify_sha256;
use crate::library::load_settings;
use crate::models::HealthSnapshot;
use crate::paths::{binaries_dir, htdemucs_path, yue2_dir};
use crate::pins::*;
use std::path::PathBuf;
use std::process::Command;

pub fn detect_gpu() -> (bool, Option<String>, Option<String>, Option<u64>) {
    let output = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,driver_version,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output();
    let Ok(output) = output else {
        return (false, None, None, None);
    };
    if !output.status.success() {
        return (false, None, None, None);
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().next().unwrap_or("").trim();
    if line.is_empty() {
        return (false, None, None, None);
    }
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    let name = parts.first().map(|s| (*s).to_string());
    let driver = parts.get(1).map(|s| (*s).to_string());
    let vram = parts
        .get(2)
        .and_then(|s| s.parse::<f64>().ok())
        .map(|v| v as u64);
    (true, name, driver, vram)
}

pub fn check_health(server_url: Option<&str>) -> HealthSnapshot {
    let settings = load_settings().unwrap_or_else(|_| crate::library::default_settings());
    let (cuda, gpu_name, driver, vram) = detect_gpu();
    let suggested = if vram.unwrap_or(0) >= VRAM_Q8_THRESHOLD_MIB {
        "q8"
    } else {
        "q4"
    };

    let cache = PathBuf::from(&settings.cache_dir);
    let archive = binaries_dir(&cache).join(&settings.binary_archive);
    let binary_ok = archive.exists()
        && verify_sha256(&archive, &settings.binary_sha256).is_ok();

    let yue2 = yue2_dir(&cache);
    let gguf = yue2.join(&settings.model_gguf);
    let vae = yue2.join(YUE2_VAE);
    let models_ok = gguf.exists()
        && verify_sha256(&gguf, &settings.model_sha256).is_ok()
        && vae.exists()
        && verify_sha256(&vae, YUE2_VAE_SHA).is_ok()
        && htdemucs_path(&cache).exists()
        && verify_sha256(&htdemucs_path(&cache), HTDEMUCS_SHA).is_ok();

    let server_healthy = server_url
        .and_then(|url| {
            let trimmed = url.trim_start_matches("http://");
            let (host, port) = trimmed.split_once(':')?;
            let port: u16 = port.parse().ok()?;
            Some(crate::audiocpp::AudioCppServer::tcp_health(host, port))
        })
        .unwrap_or(false);

    let message = if !cuda {
        "Ce build exige NVIDIA CUDA. Driver Windows ≥ 551.61, ou Linux ≥ 570.26 pour l’archive épinglée.".into()
    } else if !models_ok {
        "Télécharger YuE2 Q8 (ou Q4) et HTDemucs.".into()
    } else if !binary_ok {
        "Télécharger le binaire audio.cpp épinglé (phase 0).".into()
    } else if !server_healthy {
        "Artefacts OK. Démarrez le serveur ou lancez une génération.".into()
    } else {
        "Prêt.".into()
    };

    HealthSnapshot {
        cuda_available: cuda,
        gpu_name,
        driver_version: driver,
        vram_mib: vram,
        suggested_pack: suggested.into(),
        models_ok,
        binary_ok,
        server_healthy,
        server_url: server_url.map(|s| s.to_string()),
        message,
    }
}
