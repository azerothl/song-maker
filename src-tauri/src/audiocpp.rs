//! Client HTTP du serveur audio.cpp (process Tauri, pas la webview).

use crate::models::AppSettings;
use crate::paths::{
    ace_step_weights_path, binaries_dir, htdemucs_path, pinned_archive_name, yue2_dir,
};
use crate::pins::*;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(windows)]
struct ChildJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(not(windows))]
struct ChildJob;

#[cfg(windows)]
unsafe impl Send for ChildJob {}

#[cfg(windows)]
impl Drop for ChildJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
fn assign_child_to_kill_job(child: &Child) -> Result<ChildJob, String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return Err(std::io::Error::last_os_error().to_string());
    }

    let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    let configured = unsafe {
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if configured == 0 {
        let error = std::io::Error::last_os_error();
        unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
        return Err(error.to_string());
    }

    let assigned = unsafe { AssignProcessToJobObject(job, child.as_raw_handle().cast()) };
    if assigned == 0 {
        let error = std::io::Error::last_os_error();
        unsafe { windows_sys::Win32::Foundation::CloseHandle(job) };
        return Err(error.to_string());
    }
    Ok(ChildJob(job))
}

#[cfg(not(windows))]
fn assign_child_to_kill_job(_child: &Child) -> Result<ChildJob, String> {
    Ok(ChildJob)
}

pub struct AudioCppServer {
    child: Mutex<Option<Child>>,
    child_job: Mutex<Option<ChildJob>>,
    pub base_url: Mutex<String>,
    pub port: Mutex<u16>,
    worker_dir: Option<PathBuf>,
}

impl Drop for AudioCppServer {
    fn drop(&mut self) {
        self.shutdown();
    }
}

impl Default for AudioCppServer {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            child_job: Mutex::new(None),
            base_url: Mutex::new(format!("http://{DEFAULT_HOST}:{DEFAULT_PORT}")),
            port: Mutex::new(DEFAULT_PORT),
            worker_dir: None,
        }
    }
}

const SERVER_HEALTH_WAIT: Duration = Duration::from_secs(45);
const SERVER_HEALTH_POLL: Duration = Duration::from_millis(200);

enum WaitHealthError {
    Exited(std::process::ExitStatus),
    TimedOut,
    Wait(String),
}

fn wait_for_server_health(
    child: &mut Child,
    healthy: impl Fn() -> bool,
) -> Result<(), WaitHealthError> {
    wait_for_server_health_until(
        child,
        healthy,
        Instant::now() + SERVER_HEALTH_WAIT,
        SERVER_HEALTH_POLL,
    )
}

fn wait_for_server_health_until(
    child: &mut Child,
    healthy: impl Fn() -> bool,
    deadline: Instant,
    poll: Duration,
) -> Result<(), WaitHealthError> {
    loop {
        if healthy() {
            return Ok(());
        }
        match child.try_wait() {
            Ok(Some(status)) => return Err(WaitHealthError::Exited(status)),
            Ok(None) => {
                if Instant::now() >= deadline {
                    return Err(WaitHealthError::TimedOut);
                }
                std::thread::sleep(poll);
            }
            Err(e) => return Err(WaitHealthError::Wait(e.to_string())),
        }
    }
}

impl AudioCppServer {
    /// A panic while a guard is held poisons the mutex. Recover the data so the
    /// next start does not panic on `unwrap`.
    fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
        mutex
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn write_config(settings: &AppSettings) -> Result<PathBuf, String> {
        let cache = PathBuf::from(&settings.cache_dir);
        let bin_dir = binaries_dir(&cache);
        crate::paths::ensure_dir(&bin_dir).map_err(|e| e.to_string())?;
        let config_path = bin_dir.join("audiocpp-server.json");
        Self::write_config_at(settings, &config_path, false)?;
        Ok(config_path)
    }

    /// Each batch attempt owns its configuration and logs; weights are read-only.
    pub fn isolated(worker_dir: PathBuf) -> Self {
        Self {
            child: Mutex::new(None),
            child_job: Mutex::new(None),
            base_url: Mutex::new(String::new()),
            port: Mutex::new(0),
            worker_dir: Some(worker_dir),
        }
    }

