use crate::library::load_settings;
use crate::models::{
    HealthSnapshot, SetupGpuInfo, GPU_ACCEL_APPLE_METAL, GPU_ACCEL_NONE, GPU_ACCEL_NVIDIA,
};
use crate::paths::{htdemucs_path, yue2_dir};
use crate::pins::*;
use std::path::{Path, PathBuf};
use std::process::Command;

fn nvidia_smi_candidates() -> Vec<PathBuf> {
    #[cfg(not(windows))]
    {
        vec![PathBuf::from("nvidia-smi")]
    }
    #[cfg(windows)]
    {
        let mut out = vec![PathBuf::from("nvidia-smi")];
        if let Some(root) = std::env::var_os("SystemRoot") {
            out.push(Path::new(&root).join("System32").join("nvidia-smi.exe"));
        }
        out.push(PathBuf::from(r"C:\Windows\System32\nvidia-smi.exe"));
        out.push(PathBuf::from(
            r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
        ));
        out
    }
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

/// Parse la première ligne CSV de `nvidia-smi --query-gpu=name,driver_version,memory.total`.
pub fn parse_nvidia_smi_line(line: &str) -> Option<(String, Option<String>, Option<u64>)> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    let name = parts
        .first()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())?;
    let driver = parts
        .get(1)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let vram = parts.get(2).and_then(|s| {
        let cleaned = s.replace("MiB", "").replace("MB", "").trim().to_string();
        cleaned.parse::<f64>().ok().map(|v| v as u64)
    });
    Some((name, driver, vram))
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
        let line = text.lines().next().unwrap_or("");
        if let Some((name, driver, vram)) = parse_nvidia_smi_line(line) {
            return (true, Some(name), driver, vram);
        }
    }
    (false, None, None, None)
}

pub fn suggest_model_pack(vram_mib: Option<u64>, acceleration_kind: &str) -> (String, String) {
    if acceleration_kind == GPU_ACCEL_APPLE_METAL {
        return (
            "q4".into(),
            "Apple Metal est disponible sur ce Mac. Le pack Q4 est recommandé par défaut \
             (mémoire unifiée non mesurée par l’assistant)."
                .into(),
        );
    }
    if vram_mib.unwrap_or(0) >= VRAM_Q8_THRESHOLD_MIB {
        return (
            "q8".into(),
            format!(
                "VRAM détectée : {} Go — au-dessus du seuil de {} Go pour le pack Q8.",
                vram_mib.unwrap_or(0) / 1024,
                VRAM_Q8_THRESHOLD_MIB / 1024
            ),
        );
    }
    let vram_go = vram_mib.map(|v| v / 1024);
    let reason = if let Some(go) = vram_go {
        format!(
            "VRAM détectée : {} Go — en dessous du seuil de {} Go pour le pack Q8 ; Q4 recommandé.",
            go,
            VRAM_Q8_THRESHOLD_MIB / 1024
        )
    } else if acceleration_kind == GPU_ACCEL_NVIDIA {
        "GPU NVIDIA détecté sans mesure fiable de la VRAM — pack Q4 recommandé par prudence.".into()
    } else {
        "Aucun GPU compatible détecté — le pack Q4 est le plus léger si vous installez quand même."
            .into()
    };
    ("q4".into(), reason)
}

pub fn gpu_setup_info() -> SetupGpuInfo {
    if cfg!(target_os = "macos") {
        let (pack, reason) = suggest_model_pack(None, GPU_ACCEL_APPLE_METAL);
        return SetupGpuInfo {
            acceleration_kind: GPU_ACCEL_APPLE_METAL.into(),
            gpu_name: Some("Apple Metal".into()),
            driver_version: None,
            vram_mib: None,
            suggested_pack: pack,
            suggested_pack_reason_fr: reason,
            acceleration_available: true,
        };
    }
    let (nvidia_ok, name, driver, vram) = detect_gpu();
    let kind = if nvidia_ok {
        GPU_ACCEL_NVIDIA
    } else {
        GPU_ACCEL_NONE
    };
    let (pack, reason) = suggest_model_pack(vram, kind);
    SetupGpuInfo {
        acceleration_kind: kind.into(),
        gpu_name: name,
        driver_version: driver,
        vram_mib: vram,
        suggested_pack: pack,
        suggested_pack_reason_fr: reason,
        acceleration_available: kind != GPU_ACCEL_NONE,
    }
}

/// Présence seule — pas de SHA-256 ici (les archives/GGUF font plusieurs Go ;
/// un hash sync bloquerait le thread UI Tauri à chaque get_health).
fn artifact_present(path: &Path) -> bool {
    path.is_file() && path.metadata().map(|m| m.len() > 0).unwrap_or(false)
}

