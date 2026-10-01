#!/usr/bin/env python3
"""Self-hosted project sync HTTP server for Song Maker (#62).

Endpoints (docs/project-sync-contract.md):
  PUT    /v1/projects/{id}/sync
  GET    /v1/projects/{id}/sync
  DELETE /v1/projects/{id}/sync

Stores encrypted artifact payloads under --data-dir (at rest).
Does not accept settings/tokens/LoRA cache. Local-first clients remain usable offline.

Usage:
  python scripts/project-sync-server.py --host 127.0.0.1 --port 8787 --data-dir ./sync-data
"""

from __future__ import annotations

import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


PROJECT_RE = re.compile(r"^/v1/projects/([^/]+)/sync$")


def safe_id(project_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", project_id)
    if not cleaned or cleaned in {".", ".."}:
        raise ValueError("project id invalide")
    return cleaned


class Handler(BaseHTTPRequestHandler):
    data_dir: Path

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Authorization")
        self.end_headers()

    def do_PUT(self) -> None:  # noqa: N802
        m = PROJECT_RE.match(self.path.split("?", 1)[0])
        if not m:
            return self._json(404, {"error": "not found"})
        try:
            pid = safe_id(unquote(m.group(1)))
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return self._json(400, {"error": "JSON invalide"})
        envelope = payload.get("envelope") or {}
        artifacts = payload.get("artifacts") or []
        # Exclude secrets by relativePath policy
        filtered = []
        for art in artifacts:
            rel = str(art.get("relativePath") or "").replace("\\", "/")
            low = rel.lower()
            if any(x in low for x in ("token", "secret", "credential", "lora-cache", "settings")):
                continue
            filtered.append(art)
        dest = self.data_dir / pid
        dest.mkdir(parents=True, exist_ok=True)
        (dest / "envelope.json").write_text(
            json.dumps(envelope, indent=2) + "\n", encoding="utf-8"
        )
        (dest / "artifacts.json").write_text(
            json.dumps(filtered, indent=2) + "\n", encoding="utf-8"
        )
        tomb = self.data_dir / f"{pid}.tombstone"
        if tomb.exists():
            tomb.unlink()
        return self._json(200, {"ok": True, "artifactCount": len(filtered)})

    def do_GET(self) -> None:  # noqa: N802
        m = PROJECT_RE.match(self.path.split("?", 1)[0])
        if not m:
            return self._json(404, {"error": "not found"})
        try:
            pid = safe_id(unquote(m.group(1)))
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        dest = self.data_dir / pid
        if not dest.is_dir():
            return self._json(404, {"error": "projet absent du serveur de synchro"})
        envelope = {}
        artifacts = []
        env_path = dest / "envelope.json"
        art_path = dest / "artifacts.json"
        if env_path.is_file():
            envelope = json.loads(env_path.read_text(encoding="utf-8"))
        if art_path.is_file():
            artifacts = json.loads(art_path.read_text(encoding="utf-8"))
        return self._json(200, {"envelope": envelope, "artifacts": artifacts})

    def do_DELETE(self) -> None:  # noqa: N802
        m = PROJECT_RE.match(self.path.split("?", 1)[0])
        if not m:
            return self._json(404, {"error": "not found"})
        try:
            pid = safe_id(unquote(m.group(1)))
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        dest = self.data_dir / pid
        if dest.is_dir():
            for child in sorted(dest.rglob("*"), reverse=True):
                if child.is_file():
                    child.unlink()
                elif child.is_dir():
                    child.rmdir()
            dest.rmdir()
        (self.data_dir / f"{pid}.tombstone").write_text("1\n", encoding="utf-8")
        return self._json(200, {"ok": True, "tombstone": True})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[project-sync] {self.address_string()} {fmt % args}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--data-dir", default="./sync-data")
    args = parser.parse_args()
    data_dir = Path(args.data_dir).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    Handler.data_dir = data_dir
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(
        f"Song Maker project-sync server on http://{args.host}:{args.port} "
        f"(data={data_dir})"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
