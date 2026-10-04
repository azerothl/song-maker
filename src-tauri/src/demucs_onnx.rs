//! Optional ONNX HTDemucs 6-stem runtime, isolated from audio.cpp.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const PACKAGE_VERSION: &str = "0.3.4";
pub const MODEL_REVISION: &str = "49df9b6989cf2150840ea65b0bef77a2e471b678";
pub const MODEL_SHA256: &str = "7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869";

pub fn is_installed(cache: &Path) -> bool {
    crate::paths::demucs_onnx_cli(cache).is_file()
        && crate::paths::demucs_onnx_python(cache).is_file()
}

fn tail(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    let mut chars: Vec<char> = text.chars().collect();
    if chars.len() > 1600 {
        chars.drain(..chars.len() - 1600);
    }
    chars.into_iter().collect::<String>().trim().to_string()
}

fn failed(label: &str, output: Output) -> String {
    let details = tail(&output.stderr);
    if details.is_empty() {
        format!("{label} (code {:?}).", output.status.code())
    } else {
        format!("{label} : {details}")
    }
}

fn python_bootstrap() -> Result<(PathBuf, Vec<String>), String> {
    if let Some(configured) = std::env::var_os("SONG_MAKER_PYTHON") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Ok((path, Vec::new()));
        }
        return Err(format!(
            "SONG_MAKER_PYTHON pointe vers un fichier absent : {}",
            path.display()
        ));
    }

    #[cfg(not(target_os = "windows"))]
    let candidates = vec![
        (PathBuf::from("python"), Vec::<String>::new()),
        (PathBuf::from("py"), vec!["-3".into()]),
    ];
    #[cfg(target_os = "windows")]
    let candidates = {
        let mut list = vec![
            (PathBuf::from("python"), Vec::<String>::new()),
            (PathBuf::from("py"), vec!["-3".into()]),
        ];
        if let Some(home) = dirs::home_dir() {
            for folder in ["anaconda3", "miniconda3", "AppData/Local/Programs/Python"] {
                let root = home.join(folder);
                if folder.ends_with("Python") {
                    if let Ok(entries) = std::fs::read_dir(&root) {
                        list.extend(
                            entries
                                .flatten()
                                .map(|entry| (entry.path().join("python.exe"), Vec::new())),
                        );
                    }
                } else {
                    list.push((root.join("python.exe"), Vec::new()));
                }
            }
        }
        list
    };
    for (program, prefix) in candidates {
        if program.components().count() > 1 && !program.is_file() {
            continue;
        }
        let Ok(output) = Command::new(&program)
            .args(&prefix)
            .arg("-c")
            .arg("import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)")
            .output()
        else {
            continue;
        };
        if output.status.success() {
            return Ok((program, prefix));
        }
    }
    Err("Python 3.10+ est requis pour installer le séparateur 6 stems. Installez Python ou définissez SONG_MAKER_PYTHON.".into())
}

fn install_blocking(cache: PathBuf) -> Result<String, String> {
    let cli = crate::paths::demucs_onnx_cli(&cache);
    let python = crate::paths::demucs_onnx_python(&cache);
    if is_installed(&cache) {
        return Ok(cli.display().to_string());
    }
    let (bootstrap, prefix) = python_bootstrap()?;
    let venv = crate::paths::demucs_onnx_venv(&cache);
    if let Some(parent) = venv.parent() {
        crate::paths::ensure_dir(parent).map_err(|e| e.to_string())?;
    }

    let output = Command::new(&bootstrap)
        .args(&prefix)
        .args(["-m", "venv"])
        .arg(&venv)
        .output()
        .map_err(|e| format!("Création de l’environnement Python : {e}"))?;
    if !output.status.success() {
        return Err(failed(
            "Création de l’environnement Python impossible",
            output,
        ));
    }

    let output = Command::new(&python)
        .args([
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
        ])
        .arg(format!("demucs-onnx=={PACKAGE_VERSION}"))
        .arg("soundfile>=0.12")
        .output()
        .map_err(|e| format!("Installation du runtime ONNX : {e}"))?;
    if !output.status.success() {
        return Err(failed("Installation de demucs-onnx impossible", output));
    }
    if !is_installed(&cache) {
        return Err("Le runtime ONNX a été installé mais son exécutable est introuvable.".into());
    }
    Ok(cli.display().to_string())
}