pub fn check_health(server_url: Option<&str>) -> HealthSnapshot {
    let settings = load_settings().unwrap_or_else(|_| crate::library::default_settings());
    let gpu = gpu_setup_info();
    let cuda = gpu.acceleration_available;

    let cache = PathBuf::from(&settings.cache_dir);
    let binary_ok = crate::audiocpp::AudioCppServer::has_server_binary(&cache);

    let yue2 = yue2_dir(&cache);
    let gguf = yue2.join(&settings.model_gguf);
    let vae = yue2.join(YUE2_VAE);
    let sidecars = [
        "yue2-model-config.json",
        "yue2-generation-config.json",
        "yue2-qwen.tiktoken",
        "yue2-vae-config.json",
    ];
    let models_ok = if settings.local_yue2_enabled {
        artifact_present(&gguf)
            && artifact_present(&vae)
            && artifact_present(&htdemucs_path(&cache))
            && sidecars
                .iter()
                .all(|name| artifact_present(&yue2.join("sidecars").join(name)))
    } else {
        artifact_present(&htdemucs_path(&cache))
    };

    let server_healthy = server_url
        .and_then(|url| {
            let trimmed = url.trim_start_matches("http://");
            let (host, port) = trimmed.split_once(':')?;
            let port: u16 = port.parse().ok()?;
            Some(crate::audiocpp::AudioCppServer::tcp_health(host, port))
        })
        .unwrap_or(false);

    let message = if gpu.acceleration_kind == GPU_ACCEL_NONE && settings.local_yue2_enabled {
        "Accélération indisponible. Song Maker requiert NVIDIA CUDA sous Windows/Linux, ou Apple Metal sous macOS.".into()
    } else if !settings.local_yue2_enabled && !models_ok {
        "Télécharger HTDemucs pour la séparation de stems.".into()
    } else if settings.local_yue2_enabled && !models_ok {
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
        acceleration_kind: gpu.acceleration_kind,
        gpu_name: gpu.gpu_name,
        driver_version: gpu.driver_version,
        vram_mib: gpu.vram_mib,
        suggested_pack: gpu.suggested_pack,
        suggested_pack_reason_fr: gpu.suggested_pack_reason_fr,
        local_yue2_enabled: settings.local_yue2_enabled,
        models_ok,
        binary_ok,
        server_healthy,
        server_url: server_url.map(|s| s.to_string()),
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_nvidia_smi_typical_line() {
        let (name, driver, vram) =
            parse_nvidia_smi_line("NVIDIA GeForce RTX 4090, 565.90, 24564").expect("parsed");
        assert_eq!(name, "NVIDIA GeForce RTX 4090");
        assert_eq!(driver.as_deref(), Some("565.90"));
        assert_eq!(vram, Some(24564));
    }

    #[test]
    fn parse_nvidia_smi_with_mib_suffix() {
        let (_, _, vram) = parse_nvidia_smi_line("NVIDIA TITAN, 535.00, 12288 MiB").unwrap();
        assert_eq!(vram, Some(12288));
    }

    #[test]
    fn suggest_q8_when_vram_above_threshold() {
        let (pack, reason) = suggest_model_pack(Some(VRAM_Q8_THRESHOLD_MIB), GPU_ACCEL_NVIDIA);
        assert_eq!(pack, "q8");
        assert!(reason.contains("Q8"));
    }

    #[test]
    fn suggest_q4_on_apple_metal_never_none() {
        let info = if cfg!(target_os = "macos") {
            gpu_setup_info()
        } else {
            let (pack, reason) = suggest_model_pack(None, GPU_ACCEL_APPLE_METAL);
            SetupGpuInfo {
                acceleration_kind: GPU_ACCEL_APPLE_METAL.into(),
                gpu_name: Some("Apple Metal".into()),
                driver_version: None,
                vram_mib: None,
                suggested_pack: pack,
                suggested_pack_reason_fr: reason,
                acceleration_available: true,
            }
        };
        assert_eq!(info.acceleration_kind, GPU_ACCEL_APPLE_METAL);
        assert!(info.acceleration_available);
        assert_ne!(info.acceleration_kind, GPU_ACCEL_NONE);
    }

    #[test]
    fn no_gpu_profile_reports_none_on_linux_windows() {
        if cfg!(target_os = "macos") {
            return;
        }
        let info = gpu_setup_info();
        assert!(
            info.acceleration_kind == GPU_ACCEL_NVIDIA || info.acceleration_kind == GPU_ACCEL_NONE
        );
    }
}
