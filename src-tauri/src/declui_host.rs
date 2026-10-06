//! Hôte DeclUI embarqué — loopback 127.0.0.1 seulement (#343).
//!
//! Implémente `GET /v1/host/discover` et `POST /v1/host/invoke` du protocole
//! `song-maker.host.v1`. La génération YuE2 reste sur le desktop Tauri :
//! `list_projects` est réel ; les autres capacités musique renvoient une erreur typée.

use crate::library::list_library;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

const API_VERSION: &str = "song-maker.host.v1";
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedDeclUiStatus {
    pub running: bool,
    pub url: Option<String>,
    pub bind: String,
    pub notes_fr: String,
}

struct Running {
    url: String,
    stop: Arc<AtomicBool>,
    join: JoinHandle<()>,
}

#[derive(Default)]
pub struct EmbeddedDeclUiState {
    inner: Mutex<Option<Running>>,
}

#[derive(Deserialize)]
struct InvokeBody {
    capability: String,
    #[serde(default)]
    #[allow(dead_code)]
    args: Value,
}

pub fn discover_payload() -> Value {
    json!({
        "apiVersion": API_VERSION,
        "hostId": "akasha",
        "musicApi": {
            "id": "song-maker-music",
            "kind": "music",
            "version": 1,
            "capabilities": ["list_projects"]
        },
        "declUiSurfaces": [
            { "id": "library", "declaration": "songmaker.library.v1" },
            { "id": "song_form", "declaration": "songmaker.song_form.v1" },
            { "id": "mix_transport", "declaration": "songmaker.mix_transport.v1" },
            { "id": "licenses", "declaration": "songmaker.licenses.v1" },
            { "id": "agent_panel", "declaration": "songmaker.agent_panel.v1" }
        ]
    })
}

pub fn handle_request(method: &str, path: &str, body: &[u8]) -> (u16, Value) {
    let path = path.split('?').next().unwrap_or(path);
    match (method, path) {
        ("OPTIONS", _) => (204, json!({})),
        ("GET", "/v1/host/discover") => (200, discover_payload()),
        ("POST", "/v1/host/invoke") => invoke(body),
        _ => (
            404,
            json!({
                "ok": false,
                "errorCode": "host_unreachable",
                "messageFr": "Route hôte DeclUI inconnue."
            }),
        ),
    }
}

fn invoke(body: &[u8]) -> (u16, Value) {
    let parsed: InvokeBody = match serde_json::from_slice(body) {
        Ok(v) => v,
        Err(_) => {
            return (
                400,
                json!({
                    "ok": false,
                    "errorCode": "capability_unknown",
                    "messageFr": "Corps d’invocation DeclUI invalide."
                }),
            );
        }
    };
    match parsed.capability.as_str() {
        "list_projects" => match list_library(None) {
            Ok(rows) => (
                200,
                json!({
                    "ok": true,
                    "result": rows,
                }),
            ),
            Err(e) => (
                500,
                json!({
                    "ok": false,
                    "errorCode": "host_unreachable",
                    "messageFr": format!("list_projects : {e}"),
                }),
            ),
        },
        "generate_yue2" | "separate_stems" | "export_mix" | "apply_style_lora" => (
            403,
            json!({
                "ok": false,
                "errorCode": "capability_denied",
                "messageFr":
                    "Capacité musique connue mais non exécutée par l’hôte embarqué. La génération, la séparation et l’export restent sur le desktop Tauri local — pas un relais réseau."
            }),
        ),
        _ => (
            400,
            json!({
                "ok": false,
                "errorCode": "capability_unknown",
                "messageFr": format!("Capacité inconnue: {}", parsed.capability),
            }),
        ),
    }
}

fn http_response(status: u16, body: &Value) -> Vec<u8> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        403 => "Forbidden",
        404 => "Not Found",
        _ => "Error",
    };
    let payload = if status == 204 {
        Vec::new()
    } else {
        serde_json::to_vec(body).unwrap_or_else(|_| b"{}".to_vec())
    };
    let mut out = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: Authorization, Content-Type\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Connection: close\r\n"
    )
    .into_bytes();
    if status != 204 {
        out.extend_from_slice(b"Content-Type: application/json; charset=utf-8\r\n");
        out.extend_from_slice(format!("Content-Length: {}\r\n", payload.len()).as_bytes());
    }
    out.extend_from_slice(b"\r\n");
    out.extend_from_slice(&payload);
    out
}

