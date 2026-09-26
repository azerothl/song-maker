//! Client HTTP du serveur audio.cpp (process Tauri, pas la webview).

use crate::models::AppSettings;
use crate::paths::{binaries_dir, htdemucs_path, yue2_dir};
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
    pub fn write_config(settings: &AppSettings) -> Result<PathBuf, String> {
        let cache = PathBuf::from(&settings.cache_dir);
        let bin_dir = binaries_dir(&cache);
        crate::paths::ensure_dir(&bin_dir).map_err(|e| e.to_string())?;
        let config_path = bin_dir.join("audiocpp-server.json");
        let yue2 = yue2_dir(&cache);
        let htd = htdemucs_path(&cache);
        let cfg = json!({
            "host": settings.server_host,
            "port": settings.server_port,
            "backend": "cuda",
            "device": 0,
            "lazy_load": true,
            "max_loaded_models": MAX_LOADED_MODELS,
            "idle_unload_ms": 0,
            "busy_timeout_ms": BUSY_TIMEOUT_MS,
            "models": [
                {
                    "id": "yue2",
                    "family": "yue2",
                    "path": yue2.display().to_string(),
                    "task": "gen",
                    "mode": "offline",
                    "busy_timeout_ms": YUE2_BUSY_TIMEOUT_MS
                },
                {
                    "id": "htdemucs",
                    "family": "htdemucs",
                    "path": htd.display().to_string(),
                    "task": "sep",
                    "mode": "offline",
                    "busy_timeout_ms": HTDEMUCS_BUSY_TIMEOUT_MS
                }
            ]
        });
        crate::paths::atomic_write_json(&config_path, &cfg)?;
        Ok(config_path)
    }

    fn find_server_binary(cache: &Path) -> Result<PathBuf, String> {
        let extract = binaries_dir(cache).join("extracted");
        if extract.exists() {
            for entry in walkdir::WalkDir::new(&extract).max_depth(4) {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy();
                if name == "audiocpp_server" || name == "audiocpp_server.exe" {
                    return Ok(entry.path().to_path_buf());
                }
            }
        }
        // Also search archive extract folder named after archive
        let alt = binaries_dir(cache).join("linux-cuda12.8-colab");
        if alt.exists() {
            for entry in walkdir::WalkDir::new(&alt).max_depth(4) {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy();
                if name == "audiocpp_server" {
                    return Ok(entry.path().to_path_buf());
                }
            }
        }
        Err(
            "audiocpp_server introuvable. Lancez scripts/phase0/download-binaries.sh puis extrayez l'archive."
                .into(),
        )
    }

    pub fn tcp_health(host: &str, port: u16) -> bool {
        use std::io::{Read, Write};
        use std::net::TcpStream;
        let addr = format!("{host}:{port}");
        let Ok(mut stream) = TcpStream::connect_timeout(
            &addr.parse().unwrap_or_else(|_| std::net::SocketAddr::from(([127, 0, 0, 1], port))),
            Duration::from_millis(400),
        ) else {
            return false;
        };
        let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
        let req = format!(
            "GET /health HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n"
        );
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
            let child = self.child.lock().unwrap();
            if child.is_some() {
                let port = *self.port.lock().unwrap();
                if Self::tcp_health(&settings.server_host, port) {
                    return Ok(self.base_url.lock().unwrap().clone());
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
                .arg("cuda")
                .stdout(Stdio::null())
                .stderr(Stdio::null());

            match cmd.spawn() {
                Ok(mut child) => {
                    std::thread::sleep(Duration::from_millis(600));
                    if Self::tcp_health(&settings.server_host, port) {
                        let url = format!("http://{}:{}", settings.server_host, port);
                        *self.child.lock().unwrap() = Some(child);
                        *self.base_url.lock().unwrap() = url.clone();
                        *self.port.lock().unwrap() = port;
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
            "Impossible de démarrer audiocpp_server (CUDA requis). {last_err}"
        ))
    }

    pub async fn health_async(url: &str) -> bool {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build();
        let Ok(client) = client else {
            return false;
        };
        client
            .get(format!("{url}/health"))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
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
        if let Ok(url) = self.base_url.lock() {
            let url = url.clone();
            if let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            {
                let _ = rt.block_on(Self::unload_all(&url));
            }
        }
        if let Ok(mut child) = self.child.lock() {
            if let Some(mut c) = child.take() {
                let _ = c.kill();
            }
        }
    }
}
