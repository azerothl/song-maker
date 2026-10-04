//! Opt-in ACE-Step 1.5 **Base** Lego sidecar (Python REST), not Turbo GGUF.
//!
//! Used only for mix/stems-conditioned add-track. Does not change the global
//! `generation_engine` XOR (YuE2 / ACE-Step Turbo).

use crate::hashutil::sha256_file;
use crate::mix::render_mix;
use crate::models::{InstallProgress, MixDoc, ProjectDoc};
use crate::paths::ensure_dir;
use crate::pins::{
    ACE_STEP_LEGO_BIND_HOST, ACE_STEP_LEGO_BIND_PORT, ACE_STEP_LEGO_GIT, ACE_STEP_LEGO_HF_REPO,
    ACE_STEP_LEGO_HF_REVISION, CHANNELS, SAMPLE_RATE,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const ENGINE_ID: &str = "ace_step_1_5_base_lego";
pub const OUTPUT_KIND: &str = "possibly_fused_mix";
pub const SIDECAR_SCRIPT: &str = include_str!("../../scripts/ace-step-lego-sidecar.py");

pub const LICENSE_NOTICE_FR: &str = "\
ACE-Step 1.5 Base (mode Lego) est optionnel : sidecar Python + poids Hugging Face \
ACE-Step/acestep-v15-base (carte MIT). Ce n’est pas le GGUF Turbo déjà proposé pour \
le texte→musique. GPU réel recommandé (≥12 Go de VRAM). Un stem Lego collé sur un \
mix YuE2 n’efface pas la licence CC BY-NC du morceau. La doc Lego n’affirme pas un \
stem dry : la sortie peut être un mix déjà fusionné.";

pub const LICENSE_NOTICE_EN: &str = "\
ACE-Step 1.5 Base (Lego mode) is optional: a Python sidecar plus Hugging Face weights \
ACE-Step/acestep-v15-base (MIT on the card). This is not the Turbo GGUF used for \
text-to-music. A real GPU is recommended (≥12 GiB VRAM). A Lego stem layered on a \
YuE2 mix does not clear that mix’s CC BY-NC terms. Lego docs do not promise a dry \
stem; the file may already be a fused mix.";

pub const VRAM_NOTE_FR: &str = "\
Base Lego : ≥12 Go de VRAM conseillés (offload CPU possible, lent). YuE2 local ~24 Go BF16. \
La file GPU (`max_loaded_models = 1`) charge un graphe à la fois — pas YuE2 et Lego en parallèle.";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AceStepLegoStatus {
    pub engine_id: String,
    pub ready: bool,
    pub running: bool,
    pub python_present: bool,
    pub venv_present: bool,
    pub sidecar_script_present: bool,
    pub inference_available: bool,
    pub mock: bool,
    pub license_accepted: bool,
    pub base_url: String,
    pub hf_repo: String,
    pub hf_revision: String,
    pub git_source: String,
    pub output_kind: String,
    pub vram_note_fr: String,
    pub license_notice_fr: String,
    pub license_notice_en: String,
    pub message_fr: String,
}

pub struct AceStepLegoSidecar {
    child: Mutex<Option<Child>>,
}

impl Default for AceStepLegoSidecar {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl AceStepLegoSidecar {
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

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

pub fn venv_dir(cache: &Path) -> PathBuf {
    cache.join("tools").join("ace-step-lego")
}

pub fn sidecar_script_path(cache: &Path) -> PathBuf {
    venv_dir(cache).join("ace-step-lego-sidecar.py")
}

pub fn python_bin(cache: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        venv_dir(cache).join("Scripts").join("python.exe")
    }
    #[cfg(not(target_os = "windows"))]
    {
        venv_dir(cache).join("bin").join("python")
    }
}

pub fn base_url() -> String {
    format!("http://{ACE_STEP_LEGO_BIND_HOST}:{ACE_STEP_LEGO_BIND_PORT}")
}

pub fn lego_track_name(role: &str) -> Result<&'static str, String> {
    match role.trim() {
        "bass" => Ok("bass"),
        "drums" => Ok("drums"),
        "other" => Ok("keyboard"),
        other => Err(format!(
            "Rôle Lego inconnu ({other}). Attendu : bass | drums | other."
        )),
    }
}

pub fn lego_instruction(track_name: &str) -> String {
    format!("Generate the {track_name} track.")
}

fn python_bootstrap() -> Result<(PathBuf, Vec<String>), String> {
    crate::demucs_onnx::python_bootstrap()
}

pub fn write_sidecar_script(cache: &Path) -> Result<PathBuf, String> {
    let dest = sidecar_script_path(cache);
    if let Some(parent) = dest.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dest, SIDECAR_SCRIPT).map_err(|e| e.to_string())?;
    Ok(dest)
}

