#!/usr/bin/env python3
"""Install the pinned ACE-Step project with its CUDA indices and local sources."""
import io
import os
from pathlib import Path
import subprocess
import sys
import urllib.request
import zipfile

UV_VERSION = "0.9.2"


def source_url(revision):
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("ACE-Step requires a full lowercase commit SHA")
    return f"https://codeload.github.com/ace-step/ACE-Step-1.5/zip/{revision}"


def sync_command(python, source):
    return [str(python), "-m", "uv", "sync", "--project", str(source), "--active",
            "--locked", "--no-dev", "--inexact", "--no-python-downloads"]


def install(root, revision):
    if not (3, 11) <= sys.version_info[:2] < (3, 13):
        raise RuntimeError("ACE-Step Base nécessite Python 3.11 ou 3.12.")
    root = Path(root).resolve()
    source = root / ("source-" + revision)
    marker = source / ".song-maker-source-complete"
    if not marker.is_file():
        request = urllib.request.Request(source_url(revision), headers={"User-Agent": "Song-Maker-Lego"})
        with urllib.request.urlopen(request, timeout=120) as response:
            archive = zipfile.ZipFile(io.BytesIO(response.read()))
        prefix = f"ACE-Step-1.5-{revision}/"
        for member in archive.infolist():
            if not member.filename.startswith(prefix):
                raise RuntimeError("Archive ACE-Step inattendue")
            relative = Path(member.filename[len(prefix):])
            target = (source / relative).resolve()
            if not target.is_relative_to(source):
                raise RuntimeError("Chemin invalide dans l’archive ACE-Step")
            if member.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(member))
        marker.write_text(revision, encoding="utf-8")
    subprocess.run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check",
                    "--no-input", f"uv=={UV_VERSION}"], check=True)
    env = dict(os.environ, VIRTUAL_ENV=str(root))
    subprocess.run(sync_command(sys.executable, source), env=env, check=True)
    subprocess.run([sys.executable, "-c", "import acestep.api_server"], env=env, check=True)


if __name__ == "__main__":
    install(sys.argv[1], sys.argv[2])
