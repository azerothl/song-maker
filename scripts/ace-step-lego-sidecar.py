#!/usr/bin/env python3
"""ACE-Step 1.5 Base Lego sidecar (Rbitnet-style loopback REST).

GET /ready — process is up.
POST /v1/lego — add-track against a source WAV.

Mock mode (SONG_MAKER_ACE_STEP_LEGO_MOCK=1): copies the source WAV so tests
and machines without Base weights do not invent audio.cpp audio_input.

Real mode: forwards to an ACE-Step 1.5 API (task_type=lego) if ACESTEP_API_BASE
is set or a local acestep install can start the documented REST server. The
upstream guide does not promise a dry stem; this sidecar always reports
outputKind=possibly_fused_mix.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.environ.get("ACE_STEP_LEGO_BIND_HOST", "127.0.0.1")
PORT = int(os.environ.get("ACE_STEP_LEGO_BIND_PORT", "8002"))
MOCK = os.environ.get("SONG_MAKER_ACE_STEP_LEGO_MOCK", "").strip() in {
    "1",
    "true",
    "TRUE",
    "yes",
}
VRAM_NOTE_FR = (
    "ACE-Step 1.5 Base (Lego) : GPU recommandé, ≥12 Go de VRAM conseillés ; "
    "CPU possible mais très lent. YuE2 et Lego ne tiennent pas en VRAM en même temps "
    "(file GPU séquentielle)."
)
OUTPUT_KIND = "possibly_fused_mix"


def _json_bytes(payload: dict, code: int = 200) -> tuple[int, bytes]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return code, body


def _read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or "0")
    raw = handler.rfile.read(length) if length else b"{}"
    if not raw:
        return {}
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("JSON object required")
    return data


def _copy_wav(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, dest)


def _acestep_api_base() -> str | None:
    raw = os.environ.get("ACESTEP_API_BASE", "").strip()
    return raw.rstrip("/") if raw else None


def _http_json(method: str, url: str, payload: dict | None = None, timeout: int = 120) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        suffix = f": {detail}" if detail else f" {exc.reason}"
        raise RuntimeError(f"ACE-Step HTTP {exc.code}{suffix}") from exc
    if not raw:
        return {}
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("réponse ACE-Step inattendue")
    return parsed


def _upload_source_audio(
    url: str,
    src: Path,
    fields: dict[str, str],
    timeout: int = 60,
) -> dict:
    """Submit a local source audio file through ACE-Step's supported upload API.

    The pinned ACE-Step server only accepts absolute audio paths inside its own
    temporary directory. Song Maker project files live elsewhere, so sending
    src_audio_path as JSON is rejected with HTTP 400. Multipart upload lets the
    server place the source in its own temporary directory and validate it.
    """
    boundary = f"----SongMaker{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )
    chunks.append(
        (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="src_audio"; filename="source.wav"\r\n'
            "Content-Type: audio/wav\r\n\r\n"
        ).encode("utf-8")
    )
    chunks.append(src.read_bytes())
    chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("ascii"))
    req = urllib.request.Request(
        url,
        data=b"".join(chunks),
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        suffix = f": {detail}" if detail else f" {exc.reason}"
        raise RuntimeError(f"ACE-Step HTTP {exc.code}{suffix}") from exc
    if not raw:
        return {}
    parsed = json.loads(raw.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError("réponse ACE-Step inattendue")
    return parsed


def _run_via_acestep_api(
    base: str,
    src: Path,
    dest: Path,
    caption: str,
    instruction: str,
    seed: int,
) -> None:
    release = _upload_source_audio(
        f"{base}/release_task",
        src,
        {
            "task_type": "lego",
            "prompt": caption,
            "instruction": instruction,
            "thinking": "false",
            "use_random_seed": "false",
            "seed": str(seed),
            "batch_size": "1",
            "audio_format": "wav",
            "model": "acestep-v15-base",
        },
    )
    data = release.get("data") if isinstance(release.get("data"), dict) else {}
    task_id = data.get("task_id")
    if not task_id:
        raise RuntimeError(release.get("error") or "ACE-Step n’a pas renvoyé de task_id")
    deadline = time.time() + 7200
    audio_url = None
    while time.time() < deadline:
        queried = _http_json(
            "POST",
            f"{base}/query_result",
            {"task_id_list": [task_id]},
            timeout=60,
        )
        rows = queried.get("data")
        if isinstance(rows, list) and rows:
            row = rows[0]
            status = row.get("status")
            if status == 2:
                raise RuntimeError(str(row.get("error") or "échec Lego ACE-Step"))
            if status == 1:
                result = row.get("result")
                parsed = json.loads(result) if isinstance(result, str) else result
                if isinstance(parsed, list) and parsed:
                    file_field = parsed[0].get("file") if isinstance(parsed[0], dict) else None
                    if isinstance(file_field, str) and file_field:
                        audio_url = (
                            file_field
                            if file_field.startswith("http")
                            else f"{base}{file_field}"
                        )
                break
        time.sleep(2)
    if not audio_url:
        raise RuntimeError("délai dépassé en attendant le WAV Lego")
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(audio_url, timeout=120) as resp:
        dest.write_bytes(resp.read())
    if dest.stat().st_size <= 0:
        raise RuntimeError("WAV Lego vide")


def _inference_available() -> bool:
    if MOCK:
        return True
    base = _acestep_api_base()
    if not base:
        return False
    try:
        _http_json("GET", f"{base}/health", timeout=1)
        return True
    except Exception:
        return False


def run_lego(payload: dict) -> dict:
    src = Path(str(payload.get("srcAudioPath") or payload.get("src_audio_path") or ""))
    dest = Path(str(payload.get("outWav") or payload.get("out_wav") or ""))
    caption = str(payload.get("caption") or "").strip()
    instruction = str(payload.get("instruction") or "").strip()
    seed = int(payload.get("seed") or 0)
    if not src.is_file():
        raise FileNotFoundError(f"Source audio introuvable : {src}")
    if dest.as_posix() in {"", "."}:
        raise ValueError("outWav manquant")
    if MOCK:
        _copy_wav(src, dest)
        return {
            "ok": True,
            "outWav": str(dest),
            "outputKind": OUTPUT_KIND,
            "mode": "mock",
            "engineId": "ace_step_1_5_base_lego",
        }
    base = _acestep_api_base()
    if base:
        _run_via_acestep_api(base, src, dest, caption, instruction, seed)
        return {
            "ok": True,
            "outWav": str(dest),
            "outputKind": OUTPUT_KIND,
            "mode": "acestep_api",
            "engineId": "ace_step_1_5_base_lego",
        }
    if not _inference_available():
        raise RuntimeError(
            "Sidecar Lego installé sans inférence ACE-Step 1.5 Base. "
            "Installez le paquet Python opt-in depuis Paramètres → Modèle (Lego)."
        )
    raise RuntimeError(
        "Le paquet acestep est présent mais ACESTEP_API_BASE n’est pas défini. "
        "Démarrez le serveur REST ACE-Step 1.5 Base (acestep-v15-base, task_type=lego)."
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write("ace-step-lego: " + (fmt % args) + "\n")

    def _send(self, code: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in {"/ready", "/health"}:
            code, body = _json_bytes(
                {
                    "ready": _inference_available(),
                    "mock": MOCK,
                    "inferenceAvailable": _inference_available(),
                    "outputKind": OUTPUT_KIND,
                    "vramNoteFr": VRAM_NOTE_FR,
                    "engineId": "ace_step_1_5_base_lego",
                    "service": "ace-step-lego",
                }
            )
            self._send(code, body)
            return
        self._send(404, b'{"error":"not_found"}')

    def do_POST(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/v1/lego":
            self._send(404, b'{"error":"not_found"}')
            return
        try:
            payload = _read_json(self)
            result = run_lego(payload)
            code, body = _json_bytes(result)
            self._send(code, body)
        except Exception as exc:  # noqa: BLE001 — surface sidecar faults to Song Maker
            code, body = _json_bytes({"ok": False, "error": str(exc)}, 503)
            self._send(code, body)


def main() -> int:
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    sys.stderr.write(
        f"ace-step-lego sidecar on http://{HOST}:{PORT} mock={MOCK} id={uuid.uuid4()}\n"
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