pub async fn install(cache: PathBuf) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || install_blocking(cache))
        .await
        .map_err(|e| format!("Installation ONNX interrompue : {e}"))?
}

pub async fn separate(cache: PathBuf, input: PathBuf, output_dir: PathBuf) -> Result<(), String> {
    let python = crate::paths::demucs_onnx_python(&cache);
    if !is_installed(&cache) {
        return Err(format!(
            "Le runtime HTDemucs 6 stems est absent. Installez-le dans Paramètres → Production audio (chemin attendu : {}).",
            crate::paths::demucs_onnx_cli(&cache).display()
        ));
    }
    crate::paths::ensure_dir(&output_dir).map_err(|e| e.to_string())?;
    let worker = format!(
        r#"import hashlib, sys
from huggingface_hub import hf_hub_download
from demucs_onnx import inference

source, destination, cache = sys.argv[1:4]
model = hf_hub_download(
    repo_id="StemSplitio/htdemucs-6s-onnx",
    filename="htdemucs_6s_fp16weights.onnx",
    revision="{MODEL_REVISION}",
    cache_dir=cache,
)
digest = hashlib.sha256()
with open(model, "rb") as weights:
    for block in iter(lambda: weights.read(4 * 1024 * 1024), b""):
        digest.update(block)
if digest.hexdigest() != "{MODEL_SHA256}":
    raise RuntimeError("Le SHA-256 du modèle HTDemucs 6 stems ne correspond pas à la version épinglée.")
inference.download_single_model = lambda name, **kwargs: model
inference.separate(
    source, destination, model="htdemucs_6s", providers="cpu",
    precision="fp16weights", cache_dir=cache,
)
# #344: Wiener-like mask using the piano estimate as interferer.
# Does not clean the piano stem. numpy is a demucs-onnx dependency.
import numpy as np, soundfile as sf, pathlib
    dest = pathlib.Path(destination)
    piano_path = dest / "piano.wav"
    if piano_path.is_file():
        piano, sr = sf.read(str(piano_path), always_2d=True)
        hop, n_fft = 512, 1024
        win = np.hanning(n_fft).astype(np.float32)
        def stft(x):
            frames = []
            for start in range(0, max(0, len(x) - n_fft + 1), hop):
                frames.append(np.fft.rfft(x[start:start+n_fft] * win))
            return np.stack(frames) if frames else np.zeros((1, n_fft//2+1), np.complex64)
        def istft(spec, length):
            acc = np.zeros(length, np.float32)
            wsum = np.zeros(length, np.float32)
            for i, frame in enumerate(spec):
                start = i * hop
                chunk = np.fft.irfft(frame, n=n_fft).real.astype(np.float32) * win
                acc[start:start+n_fft] += chunk[: max(0, length-start)]
                wsum[start:start+n_fft] += (win * win)[: max(0, length-start)]
            wsum[wsum < 1e-8] = 1
            return acc / wsum
        piano_mono = piano.mean(axis=1)
        pspec = stft(piano_mono)
        for role in ("vocals", "drums", "bass", "other", "guitar"):
            path = dest / f"{{role}}.wav"
            if not path.is_file():
                continue
            other, _ = sf.read(str(path), always_2d=True)
            mono = other.mean(axis=1)
            n = min(len(mono), len(piano_mono))
            ospec = stft(mono[:n])
            p = pspec[: ospec.shape[0]]
            o2 = np.abs(ospec) ** 2
            p2 = np.abs(p) ** 2
            mask = o2 / (o2 + 0.85 * p2 + 1e-12)
            cleaned = istft(ospec * mask, n)
            stereo = np.column_stack([cleaned, cleaned])
            sf.write(str(path), stereo, sr)
"#
    );
    let output = tokio::process::Command::new(&python)
        .arg("-c")
        .arg(worker)
        .arg(&input)
        .arg(&output_dir)
        .arg(crate::paths::demucs_onnx_model_cache(&cache))
        .output()
        .await
        .map_err(|e| format!("Lancement de HTDemucs 6 stems : {e}"))?;
    if !output.status.success() {
        return Err(failed("Séparation HTDemucs 6 stems échouée", output));
    }
    for role in ["vocals", "drums", "bass", "other", "guitar", "piano"] {
        if !output_dir.join(format!("{role}.wav")).is_file() {
            return Err(format!("HTDemucs 6 stems n’a pas produit {role}.wav."));
        }
    }
    Ok(())
}