async fn serve_one(mut socket: tokio::net::TcpStream, stop: Arc<AtomicBool>) {
    if stop.load(Ordering::Relaxed) {
        return;
    }
    let mut buf = Vec::new();
    let mut tmp = [0u8; 2048];
    loop {
        let n = match socket.read(&mut tmp).await {
            Ok(0) => return,
            Ok(n) => n,
            Err(_) => return,
        };
        buf.extend_from_slice(&tmp[..n]);
        if buf.len() > MAX_HEADER_BYTES + MAX_BODY_BYTES {
            return;
        }
        if let Some(header_end) = find_header_end(&buf) {
            let (method, path, content_length) = {
                let header = match std::str::from_utf8(&buf[..header_end]) {
                    Ok(s) => s,
                    Err(_) => return,
                };
                let mut lines = header.split("\r\n");
                let request_line = lines.next().unwrap_or("");
                let mut parts = request_line.split_whitespace();
                let method = parts.next().unwrap_or("GET").to_string();
                let path = parts.next().unwrap_or("/").to_string();
                let mut content_length = 0usize;
                for line in lines {
                    let lower = line.to_ascii_lowercase();
                    if let Some(v) = lower.strip_prefix("content-length:") {
                        content_length = v.trim().parse().unwrap_or(0);
                    }
                }
                (method, path, content_length)
            };
            if content_length > MAX_BODY_BYTES {
                return;
            }
            let body_start = header_end + 4;
            while buf.len() < body_start + content_length {
                let n = match socket.read(&mut tmp).await {
                    Ok(0) => return,
                    Ok(n) => n,
                    Err(_) => return,
                };
                buf.extend_from_slice(&tmp[..n]);
            }
            let body = buf[body_start..body_start + content_length].to_vec();
            let (status, json) = handle_request(&method, &path, &body);
            let _ = socket.write_all(&http_response(status, &json)).await;
            return;
        }
    }
}

fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

fn notes_fr() -> String {
    "Hôte DeclUI embarqué sur 127.0.0.1 (aucun bind public). Découverte réelle ; list_projects local. YuE2 / stems / export restent desktop. Pas de réseau sans opt-in client.".into()
}

#[tauri::command]
pub async fn embedded_declui_status(
    state: tauri::State<'_, EmbeddedDeclUiState>,
) -> Result<EmbeddedDeclUiStatus, String> {
    Ok(embedded_declui_status_for(state.inner()).await)
}

async fn embedded_declui_status_for(state: &EmbeddedDeclUiState) -> EmbeddedDeclUiStatus {
    let mut g = state.inner.lock().await;
    match g.as_ref() {
        Some(r) if !r.stop.load(Ordering::Acquire) && !r.join.is_finished() => {
            EmbeddedDeclUiStatus {
                running: true,
                url: Some(r.url.clone()),
                bind: "127.0.0.1".into(),
                notes_fr: notes_fr(),
            }
        }
        _ => {
            if let Some(r) = g.take() {
                r.stop.store(true, Ordering::Release);
                r.join.abort();
            }
            EmbeddedDeclUiStatus {
                running: false,
                url: None,
                bind: "127.0.0.1".into(),
                notes_fr: notes_fr(),
            }
        }
    }
}

#[tauri::command]
pub async fn start_embedded_declui_host(
    state: tauri::State<'_, EmbeddedDeclUiState>,
) -> Result<EmbeddedDeclUiStatus, String> {
    start_embedded_declui_host_for(state.inner()).await
}

