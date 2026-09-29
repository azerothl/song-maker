//! Client HTTP du serveur audio.cpp (process Tauri, pas la webview).

use crate::models::AppSettings;
use crate::paths::{binaries_dir, htdemucs_path, pinned_archive_name, yue2_dir};
use crate::pins::*;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

pub struct AudioCppServer {
    child: Mutex<Option<Child>>,
    pub base_url: Mutex<String>,
    pub port: Mutex<u16>,
}

impl Default for AudioCppServer {
    fn default() -> Self {
        Self {
            child: Mutex::new(None),
            base_url: Mutex::new(format!("http://{DEFAULT_HOST}:{DEFAULT_PORT}")),
            port: Mutex::new(DEFAULT_PORT),
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
        let cfg = json!({
            "host": settings.server_host,
            "port": settings.server_port,
            "backend": crate::pins::backend_name(),
            "device": 0,
            "lazy_load": true,
            "max_loaded_models": MAX_LOADED_MODELS,
            "idle_unload_ms": 0,
            "busy_timeout_ms": BUSY_TIMEOUT_MS,
            "models": models
        });
        crate::paths::atomic_write_json(&config_path, &cfg)?;
        Ok(config_path)
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

    pub fn ensure_started(&self, settings: &AppSettings) -> Result<String, String> {
        {
            let child = Self::lock(&self.child);
            if child.is_some() {
                let port = *Self::lock(&self.port);
                if Self::tcp_health(&settings.server_host, port) {
                    return Ok(Self::lock(&self.base_url).clone());
                }
            }
        }

        let cache = PathBuf::from(&settings.cache_dir);
        let bin = Self::find_server_binary(&cache)?;

        let mut port = settings.server_port;
        let mut last_err = String::new();
        for _ in 0..10 {
            let mut settings_try = settings.clone();
            settings_try.server_port = port;
            let config = Self::write_config(&settings_try)?;

            let mut cmd = Command::new(&bin);
            cmd.arg("--config")
                .arg(&config)
                .arg("--backend")
                .arg(crate::pins::backend_name())
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            match cmd.spawn() {
                Ok(mut child) => {
                    std::thread::sleep(Duration::from_millis(600));
                    if Self::tcp_health(&settings.server_host, port) {
                        let url = format!("http://{}:{}", settings.server_host, port);
                        *Self::lock(&self.child) = Some(child);
                        *Self::lock(&self.base_url) = url.clone();
                        *Self::lock(&self.port) = port;
                        return Ok(url);
                    }
                    let _ = child.kill();
                    last_err = format!(
                        "Serveur démarré mais /health KO sur {}:{}",
                        settings.server_host, port
                    );
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
        }
    }
}

#[cfg(test)]
mod semantic_metadata_tests {
    use super::AudioCppServer;
    use serde_json::json;

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
}
