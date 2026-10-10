//! Local NAR LoRA training host — disk jobs under Documents/Song Maker/training-jobs,
//! spawn `scripts/lora-train-nar.py`, cancel via PID, real corpus probes.

use crate::hashutil::sha256_file;
use crate::paths::{ensure_dir, training_jobs_root};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProbeResult {
    pub path: String,
    pub exists: bool,
    pub byte_length: u64,
    pub duration_ms: Option<u64>,
    pub content_sha256: Option<String>,
    pub format: String,
    pub message_fr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainerProbeResult {
    pub trainer_exists: bool,
    pub trainer_script_path: Option<String>,
    pub jobs_root: String,
    pub python_available: bool,
    pub message_fr: String,
    #[serde(default)]
    pub yue2_gpu_trainer_exists: bool,
    pub yue2_gpu_trainer_script_path: Option<String>,
    #[serde(default)]
    pub cuda_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTrainerArgs {
    pub job_id: String,
    pub job_dir: String,
    pub trainer_script_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchTrainerResult {
    pub status: String,
    pub job_id: String,
    pub pid: Option<u32>,
    pub message_fr: String,
}

pub struct LoraTrainJobs {
    children: Mutex<HashMap<String, Child>>,
}

impl Default for LoraTrainJobs {
    fn default() -> Self {
        Self {
            children: Mutex::new(HashMap::new()),
        }
    }
}

fn format_from_path(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_else(|| "unknown".into())
}

fn wav_duration_ms(path: &Path) -> Option<u64> {
    let reader = hound::WavReader::open(path).ok()?;
    let spec = reader.spec();
    if spec.sample_rate == 0 {
        return None;
    }
    let len = reader.duration() as u64;
    Some(len.saturating_mul(1000) / u64::from(spec.sample_rate))
}

pub fn probe_audio(path: String) -> Result<AudioProbeResult, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Ok(AudioProbeResult {
            path,
            exists: false,
            byte_length: 0,
            duration_ms: None,
            content_sha256: None,
            format: format_from_path(&p),
            message_fr: "Fichier audio introuvable.".into(),
        });
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    let byte_length = meta.len();
    let format = format_from_path(&p);
    let duration_ms = if format == "wav" {
        wav_duration_ms(&p)
    } else {
        None
    };
    let content_sha256 = sha256_file(&p).ok();
    Ok(AudioProbeResult {
        path,
        exists: true,
        byte_length,
        duration_ms,
        content_sha256,
        format,
        message_fr: if duration_ms.is_some() {
            "Sonde audio OK (durée WAV + SHA-256).".into()
        } else {
            "Sonde audio OK (taille + SHA-256 ; durée non disponible hors WAV).".into()
        },
    })
}

fn find_repo_script(relative: &str) -> Option<PathBuf> {
    let candidates = [
        PathBuf::from(relative),
        PathBuf::from("..").join(relative),
        std::env::current_dir()
            .ok()
            .map(|d| d.join(relative))
            .unwrap_or_default(),
        std::env::var_os("SONG_MAKER_ROOT")
            .map(PathBuf::from)
            .map(|d| d.join(relative))
            .unwrap_or_default(),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn find_repo_trainer() -> Option<PathBuf> {
    find_repo_script("scripts/lora-train-nar.py")
}

fn find_yue2_gpu_trainer() -> Option<PathBuf> {
    find_repo_script("scripts/lora-train-yue2-gpu.py")
}

fn python_cmd() -> Option<(PathBuf, Vec<String>)> {
    if let Some(configured) = std::env::var_os("SONG_MAKER_PYTHON") {
        let path = PathBuf::from(configured);
        if path.is_file() {
            return Some((path, Vec::new()));
        }
    }
    for (program, prefix) in [
        (PathBuf::from("python3"), Vec::<String>::new()),
        (PathBuf::from("python"), Vec::new()),
        (PathBuf::from("py"), vec!["-3".into()]),
    ] {
        let mut command = Command::new(&program);
        crate::process_utils::configure_no_window(&mut command);
        let Ok(output) = command
            .args(&prefix)
            .arg("-c")
            .arg("import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)")
            .output()
        else {
            continue;
        };
        if output.status.success() {
            return Some((program, prefix));
        }
    }
    None
}

pub fn probe_trainer() -> Result<TrainerProbeResult, String> {
    let jobs_root = training_jobs_root();
    ensure_dir(&jobs_root).map_err(|e| e.to_string())?;
    let trainer = find_repo_trainer();
    let gpu_trainer = find_yue2_gpu_trainer();
    let python_available = python_cmd().is_some();
    let trainer_exists = trainer.is_some() && python_available;
    let yue2_gpu_trainer_exists = gpu_trainer.is_some() && python_available;
    let cuda_available = crate::health::detect_gpu().0;
    let message_fr = if trainer_exists {
        format!(
            "Pilote NAR CPU : {}. LoRA YuE2 GPU : {} (CUDA {}). Jobs sous {}.",
            trainer.as_ref().unwrap().display(),
            gpu_trainer
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|| "script absent".into()),
            if cuda_available {
                "détecté"
            } else {
                "absent"
            },
            jobs_root.display()
        )
    } else if trainer.is_some() && !python_available {
        "Script trainer présent mais Python 3.10+ introuvable (SONG_MAKER_PYTHON).".into()
    } else {
        "Aucun scripts/lora-train-nar.py détecté — placez le trainer pour lancer un job réel."
            .into()
    };
    Ok(TrainerProbeResult {
        trainer_exists,
        trainer_script_path: trainer.map(|p| p.display().to_string()),
        jobs_root: jobs_root.display().to_string(),
        python_available,
        message_fr,
        yue2_gpu_trainer_exists,
        yue2_gpu_trainer_script_path: gpu_trainer.map(|p| p.display().to_string()),
        cuda_available,
    })
}

pub fn jobs_root_path() -> Result<String, String> {
    let root = training_jobs_root();
    ensure_dir(&root).map_err(|e| e.to_string())?;
    Ok(root.display().to_string())
}

pub fn write_text(path: String, data: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&p, data).map_err(|e| e.to_string())
}

pub fn read_text(path: String) -> Result<Option<String>, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Ok(None);
    }
    Ok(Some(
        std::fs::read_to_string(&p).map_err(|e| e.to_string())?,
    ))
}