fn http_ready_sync() -> bool {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    let addr_s = format!("{ACE_STEP_LEGO_BIND_HOST}:{ACE_STEP_LEGO_BIND_PORT}");
    let Ok(addr) = addr_s.parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_secs(1)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
    let req = format!(
        "GET /ready HTTP/1.1\r\nHost: {ACE_STEP_LEGO_BIND_HOST}:{ACE_STEP_LEGO_BIND_PORT}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 128];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    String::from_utf8_lossy(&buf[..n]).contains(" 200 ")
}

async fn http_ready_async() -> bool {
    let url = format!("{}/ready", base_url());
    let Ok(client) = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    else {
        return false;
    };
    client
        .get(&url)
        .send()
        .await
        .ok()
        .is_some_and(|r| r.status().is_success())
}

pub fn status(
    cache: &Path,
    sidecar: &AceStepLegoSidecar,
    license_accepted: bool,
) -> AceStepLegoStatus {
    let python = python_bin(cache);
    let script = sidecar_script_path(cache);
    let venv_present = python.is_file();
    let running = sidecar.is_child_alive() || http_ready_sync();
    let ready = http_ready_sync();
    let mock = std::env::var("SONG_MAKER_ACE_STEP_LEGO_MOCK")
        .map(|v| matches!(v.trim(), "1" | "true" | "TRUE" | "yes"))
        .unwrap_or(false);
    let inference_available = mock || venv_present;
    let message_fr = if ready {
        "Sidecar Lego joignable (sortie éventuellement fusionnée, pas un stem dry garanti).".into()
    } else if venv_present {
        "Environnement Python Lego présent ; le sidecar n’est pas encore démarré.".into()
    } else {
        "Lego n’est pas installé. Téléchargement opt-in depuis Paramètres → Modèle. YuE2 reste le moteur Créer.".into()
    };
    AceStepLegoStatus {
        engine_id: ENGINE_ID.into(),
        ready,
        running,
        python_present: python_bootstrap().is_ok(),
        venv_present,
        sidecar_script_present: script.is_file(),
        inference_available,
        mock,
        license_accepted,
        base_url: base_url(),
        hf_repo: ACE_STEP_LEGO_HF_REPO.into(),
        hf_revision: ACE_STEP_LEGO_HF_REVISION.into(),
        git_source: ACE_STEP_LEGO_GIT.into(),
        output_kind: OUTPUT_KIND.into(),
        vram_note_fr: VRAM_NOTE_FR.into(),
        license_notice_fr: LICENSE_NOTICE_FR.into(),
        license_notice_en: LICENSE_NOTICE_EN.into(),
        message_fr,
    }
}

fn emit(app: &AppHandle, progress: InstallProgress) {
    let _ = app.emit("ace-step-lego-progress", &progress);
    let _ = app.emit("setup-progress", &progress);
}

fn spawn_sidecar(python: &Path, script: &Path, mock: bool) -> Result<Child, String> {
    let mut cmd = Command::new(python);
    cmd.arg(script)
        .env("ACE_STEP_LEGO_BIND_HOST", ACE_STEP_LEGO_BIND_HOST)
        .env(
            "ACE_STEP_LEGO_BIND_PORT",
            ACE_STEP_LEGO_BIND_PORT.to_string(),
        )
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if mock {
        cmd.env("SONG_MAKER_ACE_STEP_LEGO_MOCK", "1");
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
        .map_err(|e| format!("Impossible de démarrer le sidecar Lego : {e}"))
}

pub async fn install(
    app: AppHandle,
    cache: PathBuf,
    cancel: Arc<AtomicBool>,
) -> Result<String, String> {
    cancel.store(false, Ordering::SeqCst);
    emit(
        &app,
        InstallProgress::phase(
            "ACE-Step 1.5 Base Lego — création de l’environnement Python…",
            0,
            2,
        ),
    );
    if cancel.load(Ordering::SeqCst) {
        return Err("Téléchargement Lego annulé.".into());
    }
    let (bootstrap, prefix) = python_bootstrap()?;
    let venv = venv_dir(&cache);
    if let Some(parent) = venv.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }
    let python = python_bin(&cache);
    if !python.is_file() {
        let output = Command::new(&bootstrap)
            .args(&prefix)
            .args(["-m", "venv"])
            .arg(&venv)
            .output()
            .map_err(|e| format!("Création du venv Lego : {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Création du venv Lego impossible : {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }
    write_sidecar_script(&cache)?;
    emit(
        &app,
        InstallProgress::phase(
            "ACE-Step 1.5 Base Lego — installation du paquet Python (opt-in, GPU)…",
            1,
            2,
        ),
    );
    if cancel.load(Ordering::SeqCst) {
        return Err("Téléchargement Lego annulé.".into());
    }
    let mock = std::env::var("SONG_MAKER_ACE_STEP_LEGO_MOCK")
        .map(|v| matches!(v.trim(), "1" | "true" | "TRUE" | "yes"))
        .unwrap_or(false);
    if !mock {
        let output = Command::new(&python)
            .args([
                "-m",
                "pip",
                "install",
                "--disable-pip-version-check",
                "--no-input",
                ACE_STEP_LEGO_GIT,
            ])
            .output()
            .map_err(|e| format!("Installation ACE-Step Base : {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "pip ACE-Step 1.5 Base a échoué : {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }
    emit(&app, InstallProgress::complete());
    Ok(python.display().to_string())
}

pub async fn ensure_started(sidecar: &AceStepLegoSidecar, cache: &Path) -> Result<String, String> {
    write_sidecar_script(cache)?;
    if http_ready_async().await {
        return Ok(base_url());
    }
    let mock = std::env::var("SONG_MAKER_ACE_STEP_LEGO_MOCK")
        .map(|v| matches!(v.trim(), "1" | "true" | "TRUE" | "yes"))
        .unwrap_or(false);
    let python = python_bin(cache);
    if !python.is_file() {
        if mock {
            let (bootstrap, _) = python_bootstrap()?;
            let venv = venv_dir(cache);
            if let Some(parent) = venv.parent() {
                ensure_dir(parent).map_err(|e| e.to_string())?;
            }
            if !python.is_file() {
                let output = Command::new(&bootstrap)
                    .args(["-m", "venv"])
                    .arg(&venv)
                    .output()
                    .map_err(|e| e.to_string())?;
                if !output.status.success() {
                    return Err("Impossible de créer un venv mock Lego.".into());
                }
            }
        } else {
            return Err(
                "Sidecar Lego absent. Installez ACE-Step 1.5 Base depuis Paramètres → Modèle."
                    .into(),
            );
        }
    }
    let python = python_bin(cache);
    let script = sidecar_script_path(cache);
    {
        let mut guard = sidecar
            .child
            .lock()
            .map_err(|_| "SERVICE_UNAVAILABLE".to_string())?;
        if let Some(mut old) = guard.take() {
            let _ = old.kill();
            let _ = old.wait();
        }
        *guard = Some(spawn_sidecar(&python, &script, mock)?);
    }
    for _ in 0..80 {
        if http_ready_async().await {
            return Ok(base_url());
        }
        if !sidecar.is_child_alive() {
            return Err("SERVICE_UNAVAILABLE:ACE_STEP_LEGO_EXITED".into());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err("SERVICE_UNAVAILABLE:ACE_STEP_LEGO_NOT_READY".into())
}

pub fn lego_request_body(
    src: &Path,
    dest: &Path,
    caption: &str,
    instruction: &str,
    seed: u64,
) -> serde_json::Value {
    json!({
        "srcAudioPath": src.display().to_string(),
        "outWav": dest.display().to_string(),
        "caption": caption,
        "instruction": instruction,
        "seed": seed,
        "taskType": "lego",
        "model": "acestep-v15-base",
        "outputKind": OUTPUT_KIND
    })
}

pub async fn run_lego(
    src: &Path,
    dest: &Path,
    caption: &str,
    instruction: &str,
    seed: u64,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(7_200))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/v1/lego", base_url());
    let body = lego_request_body(src, dest, caption, instruction, seed);
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Appel sidecar Lego : {e}"))?;
    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Sidecar Lego a refusé la tâche : {text}"));
    }
    let value: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    if value.get("ok").and_then(|v| v.as_bool()) == Some(false) {
        return Err(value
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("échec Lego")
            .to_string());
    }
    if !dest.is_file() {
        return Err("Le sidecar Lego n’a pas écrit le WAV de sortie.".into());
    }
    Ok(value)
}

pub fn resolve_lego_source_wav(
    folder: &Path,
    doc: &ProjectDoc,
    dest: &Path,
) -> Result<PathBuf, String> {
    if let Some(mix_id) = doc.active_mix_id.as_deref() {
        let path = folder.join("mixes").join(format!("{mix_id}.json"));
        if path.is_file() {
            let mix: MixDoc =
                serde_json::from_str(&std::fs::read_to_string(&path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            let has_audio = mix.tracks.iter().any(|t| {
                t.clips
                    .iter()
                    .any(|c| !c.source_path.trim().is_empty() && c.duration_ms > 0)
            });
            if has_audio {
                render_mix(&mix, folder, dest)?;
                return Ok(dest.to_path_buf());
            }
        }
    }
    if let Some(gen_id) = doc.active_generation_id.as_deref() {
        let wav = folder.join("generations").join(gen_id).join("audio.wav");
        if wav.is_file() {
            if let Some(parent) = dest.parent() {
                ensure_dir(parent).map_err(|e| e.to_string())?;
            }
            std::fs::copy(&wav, dest).map_err(|e| e.to_string())?;
            return Ok(dest.to_path_buf());
        }
    }
    Err(
        "Aucun mix ni stems à écouter pour Lego. Séparez ou importez des pistes, ou générez d’abord une prise."
            .into(),
    )
}

pub fn verify_written_wav(path: &Path) -> Result<(i64, String), String> {
    if !path.is_file() {
        return Err("WAV Lego introuvable.".into());
    }
    let duration = crate::mix::wav_duration_ms(path).unwrap_or(0);
    let sha = sha256_file(path)?;
    Ok((duration, sha))
}

pub fn leftover_notes_fr() -> &'static str {
    "Sortie Lego : mix fusionné possible (pas un stem dry documenté). Clip importé à start_ms = 0, \
sans follow_project_tempo. Tempo / tonalité suivent l’audio source, pas un champ texte. \
Un stem MIT sur un mix YuE2 reste soumis au NC du mix."
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_roles_to_lego_track_names() {
        assert_eq!(lego_track_name("bass").unwrap(), "bass");
        assert_eq!(lego_track_name("drums").unwrap(), "drums");
        assert_eq!(lego_track_name("other").unwrap(), "keyboard");
        assert!(lego_track_name("lead").is_err());
        assert!(lego_instruction("bass").contains("bass"));
    }

    #[test]
    fn request_body_is_lego_not_text2music() {
        let body = lego_request_body(
            Path::new("/tmp/src.wav"),
            Path::new("/tmp/out.wav"),
            "bass guitar part",
            "Generate the bass track.",
            9,
        );
        assert_eq!(body["taskType"], "lego");
        assert_eq!(body["model"], "acestep-v15-base");
        assert_eq!(body["outputKind"], OUTPUT_KIND);
        assert_ne!(body["taskType"], "text2music");
    }

    #[test]
    fn source_resolver_errors_without_mix_or_generation() {
        let dir =
            std::env::temp_dir().join(format!("song-maker-lego-src-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let doc = ProjectDoc {
            schema: "test".into(),
            schema_version: 1,
            id: "p".into(),
            title: "t".into(),
            created_at: "x".into(),
            updated_at: "x".into(),
            sample_rate: SAMPLE_RATE,
            channels: CHANNELS,
            bit_depth: 24,
            style: "funk".into(),
            lyrics: String::new(),
            cot: "full".into(),
            singing_language: None,
            tempo_bpm: None,
            key: None,
            meter: None,
            target_duration_sec: 180,
            prefer_full_lyrics: true,
            instrumental_mode: true,
            active_generation_id: None,
            active_separation_id: None,
            active_mix_id: None,
            active_score_id: None,
            generation_names: Default::default(),
        };
        let err = resolve_lego_source_wav(&dir, &doc, &dir.join("bounce.wav")).unwrap_err();
        assert!(err.contains("mix") || err.contains("stems"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn leftover_notes_document_fused_mix_and_clip_placement() {
        let notes = leftover_notes_fr();
        assert!(notes.contains("fusionné") || notes.contains("dry"));
        assert!(notes.contains("start_ms"));
        assert!(notes.contains("follow_project_tempo"));
        assert!(notes.contains("NC"));
    }

    #[test]
    fn mock_python_sidecar_copies_source_wav() {
        let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("scripts")
            .join("ace-step-lego-sidecar.py");
        if !script.is_file() {
            return;
        }
        let dir =
            std::env::temp_dir().join(format!("song-maker-lego-mock-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("src.wav");
        let dest = dir.join("out.wav");
        std::fs::write(&src, b"RIFFMOCKWAV").unwrap();
        let py = [
            "import importlib.util, json, os, pathlib, sys",
            "os.environ['SONG_MAKER_ACE_STEP_LEGO_MOCK']='1'",
            "p=pathlib.Path(sys.argv[1])",
            "spec=importlib.util.spec_from_file_location('lego', p)",
            "mod=importlib.util.module_from_spec(spec)",
            "spec.loader.exec_module(mod)",
            "src=pathlib.Path(sys.argv[2]); dest=pathlib.Path(sys.argv[3])",
            "r=mod.run_lego({'srcAudioPath':str(src),'outWav':str(dest),'caption':'x','instruction':'Generate the bass track.','seed':1})",
            "assert r['outputKind']=='possibly_fused_mix'",
            "assert r['mode']=='mock'",
            "assert dest.read_bytes()==src.read_bytes()",
        ]
        .join(";");
        let status = std::process::Command::new("python3")
            .args(["-c", &py])
            .arg(&script)
            .arg(&src)
            .arg(&dest)
            .status();
        let _ = std::fs::remove_dir_all(&dir);
        let Ok(status) = status else {
            return;
        };
        assert!(status.success(), "mock sidecar copy failed: {status}");
    }
}