async fn start_embedded_declui_host_for(
    state: &EmbeddedDeclUiState,
) -> Result<EmbeddedDeclUiStatus, String> {
    // Hold the state lock through bind and publication. Otherwise two concurrent
    // starts can each open an ephemeral listener and the last one overwrites the
    // only handle that `stop_embedded_declui_host` knows how to stop.
    let mut g = state.inner.lock().await;
    if let Some(r) = g.as_ref() {
        if !r.stop.load(Ordering::Acquire) && !r.join.is_finished() {
            return Ok(EmbeddedDeclUiStatus {
                running: true,
                url: Some(r.url.clone()),
                bind: "127.0.0.1".into(),
                notes_fr: notes_fr(),
            });
        }
    }
    if let Some(r) = g.take() {
        r.stop.store(true, Ordering::Release);
        r.join.abort();
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Bind hôte DeclUI embarqué : {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("Adresse hôte DeclUI : {e}"))?;
    if !addr.ip().is_loopback() {
        return Err("L’hôte DeclUI embarqué n’écoute que sur la boucle locale.".into());
    }
    let url = format!("http://127.0.0.1:{}", addr.port());
    let stop = Arc::new(AtomicBool::new(false));
    let stop_task = Arc::clone(&stop);
    let connections = Arc::new(Mutex::new(Vec::<JoinHandle<()>>::new()));
    let connections_task = Arc::clone(&connections);
    let join = tokio::spawn(async move {
        loop {
            if stop_task.load(Ordering::Relaxed) {
                break;
            }
            let accept =
                tokio::time::timeout(std::time::Duration::from_millis(250), listener.accept())
                    .await;
            match accept {
                Ok(Ok((socket, peer))) => {
                    if !peer.ip().is_loopback() {
                        continue;
                    }
                    let stop_conn = Arc::clone(&stop_task);
                    let connection = tokio::spawn(async move {
                        serve_one(socket, stop_conn).await;
                    });
                    let mut active = connections_task.lock().await;
                    active.retain(|task| !task.is_finished());
                    active.push(connection);
                }
                Ok(Err(_)) => break,
                Err(_) => continue,
            }
        }
        stop_task.store(true, Ordering::Release);
        let mut active = connections_task.lock().await;
        for task in active.drain(..) {
            task.abort();
        }
    });
    *g = Some(Running {
        url: url.clone(),
        stop,
        join,
    });
    Ok(EmbeddedDeclUiStatus {
        running: true,
        url: Some(url),
        bind: "127.0.0.1".into(),
        notes_fr: notes_fr(),
    })
}

#[tauri::command]
pub async fn stop_embedded_declui_host(
    state: tauri::State<'_, EmbeddedDeclUiState>,
) -> Result<EmbeddedDeclUiStatus, String> {
    Ok(stop_embedded_declui_host_for(state.inner()).await)
}

async fn stop_embedded_declui_host_for(state: &EmbeddedDeclUiState) -> EmbeddedDeclUiStatus {
    let mut g = state.inner.lock().await;
    if let Some(r) = g.take() {
        r.stop.store(true, Ordering::Release);
        let mut join = r.join;
        if tokio::time::timeout(std::time::Duration::from_secs(1), &mut join)
            .await
            .is_err()
        {
            join.abort();
        }
    }
    EmbeddedDeclUiStatus {
        running: false,
        url: None,
        bind: "127.0.0.1".into(),
        notes_fr: notes_fr(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discover_is_music_api_not_tts() {
        let body = discover_payload();
        assert_eq!(body["apiVersion"], API_VERSION);
        assert_eq!(body["musicApi"]["kind"], "music");
        assert_eq!(body["musicApi"]["id"], "song-maker-music");
        assert_ne!(body["musicApi"]["kind"], "tts");
    }

    #[test]
    fn invoke_unknown_is_typed() {
        let (status, body) = handle_request(
            "POST",
            "/v1/host/invoke",
            br#"{"capability":"tts_speak","args":{}}"#,
        );
        assert_eq!(status, 400);
        assert_eq!(body["errorCode"], "capability_unknown");
        assert_eq!(body["ok"], false);
    }

    #[test]
    fn generate_stays_on_desktop() {
        let (status, body) = handle_request(
            "POST",
            "/v1/host/invoke",
            br#"{"capability":"generate_yue2","args":{}}"#,
        );
        assert_eq!(status, 403);
        assert_eq!(body["errorCode"], "capability_denied");
        assert!(body["messageFr"].as_str().unwrap().contains("desktop"));
    }

    #[test]
    fn discover_route() {
        let (status, body) = handle_request("GET", "/v1/host/discover", b"");
        assert_eq!(status, 200);
        assert_eq!(body["hostId"], "akasha");
    }

    #[tokio::test]
    async fn concurrent_starts_share_one_listener_and_stop_releases_it() {
        let state = EmbeddedDeclUiState::default();
        let (left, right) = tokio::join!(
            start_embedded_declui_host_for(&state),
            start_embedded_declui_host_for(&state),
        );
        let left = left.unwrap();
        let right = right.unwrap();
        assert_eq!(left.url, right.url);
        assert!(left.running && right.running);

        let stopped = stop_embedded_declui_host_for(&state).await;
        assert!(!stopped.running);
        assert_eq!(embedded_declui_status_for(&state).await.url, None);

        let restarted = start_embedded_declui_host_for(&state).await.unwrap();
        assert!(restarted.running);
        stop_embedded_declui_host_for(&state).await;
    }

    #[tokio::test]
    async fn status_clears_a_listener_task_that_has_exited() {
        let state = EmbeddedDeclUiState::default();
        let started = start_embedded_declui_host_for(&state).await.unwrap();
        {
            let guard = state.inner.lock().await;
            guard.as_ref().unwrap().join.abort();
        }
        tokio::task::yield_now().await;

        let status = embedded_declui_status_for(&state).await;
        assert!(!status.running);
        assert_eq!(status.url, None);
        let restarted = start_embedded_declui_host_for(&state).await.unwrap();
        assert!(restarted.running);
        assert!(started.url.is_some());
        stop_embedded_declui_host_for(&state).await;
    }

    #[tokio::test]
    async fn loopback_discovery_is_served_and_listener_closes_on_stop() {
        let state = EmbeddedDeclUiState::default();
        let started = start_embedded_declui_host_for(&state).await.unwrap();
        let address = started
            .url
            .as_deref()
            .unwrap()
            .trim_start_matches("http://");

        let mut client = tokio::net::TcpStream::connect(address).await.unwrap();
        client
            .write_all(b"GET /v1/host/discover HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .await
            .unwrap();
        let mut response = Vec::new();
        client.read_to_end(&mut response).await.unwrap();
        let response = String::from_utf8(response).unwrap();
        assert!(response.starts_with("HTTP/1.1 200 OK"));
        assert!(response.contains("\"hostId\":\"akasha\""));

        stop_embedded_declui_host_for(&state).await;
        assert!(tokio::net::TcpStream::connect(address).await.is_err());
    }
}