pub fn path_exists(path: String) -> Result<bool, String> {
    Ok(PathBuf::from(path).exists())
}

pub fn mkdir(path: String) -> Result<(), String> {
    ensure_dir(Path::new(&path)).map_err(|e| e.to_string())
}

pub fn remove_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else if p.is_file() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn launch_trainer(
    jobs: &LoraTrainJobs,
    args: LaunchTrainerArgs,
) -> Result<LaunchTrainerResult, String> {
    let script = PathBuf::from(&args.trainer_script_path);
    if !script.is_file() {
        return Ok(LaunchTrainerResult {
            status: "not_implemented".into(),
            job_id: args.job_id,
            pid: None,
            message_fr: format!("Trainer introuvable : {}", script.display()),
        });
    }
    let gpu = script
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.contains("yue2-gpu"));
    let (python, prefix) = python_cmd().ok_or_else(|| {
        "Python 3.10+ requis pour le trainer LoRA (ou SONG_MAKER_PYTHON).".to_string()
    })?;
    let job_dir = PathBuf::from(&args.job_dir);
    ensure_dir(&job_dir).map_err(|e| e.to_string())?;
    let manifest = job_dir.join("manifest.json");
    let log_path = job_dir.join("logs").join("train.log");
    if let Some(parent) = log_path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    let err_file = log_file.try_clone().map_err(|e| e.to_string())?;
    let mut cmd = Command::new(&python);
    crate::process_utils::configure_no_window(&mut cmd);
    cmd.args(&prefix)
        .arg(&script)
        .arg("--job-dir")
        .arg(&job_dir)
        .arg("--manifest")
        .arg(&manifest);
    if gpu {
        cmd.arg("--slot").arg("nar");
    }
    cmd.stdout(Stdio::from(log_file))
        .stderr(Stdio::from(err_file));
    let child = cmd
        .spawn()
        .map_err(|e| format!("Échec lancement trainer LoRA : {e}"))?;
    let pid = child.id();
    std::fs::write(job_dir.join("pid"), pid.to_string()).ok();
    // Mark running in manifest if present.
    if manifest.is_file() {
        if let Ok(raw) = std::fs::read_to_string(&manifest) {
            if let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&raw) {
                value["status"] = serde_json::json!("running");
                let _ = std::fs::write(
                    &manifest,
                    serde_json::to_string_pretty(&value).unwrap_or(raw),
                );
            }
        }
    }
    jobs.children
        .lock()
        .unwrap()
        .insert(args.job_id.clone(), child);
    Ok(LaunchTrainerResult {
        status: "running".into(),
        job_id: args.job_id,
        pid: Some(pid),
        message_fr: format!(
            "{} démarré (pid {pid}). Adaptateur non activé automatiquement.",
            if gpu {
                "Trainer YuE2 GPU"
            } else {
                "Trainer NAR (pilote CPU)"
            }
        ),
    })
}

pub fn poll_trainer(jobs: &LoraTrainJobs, job_id: String) -> Result<LaunchTrainerResult, String> {
    let mut map = jobs.children.lock().unwrap();
    if let Some(child) = map.get_mut(&job_id) {
        match child.try_wait() {
            Ok(Some(status)) => {
                map.remove(&job_id);
                let ok = status.success();
                return Ok(LaunchTrainerResult {
                    status: if ok {
                        "completed".into()
                    } else {
                        "failed".into()
                    },
                    job_id,
                    pid: None,
                    message_fr: if ok {
                        "Trainer NAR terminé — validez l’adaptateur avant catalogue.".into()
                    } else {
                        format!(
                            "Trainer NAR a échoué (code {:?}). Voir logs/train.log.",
                            status.code()
                        )
                    },
                });
            }
            Ok(None) => {
                return Ok(LaunchTrainerResult {
                    status: "running".into(),
                    job_id,
                    pid: Some(child.id()),
                    message_fr: "Entraînement NAR en cours…".into(),
                });
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(LaunchTrainerResult {
        status: "not_running".into(),
        job_id,
        pid: None,
        message_fr: "Aucun processus trainer actif pour ce job.".into(),
    })
}

pub fn cancel_trainer(jobs: &LoraTrainJobs, job_id: String) -> Result<LaunchTrainerResult, String> {
    let mut map = jobs.children.lock().unwrap();
    if let Some(mut child) = map.remove(&job_id) {
        let _ = child.kill();
        return Ok(LaunchTrainerResult {
            status: "cancelled".into(),
            job_id,
            pid: None,
            message_fr: "Trainer NAR annulé.".into(),
        });
    }
    Ok(LaunchTrainerResult {
        status: "not_running".into(),
        job_id,
        pid: None,
        message_fr: "Rien à annuler.".into(),
    })
}
