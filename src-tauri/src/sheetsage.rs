//! SheetSage2 transcription host — `audiocpp_cli --task midi --family sheetsage2`
//! or server `/v1/tasks/run` when weights are present. Never invents ABC.

use crate::audiocpp::AudioCppServer;
use crate::hashutil::sha256_file;
use crate::library::load_settings;
use crate::paths::{
    binaries_dir, ensure_dir, sheetsage2_weights_path, sheetsage2_weights_present,
};
use crate::pins::backend_name;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

/// Spec §19 / packages/sheetsage SHEETSAGE2_WEIGHTS.
pub const SHEETSAGE2_FILENAME: &str = "sheetsage2-orig.gguf";
pub const SHEETSAGE2_SHA256: &str =
    "52bb5846c452037d39931aa8050885b6c751b9c7afcc8ef6d6d3067d241731a4";

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
        "{expected} introuvable à côté du runtime audio.cpp (hors installeur pour SheetSage2)."
    ))
}

pub fn probe() -> Result<SheetsageProbeResult, String> {
    let settings = load_settings()?;
    let cache = PathBuf::from(&settings.cache_dir);
    let weights_path = sheetsage2_weights_path(&cache);
    let weights_present = sheetsage2_weights_present(&cache);
    let mut weights_sha256_verified = false;
    if weights_present {
        if let Ok(sha) = sha256_file(&weights_path) {
            weights_sha256_verified = sha.eq_ignore_ascii_case(SHEETSAGE2_SHA256);
        }
    }
    let server_bin = AudioCppServer::find_server_binary(&cache).ok();
    let cli_bin = find_cli_binary(&cache).ok();
    let binary_present = server_bin.is_some() || cli_bin.is_some();
    let acceleration = if cfg!(target_os = "macos") {
        "cpu"
    } else {
        "cuda"
    };
    let message_fr = if !binary_present {
        "Binaire audio.cpp (serveur ou audiocpp_cli) introuvable.".into()
    } else if !weights_present {
        format!(
            "Poids SheetSage2 absents ({SHEETSAGE2_FILENAME}). Placez-les sous cache/models/SheetSage2-GGUF/ (CC BY-NC 4.0, hors installeur)."
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
        disk_bytes_available: None,
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