    fn write_config_at(
        settings: &AppSettings,
        config_path: &Path,
        isolated: bool,
    ) -> Result<(), String> {
        if let Some(parent) = config_path.parent() {
            crate::paths::ensure_dir(parent).map_err(|e| e.to_string())?;
        }
        let cache = PathBuf::from(&settings.cache_dir);
        let htd = htdemucs_path(&cache);
        let mut yue2 = json!({
            "id": "yue2",
            "family": "yue2",
            "path": yue2_dir(&cache).display().to_string(),
            "task": "gen",
            "mode": "offline",
            "busy_timeout_ms": YUE2_BUSY_TIMEOUT_MS
        });
        let mut session_options = serde_json::Map::new();
        // The downloaded model config may name Q8 even when only Q4 was installed.
        // audio.cpp resolves this name relative to `models[].path`; an absolute
        // path is rejected by the server's path validation.
        session_options.insert("yue2.model_gguf".into(), json!(settings.model_gguf));
        // Keep host-side metadata arenas bounded. audio.cpp v0.8.2's multi-GiB
        // defaults could abort the Windows server during long-form YuE2 NAR
        // graph setup when system commit was low. Upstream v0.9.1 reduces these
        // defaults to 32 MiB; pin the same safe values in our generated config.
        for option in [
            "yue2.model_weight_context_mb",
            "yue2.ar_prefill_graph_arena_mb",
            "yue2.ar_decode_graph_arena_mb",
            "yue2.nar_graph_arena_mb",
            "yue2.vae_graph_arena_mb",
            "yue2.vae_weight_context_mb",
        ] {
            session_options.insert(option.into(), json!(32));
        }
        if let Some(path) = settings.yue2_ar_lora.as_deref() {
            session_options.insert("yue2.ar_lora".into(), json!(path));
            session_options.insert(
                "yue2.ar_lora_scale".into(),
                json!(settings.yue2_ar_lora_scale),
            );
        }
        if let Some(path) = settings.yue2_nar_lora.as_deref() {
            session_options.insert("yue2.nar_lora".into(), json!(path));
            session_options.insert(
                "yue2.nar_lora_scale".into(),
                json!(settings.yue2_nar_lora_scale),
            );
        }
        if !session_options.is_empty() {
            yue2.as_object_mut()
                .unwrap()
                .insert("session_options".into(), json!(session_options));
        }
        let mut models = vec![
            yue2,
            json!({
                "id": "htdemucs",
                "family": "htdemucs",
                "path": htd.display().to_string(),
                "task": "sep",
                "mode": "offline",
                "busy_timeout_ms": HTDEMUCS_BUSY_TIMEOUT_MS
            }),
        ];
        // BS-RoFormer only when the optional GGUF is on disk (hors installeur).
        let bs_path = crate::paths::bs_roformer_path(&cache);
        if bs_path.is_file() {
            models.push(json!({
                "id": "bs_roformer",
                "family": "bs_roformer",
                "path": bs_path.display().to_string(),
                "task": "sep",
                "mode": "offline",
                "busy_timeout_ms": HTDEMUCS_BUSY_TIMEOUT_MS
            }));
        }
        // Mel-Band RoFormer only when the optional GGUF is on disk (hors installeur).
        let mel_path = crate::paths::mel_band_roformer_path(&cache);
        if mel_path.is_file() {
            models.push(json!({
                "id": "mel_band_roformer",
                "family": "mel_band_roformer",
                "path": mel_path.display().to_string(),
                "task": "sep",
                "mode": "offline",
                "busy_timeout_ms": HTDEMUCS_BUSY_TIMEOUT_MS
            }));
        }
        // SheetSage2 only when the optional GGUF is on disk (hors installeur, CC BY-NC).
        let sheetsage_path = crate::paths::sheetsage2_weights_path(&cache);
        if sheetsage_path.is_file() {
            models.push(json!({
                "id": "sheetsage2",
                "family": "sheetsage2",
                "path": sheetsage_path.display().to_string(),
                "task": "midi",
                "mode": "offline",
                "busy_timeout_ms": YUE2_BUSY_TIMEOUT_MS
            }));
        }
        // ACE-Step Turbo BF16 is opt-in and only registered after the pinned file is present.
        if crate::paths::ace_step_weights_present(&cache) {
            let ace_step_path = ace_step_weights_path(&cache);
            models.push(json!({
                "id": "ace_step",
                "family": "ace_step",
                "path": ace_step_path.display().to_string(),
                "task": "gen",
                "mode": "offline",
                "busy_timeout_ms": YUE2_BUSY_TIMEOUT_MS
            }));
        }
        if isolated {
            // Instrumental generation finishes by removing the vocal stem.
            // max_loaded_models=1 still unloads generation weights before sep.
            models.retain(|model| {
                model["id"] == settings.generation_engine
                    || model["id"] == "htdemucs"
                    || model["id"] == settings.stem_separator
            });
        }
        let cfg = json!({
            "host": settings.server_host,
            "port": settings.server_port,
            "backend": crate::pins::backend_name(),
            "device": 0,
            "lazy_load": true,
            "max_loaded_models": if isolated { 1 } else { MAX_LOADED_MODELS },
            "idle_unload_ms": 0,
            "busy_timeout_ms": BUSY_TIMEOUT_MS,
            "models": models
        });
        crate::paths::atomic_write_json(config_path, &cfg)?;
        Ok(())
    }

