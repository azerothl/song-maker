#!/usr/bin/env python3
"""Prepare Song Maker's isolated ONNX runtime; never install into system Python."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from contextlib import contextmanager
from pathlib import Path

BASIC_PITCH_VERSION = "0.4.0"
CHECK_CODE = r"""
import importlib.metadata, importlib.util, json, sys
assert importlib.metadata.version('basic-pitch') == '0.4.0'
assert importlib.util.find_spec('tensorflow') is None, 'TensorFlow must not be installed in the ONNX runtime'
expected = '1.31.0' if sys.version_info >= (3,11) else '1.23.2'
assert importlib.metadata.version('onnxruntime') == expected
import onnxruntime, librosa, pretty_midi, resampy, mir_eval, scipy, sklearn
from basic_pitch import FilenameSuffix, build_icassp_2022_model_path
from basic_pitch.inference import Model
model = Model(build_icassp_2022_model_path(FilenameSuffix.onnx))
assert model.model_type == Model.MODEL_TYPES.ONNX
print(json.dumps({'ready':True,'python':sys.executable,'backend':'onnx'}))
"""


def python_path(root: Path) -> Path:
    return root / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def run(args: list[str], **kwargs) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    for name in ("PYTHONPATH", "PYTHONHOME"):
        env.pop(name, None)
    return subprocess.run(
        args,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        timeout=900,
        **kwargs,
    )


def ready(root: Path) -> bool:
    python = python_path(root)
    if not python.is_file():
        return False
    try:
        result = run(
            [str(python), "-I", "-c", CHECK_CODE],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return result.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


@contextmanager
def installation_lock(root: Path):
    # OS locks are released on a crash; separate application processes cannot
    # install into the same environment at the same time.
    lock_path = root.parent / (root.name + ".install.lock")
    with lock_path.open("a+b") as lock:
        lock.seek(0, os.SEEK_END)
        if lock.tell() == 0:
            lock.write(b"\0")
            lock.flush()
        deadline = time.monotonic() + 900
        while True:
            try:
                lock.seek(0)
                if os.name == "nt":
                    import msvcrt

                    msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Une autre préparation de BasicPitch est encore en cours.")
                time.sleep(0.25)
        try:
            yield
        finally:
            lock.seek(0)
            if os.name == "nt":
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)


def prepare(root: Path, requirements: str) -> None:
    root.parent.mkdir(parents=True, exist_ok=True)
    with installation_lock(root):
        if ready(root):
            return
        if not python_path(root).is_file():
            run([sys.executable, "-I", "-m", "venv", str(root)], check=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        dependencies = root / "onnx-requirements.txt"
        dependencies.write_text(requirements, encoding="utf-8")
        python = python_path(root)
        pip = [str(python), "-I", "-m", "pip", "--isolated", "install",
               "--index-url", "https://pypi.org/simple", "--disable-pip-version-check",
               "--no-input", "--no-cache-dir"]
        log_path = root / "installation.log"
        with log_path.open("a", encoding="utf-8") as log:
            run([*pip, "-r", str(dependencies)],
                check=True, stdout=log, stderr=subprocess.STDOUT)
            run([*pip, "--no-deps", f"basic-pitch=={BASIC_PITCH_VERSION}"],
                check=True, stdout=log, stderr=subprocess.STDOUT)
            # Record the actual import/model error in the installation log.
            run([str(python), "-I", "-c", CHECK_CODE],
                check=True, stdout=log, stderr=subprocess.STDOUT)


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    if len(sys.argv) != 3:
        print("usage: prepare.py <runtime-directory> <requirements> | --check <runtime-directory>", file=sys.stderr)
        return 2
    check_only = sys.argv[1] == "--check"
    root = Path(sys.argv[2] if check_only else sys.argv[1]).resolve()
    try:
        if check_only:
            if not ready(root):
                return 1
        else:
            prepare(root, sys.argv[2])
        print(json.dumps({"ready": True, "python": str(python_path(root)), "backend": "onnx"}))
        return 0
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(json.dumps({"error": "La préparation de la détection de notes a échoué. Vérifiez la connexion Internet puis réessayez.",
                          "details": str(error)[:1200], "log": str(root / "installation.log")}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
