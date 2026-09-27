use crate::library::load_settings;
use crate::models::HealthSnapshot;
use crate::paths::{binaries_dir, htdemucs_path, yue2_dir};
use crate::pins::*;
use std::path::{Path, PathBuf};
use std::process::Command;

fn nvidia_smi_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    out.push(PathBuf::from("nvidia-smi"));
    #[cfg(windows)]
    {
        if let Some(root) = std::env::var_os("SystemRoot") {
            out.push(Path::new(&root).join("System32").join("nvidia-smi.exe"));
        }
        out.push(PathBuf::from(r"C:\Windows\System32\nvidia-smi.exe"));
        out.push(PathBuf::from(
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        ));
    }
    out
}

fn run_nvidia_smi(bin: &Path) -> Option<std::process::Output> {
    let mut cmd = Command::new(bin);
    cmd.args([
        "--query-gpu=name,driver_version,memory.total",
        "--format=csv,noheader,nounits",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Évite l'échec silencieux des spawns console depuis une app GUI Tauri.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.output().ok()
}

pub fn detect_gpu() -> (bool, Option<String>, Option<String>, Option<u64>) {
    for bin in nvidia_smi_candidates() {
        let Some(output) = run_nvidia_smi(&bin) else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let line = text.lines().next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
        let name = parts
            .first()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let driver = parts
            .get(1)
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let vram = parts.get(2).and_then(|s| {
            let cleaned = s.replace("MiB", "").replace("MB", "").trim().to_string();
            cleaned.parse::<f64>().ok().map(|v| v as u64)
        });
        if name.is_some() {
            return (true, name, driver, vram);
        }
    }
    (false, None, None, None)
}

/// Présence seule — pas de SHA-256 ici (les archives/GGUF font plusieurs Go ;
/// un hash sync bloquerait le thread UI Tauri à chaque get_health).
fn artifact_present(path: &Path) -> bool {
    path.is_file()
        && path
            .metadata()
            .map(|m| m.len() > 0)
            .unwrap_or(false)
}

pub fn check_health(server_url: Option<&str>) -> HealthSnapshot {
    let settings = load_settings().unwrap_or_else(|_| crate::library::default_settings());
    let (cuda, gpu_name, driver, vram) = if cfg!(target_os = "macos") {
        (true, Some("Apple Metal".into()), None, None)
    } else {
        detect_gpu()
    };
    let suggested = if vram.unwrap_or(0) >= VRAM_Q8_THRESHOLD_MIB {
        "q8"
    } else {
        "q4"
    };

    let cache = PathBuf::from(&settings.cache_dir);
    let bin_dir = binaries_dir(&cache);
    let archive = bin_dir.join(&settings.binary_archive);
    let mut binary_ok = artifact_present(&archive);
    if let Some((cudart_name, _)) = crate::paths::pinned_cudart_archive() {
        binary_ok = binary_ok && artifact_present(&bin_dir.join(cudart_name));
    }

    let yue2 = yue2_dir(&cache);
    let gguf = yue2.join(&settings.model_gguf);
    let vae = yue2.join(YUE2_VAE);
    let models_ok = artifact_present(&gguf)
        && artifact_present(&vae)
        && artifact_present(&htdemucs_path(&cache));

    let server_healthy = server_url
        .and_then(|url| {
            let trimmed = url.trim_start_matches("http://");
            let (host, port) = trimmed.split_once(':')?;
            let port: u16 = port.parse().ok()?;
            Some(crate::audiocpp::AudioCppServer::tcp_health(host, port))
        })
        .unwrap_or(false);

    let message = if !cuda {
        "Accélération indisponible. Song Maker requiert NVIDIA CUDA sous Windows/Linux, ou Apple Metal sous macOS.".into()
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