    pub(crate) fn find_server_binary(cache: &Path) -> Result<PathBuf, String> {
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
            let expected_name = if cfg!(target_os = "windows") {
                "audiocpp_server.exe"
            } else {
                "audiocpp_server"
            };
            for entry in walkdir::WalkDir::new(&extract).max_depth(4) {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy();
                if name == expected_name {
                    let bin = entry.path().to_path_buf();
                    if cfg!(target_os = "windows") {
                        let dir = bin.parent().unwrap_or(extract.as_path());
                        if !dir.join("cudart64_12.dll").exists() {
                            return Err(format!(
                                "Runtime CUDA manquant à côté de {}. Extrayez {} (SHA {}).",
                                bin.display(),
                                crate::pins::ARCHIVE_WINDOWS_CUDART,
                                crate::pins::ARCHIVE_WINDOWS_CUDART_SHA
                            ));
                        }
                    }
                    return Ok(bin);
                }
            }
        }
        let hint = if cfg!(target_os = "windows") {
            format!(
                "audiocpp_server.exe introuvable. Téléchargez {} + {} puis extrayez (load-test-cuda.cmd).",
                crate::pins::ARCHIVE_WINDOWS,
                crate::pins::ARCHIVE_WINDOWS_CUDART
            )
        } else {
            format!(
                "audiocpp_server introuvable. Téléchargez {} puis extrayez (./load-test-cuda.sh).",
                pinned_archive_name()
            )
        };
        Err(hint)
    }

    pub(crate) fn has_server_binary(cache: &Path) -> bool {
        Self::find_server_binary(cache).is_ok()
    }

    pub fn tcp_health(host: &str, port: u16) -> bool {
        use std::io::{Read, Write};
        use std::net::TcpStream;
        let addr = format!("{host}:{port}");
        let Ok(mut stream) = TcpStream::connect_timeout(
            &addr
                .parse()
                .unwrap_or_else(|_| std::net::SocketAddr::from(([127, 0, 0, 1], port))),
            Duration::from_millis(400),
        ) else {
            return false;
        };
        let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
        let req =
            format!("GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
        if stream.write_all(req.as_bytes()).is_err() {
            return false;
        }
        let mut buf = [0u8; 128];
        match stream.read(&mut buf) {
            Ok(n) if n > 0 => {
                let s = String::from_utf8_lossy(&buf[..n]);
                s.contains("200")
            }
            _ => false,
        }
    }

    /// Return whether a configured model is resident in audio.cpp memory.
    /// `None` means the endpoint did not report that model (or its state).
    pub async fn model_loaded(base_url: &str, model_id: &str) -> Result<Option<bool>, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(800))
            .build()
            .map_err(|e| e.to_string())?;
        let response = client
            .get(format!("{base_url}/v1/models"))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("GET /v1/models : HTTP {}", response.status()));
        }
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        let loaded = body
            .get("data")
            .and_then(Value::as_array)
            .and_then(|models| {
                models
                    .iter()
                    .find(|model| model.get("id").and_then(Value::as_str) == Some(model_id))
            })
            .and_then(|model| model.get("loaded"))
            .and_then(Value::as_bool);
        Ok(loaded)
    }

    pub fn ensure_started(&self, settings: &AppSettings) -> Result<String, String> {
        let has_child = {
            let child = Self::lock(&self.child);
            if child.is_some() {
                let port = *Self::lock(&self.port);
                if Self::tcp_health(&settings.server_host, port) {
                    return Ok(Self::lock(&self.base_url).clone());
                }
            }
            child.is_some()
        };
        if has_child {
            // A dead or unhealthy child must be reaped before a replacement is started.
            self.shutdown();
        }

        let cache = PathBuf::from(&settings.cache_dir);
        let bin = Self::find_server_binary(&cache)?;

        let mut port = settings.server_port;
        let mut last_err = String::new();
        for _ in 0..10 {
            let mut settings_try = settings.clone();
            settings_try.server_port = port;
            // Never accept the health response of an unrelated process on this port.
            if std::net::TcpListener::bind((&*settings_try.server_host, port)).is_err() {
                port = port.checked_add(1).ok_or("Aucun port audio disponible")?;
                continue;
            }
            let config = if let Some(dir) = &self.worker_dir {
                let path = dir.join("audiocpp-server.json");
                Self::write_config_at(&settings_try, &path, true)?;
                path
            } else {
                Self::write_config(&settings_try)?
            };

            let mut cmd = Command::new(&bin);
            cmd.arg("--config")
                .arg(&config)
                .arg("--backend")
                .arg(crate::pins::backend_name())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            if let Some(dir) = &self.worker_dir {
                cmd.stdout(Stdio::from(
                    std::fs::File::create(dir.join("stdout.log")).map_err(|e| e.to_string())?,
                ));
                cmd.stderr(Stdio::from(
                    std::fs::File::create(dir.join("stderr.log")).map_err(|e| e.to_string())?,
                ));
            }

            // The packaged console binary must not open a terminal window.
            crate::process_utils::configure_no_window(&mut cmd);

            match cmd.spawn() {
                Ok(mut child) => {
                    let child_job = match assign_child_to_kill_job(&child) {
                        Ok(job) => job,
                        Err(error) => {
                            let _ = child.kill();
                            let _ = child.wait();
                            return Err(format!(
                                "Impossible de protéger audiocpp_server contre un arrêt brutal de l’application : {error}"
                            ));
                        }
                    };
                    match wait_for_server_health(&mut child, || {
                        Self::tcp_health(&settings.server_host, port)
                    }) {
                        Ok(()) => {
                            let url = format!("http://{}:{}", settings.server_host, port);
                            *Self::lock(&self.child) = Some(child);
                            *Self::lock(&self.child_job) = Some(child_job);
                            *Self::lock(&self.base_url) = url.clone();
                            *Self::lock(&self.port) = port;
                            return Ok(url);
                        }
                        Err(WaitHealthError::Exited(status)) => {
                            last_err = format!(
                                "audiocpp_server s’est arrêté avant /health sur {}:{} ({status}).",
                                settings.server_host, port
                            );
                        }
                        Err(WaitHealthError::TimedOut) => {
                            let _ = child.kill();
                            return Err(format!(
                                "Impossible de démarrer audiocpp_server (backend {} requis). /health ne répond pas après {} s sur {}:{}. Vérifiez le pilote NVIDIA.",
                                crate::pins::backend_name(),
                                SERVER_HEALTH_WAIT.as_secs(),
                                settings.server_host,
                                port
                            ));
                        }
                        Err(WaitHealthError::Wait(e)) => {
                            let _ = child.kill();
                            last_err = e;
                        }
                    }
                }
                Err(e) => {
                    last_err = e.to_string();
                }
            }
            port = port.saturating_add(1);
        }
        Err(format!(
            "Impossible de démarrer audiocpp_server (backend {} requis). {last_err}",
            crate::pins::backend_name()
        ))
    }

    pub async fn run_task(base_url: &str, body: Value) -> Result<Value, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(YUE2_BUSY_TIMEOUT_MS / 1000 + 60))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client
            .post(format!("{base_url}/v1/tasks/run"))
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if status.as_u16() == 503 {
            return Err("server_busy".into());
        }
        if !status.is_success() {
            return Err(format!("HTTP {status}: {text}"));
        }
        serde_json::from_str(&text).map_err(|e| e.to_string())
    }

    /// audio.cpp renvoie le WAV en base64 dans `audio` (ou `named_audio_outputs[0].audio`).
    pub fn extract_wav_bytes(response: &Value) -> Result<Vec<u8>, String> {
        use base64::Engine;
        let b64 = response
            .get("audio")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .or_else(|| {
                response
                    .get("named_audio_outputs")
                    .and_then(|a| a.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|o| o.get("audio"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
            })
            .ok_or_else(|| "Réponse audio.cpp sans champ audio (WAV base64 absent).".to_string())?;
        base64::engine::general_purpose::STANDARD
            .decode(b64)
            .map_err(|e| format!("Décodage WAV base64: {e}"))
    }

    /// Stems HTDemucs : `named_audio_outputs[].{id,audio}` (WAV PCM16 base64).
    pub fn write_named_audio_outputs(response: &Value, out_dir: &Path) -> Result<usize, String> {
        use base64::Engine;
        let arr = response
            .get("named_audio_outputs")
            .and_then(|a| a.as_array())
            .ok_or_else(|| {
                "Réponse HTDemucs sans named_audio_outputs (stems absents).".to_string()
            })?;
        if arr.is_empty() {
            return Err("Réponse HTDemucs : named_audio_outputs vide.".into());
        }
        crate::paths::ensure_dir(out_dir).map_err(|e| e.to_string())?;
        let mut written = 0usize;
        for item in arr {
            let id = item
                .get("id")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Stem sans id dans named_audio_outputs.".to_string())?;
            let b64 = item
                .get("audio")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| format!("Stem « {id} » sans audio base64."))?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(b64)
                .map_err(|e| format!("Décodage stem « {id} »: {e}"))?;
            if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
                return Err(format!(
                    "Stem « {id} » : octets reçus sans en-tête WAV RIFF/WAVE (bruit possible)."
                ));
            }
            // Noms stables pour find_stem_file (vocals/drums/bass/other).
            let safe: String = id
                .chars()
                .map(|c| {
                    if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                        c
                    } else {
                        '_'
                    }
                })
                .collect();
            let path = out_dir.join(format!("{safe}.wav"));
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            written += 1;
        }
        Ok(written)
    }

    /// Score ABC éventuel dans `artifacts[]` (payload base64, format abc).
    pub fn extract_score_abc(response: &Value) -> Option<String> {
        use base64::Engine;
        let arts = response.get("artifacts")?.as_array()?;
        for art in arts {
            let meta = art.get("meta");
            let format = meta
                .and_then(|m| m.get("format"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let ext = meta
                .and_then(|m| m.get("extension"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let id = art.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let looks_abc = format.eq_ignore_ascii_case("abc")
                || ext.eq_ignore_ascii_case("abc")
                || id.to_ascii_lowercase().contains("score")
                || id.to_ascii_lowercase().contains("abc");
            if !looks_abc {
                continue;
            }
            let payload = art.get("payload")?.as_str()?;
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(payload) {
                return String::from_utf8(bytes).ok();
            }
            // parfois le payload est déjà du texte
            if payload.contains('[') || payload.contains("X:") {
                return Some(payload.to_string());
            }
        }
        None
    }

    /// v0.8.2 semantic artifact metadata reports when the token cap was hit.
    pub fn semantic_truncated(response: &Value) -> Option<bool> {
        response
            .get("artifacts")?
            .as_array()?
            .iter()
            .find_map(|artifact| {
                let value = artifact.get("meta")?.get("truncated")?;
                value
                    .as_bool()
                    .or_else(|| value.as_str().and_then(|s| s.parse::<bool>().ok()))
            })
    }

    /// Persist the semantic-prefix artifact in the format expected by audio.cpp.
    pub fn write_semantic_artifact(response: &Value, path: &Path) -> Result<bool, String> {
        use base64::Engine;
        let Some(artifacts) = response.get("artifacts").and_then(Value::as_array) else {
            return Ok(false);
        };
        for artifact in artifacts {
            let id = artifact
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            let meta = artifact.get("meta");
            let format = meta
                .and_then(|m| m.get("format"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            let ext = meta
                .and_then(|m| m.get("extension"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            if !(id.contains("semantic") || format.contains("semantic") || ext.contains("semantic"))
            {
                continue;
            }
            let payload = artifact
                .get("payload")
                .and_then(Value::as_str)
                .ok_or("Artefact sémantique sans payload.")?;
            let raw = if payload.trim_start().starts_with('[') {
                payload.as_bytes().to_vec()
            } else {
                base64::engine::general_purpose::STANDARD
                    .decode(payload)
                    .map_err(|e| format!("Décodage artefact sémantique: {e}"))?
            };
            let frames: Vec<u32> = serde_json::from_slice(&raw)
                .map_err(|e| format!("Artefact sémantique JSON invalide: {e}"))?;
            if frames.is_empty() || frames.iter().any(|&frame| frame >= 32768) {
                return Err("Artefact sémantique vide ou contenant un token hors plage.".into());
            }
            if let Some(parent) = path.parent() {
                crate::paths::ensure_dir(parent).map_err(|e| e.to_string())?;
            }
            std::fs::write(
                path,
                serde_json::to_vec(&frames).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            return Ok(true);
        }
        Ok(false)
    }

    pub async fn unload_all(base_url: &str) -> Result<(), String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| e.to_string())?;
        let _ = client
            .post(format!("{base_url}/v1/tasks/unload_all_models"))
            .send()
            .await;
        Ok(())
    }

    pub fn shutdown(&self) {
        let url = Self::lock(&self.base_url).clone();
        if !url.is_empty() {
            // Called from async Tauri commands, which already run on a Tokio
            // worker. `Runtime::block_on` on that thread panics
            // ("Cannot start a runtime from within a runtime") and poisons
            // the mutexes held across the call. Unload on a dedicated thread.
            let (tx, rx) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                let result = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())
                    .and_then(|rt| rt.block_on(Self::unload_all(&url)));
                let _ = tx.send(result);
            });
            let _ = rx.recv_timeout(Duration::from_secs(5));
        }
        if let Some(mut child) = Self::lock(&self.child).take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Self::lock(&self.child_job).take();
    }

    pub fn process_id(&self) -> Option<u32> {
        Self::lock(&self.child).as_ref().map(Child::id)
    }
}

#[cfg(all(test, windows))]
mod child_job_tests {
    use super::assign_child_to_kill_job;
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};

    #[test]
    fn closing_job_reaps_the_child_process() {
        let mut command = Command::new("ping");
        command
            .args(["127.0.0.1", "-n", "60"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        let mut child = command.spawn().expect("start child process");
        let job = assign_child_to_kill_job(&child).expect("assign process to kill-on-close job");
        drop(job);

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if child.try_wait().expect("poll child").is_some() {
                break;
            }
            if Instant::now() >= deadline {
                terminate(&mut child);
                panic!("job closure did not terminate the child process");
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    fn terminate(child: &mut Child) {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(test)]
mod semantic_metadata_tests {
    use super::{wait_for_server_health_until, AudioCppServer, WaitHealthError};
    use serde_json::json;
    use std::process::{Child, Command, Stdio};
    use std::time::{Duration, Instant};

    #[test]
    fn selected_yue2_gguf_is_relative_to_the_model_root() {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-yue2-model-path-{}",
            uuid::Uuid::new_v4()
        ));
        let cache = dir.join("cache");
        let mut settings = crate::library::default_settings();
        settings.cache_dir = cache.display().to_string();

        for selected in [crate::pins::YUE2_Q4, crate::pins::YUE2_Q8] {
            settings.model_gguf = selected.into();
            let path = dir.join(format!("{selected}.json"));
            AudioCppServer::write_config_at(&settings, &path, true).unwrap();
            let config: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            let model = config["models"]
                .as_array()
                .unwrap()
                .iter()
                .find(|model| model["id"] == "yue2")
                .unwrap();
            assert_eq!(model["session_options"]["yue2.model_gguf"], selected);
            assert!(!std::path::Path::new(selected).is_absolute());
            for option in [
                "yue2.model_weight_context_mb",
                "yue2.ar_prefill_graph_arena_mb",
                "yue2.ar_decode_graph_arena_mb",
                "yue2.nar_graph_arena_mb",
                "yue2.vae_graph_arena_mb",
                "yue2.vae_weight_context_mb",
            ] {
                assert_eq!(model["session_options"][option], 32);
            }
        }

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn isolated_worker_registers_vocal_removal_with_one_loaded_model() {
        let settings = crate::library::default_settings();
        let dir =
            std::env::temp_dir().join(format!("song-maker-worker-config-{}", uuid::Uuid::new_v4()));
        let path = dir.join("server.json");
        AudioCppServer::write_config_at(&settings, &path, true).unwrap();
        let config: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(config["max_loaded_models"], 1);
        let models = config["models"].as_array().unwrap();
        assert!(models.iter().any(|model| model["id"] == "htdemucs"));
        assert!(models.iter().any(|model| model["id"] == "yue2"));
        assert_eq!(models.len(), 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn isolated_worker_registers_selected_roformer_for_instrumental_cleanup() {
        let dir = std::env::temp_dir().join(format!(
            "song-maker-roformer-config-{}",
            uuid::Uuid::new_v4()
        ));
        let cache = dir.join("cache");
        let settings_dir = dir.join("settings");
        std::fs::create_dir_all(&settings_dir).unwrap();
        let mut settings = crate::library::default_settings();
        settings.cache_dir = cache.display().to_string();
        settings.stem_separator = "bs_roformer".into();
        let model = crate::paths::bs_roformer_path(&cache);
        std::fs::create_dir_all(model.parent().unwrap()).unwrap();
        std::fs::write(&model, b"test fixture").unwrap();

        let path = settings_dir.join("server.json");
        AudioCppServer::write_config_at(&settings, &path, true).unwrap();
        let config: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let models = config["models"].as_array().unwrap();
        assert!(models.iter().any(|model| model["id"] == "bs_roformer"));
        assert_eq!(config["max_loaded_models"], 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn reads_v082_string_encoded_truncation_flag() {
        let response = json!({
            "artifacts": [{ "id": "semantic", "meta": { "truncated": "true" } }]
        });
        assert_eq!(AudioCppServer::semantic_truncated(&response), Some(true));
    }

    #[test]
    fn writes_semantic_artifact_as_valid_json_prefix() {
        use base64::Engine;
        let path =
            std::env::temp_dir().join(format!("song-maker-semantic-{}.json", uuid::Uuid::new_v4()));
        let encoded = base64::engine::general_purpose::STANDARD.encode(b"[12,34,56]");
        let response = json!({ "artifacts": [{
            "id": "semantic",
            "meta": { "format": "application/vnd.yue2.semantic+json", "truncated": true },
            "payload": encoded
        }]});
        assert!(AudioCppServer::write_semantic_artifact(&response, &path).unwrap());
        let frames: Vec<u32> = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(frames, vec![12, 34, 56]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn shutdown_from_inside_a_runtime_does_not_panic() {
        let server = AudioCppServer::default();
        *AudioCppServer::lock(&server.base_url) = "http://127.0.0.1:1".into();
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(async {
            server.shutdown();
        });
        assert_eq!(
            AudioCppServer::lock(&server.base_url).as_str(),
            "http://127.0.0.1:1"
        );
    }

    fn spawn_sleeper() -> Child {
        let mut cmd = if cfg!(windows) {
            let mut cmd = Command::new("ping");
            cmd.args(["-n", "8", "127.0.0.1"]);
            cmd
        } else {
            let mut cmd = Command::new("sleep");
            cmd.arg("8");
            cmd
        };
        cmd.stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("sleeper")
    }

    #[test]
    fn wait_ok_when_health_is_already_true() {
        let mut child = spawn_sleeper();
        let result = wait_for_server_health_until(
            &mut child,
            || true,
            Instant::now() + Duration::from_secs(2),
            Duration::from_millis(20),
        );
        let _ = child.kill();
        assert!(result.is_ok());
    }

    #[test]
    fn wait_times_out_while_child_still_runs() {
        let mut child = spawn_sleeper();
        let err = wait_for_server_health_until(
            &mut child,
            || false,
            Instant::now() + Duration::from_millis(80),
            Duration::from_millis(20),
        )
        .unwrap_err();
        let _ = child.kill();
        assert!(matches!(err, WaitHealthError::TimedOut));
    }

    #[test]
    fn wait_reports_when_child_exits() {
        let mut cmd = if cfg!(windows) {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", "exit", "7"]);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", "exit 7"]);
            cmd
        };
        let mut child = cmd
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("exiter");
        let err = wait_for_server_health_until(
            &mut child,
            || false,
            Instant::now() + Duration::from_secs(5),
            Duration::from_millis(20),
        )
        .unwrap_err();
        assert!(matches!(err, WaitHealthError::Exited(_)));
    }
}
