#!/usr/bin/env python3
"""Essai interne BasicPitch → MIDI (issue #169).

Aucun bouton produit. Reproduit la transcription ONNX des stems de démo
et écrit MIDI + métriques mesurées sous docs/basicpitch-trial/.

Usage (depuis la racine du dépôt) :
  python3 -m venv /tmp/basicpitch-venv && source /tmp/basicpitch-venv/bin/activate
  pip install -U 'pip' 'setuptools<81' wheel
  pip install basic-pitch==0.4.0 --no-deps
  pip install -r scripts/basicpitch-trial/requirements.txt
  python scripts/basicpitch-trial/run_trial.py
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from time import perf_counter

ROOT = Path(__file__).resolve().parents[2]
STEMS_DIR = ROOT / "website" / "public" / "examples" / "real-generation-6"
OUT = ROOT / "docs" / "basicpitch-trial"
MIDI_DIR = OUT / "midi"
EXCERPT_DIR = OUT / "excerpts"
WORK = Path("/tmp/bp-work-song-maker")


def require_onnx() -> tuple[object, Path]:
    try:
        import onnxruntime  # noqa: F401
    except ImportError as e:
        raise SystemExit(
            "onnxruntime manquant. Voir scripts/basicpitch-trial/requirements.txt"
        ) from e

    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import Model

    model_path = Path(ICASSP_2022_MODEL_PATH)
    if model_path.suffix != ".onnx":
        raise SystemExit(
            f"Modèle par défaut non ONNX ({model_path}). "
            "Installez basic-pitch sans TensorFlow (--no-deps) + onnxruntime."
        )
    return Model(model_path), model_path


def ffmpeg(*args: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", *args],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def synthesize_piano_fixture(path: Path) -> None:
    import numpy as np
    import soundfile as sf

    sr = 44100
    dur = 8.0
    t = np.arange(int(sr * dur)) / sr
    notes = [
        (0.0, 0.6, 261.63),
        (0.5, 0.6, 329.63),
        (1.0, 0.6, 392.00),
        (1.5, 0.8, 523.25),
        (2.5, 1.5, 261.63),
        (2.5, 1.5, 329.63),
        (2.5, 1.5, 392.00),
        (4.2, 0.5, 293.66),
        (4.7, 0.5, 349.23),
        (5.2, 0.5, 440.00),
        (5.7, 1.2, 523.25),
        (5.7, 1.2, 659.25),
        (5.7, 1.2, 783.99),
    ]
    y = np.zeros_like(t)
    for start, length, f in notes:
        i0 = int(start * sr)
        i1 = min(len(y), int((start + length) * sr))
        n = i1 - i0
        env = np.hanning(n)
        tt = np.arange(n) / sr
        partial = np.zeros(n)
        for k, amp in enumerate([1.0, 0.45, 0.22, 0.12, 0.06], start=1):
            partial += amp * np.sin(2 * np.pi * f * k * tt) * np.exp(-2.5 * k * tt)
        y[i0:i1] += partial * env
    y = 0.35 * y / np.max(np.abs(y))
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, y, sr)


def midi_stats(midi_path: Path) -> dict:
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(str(midi_path))
    notes = [n for inst in pm.instruments for n in inst.notes]
    return {
        "note_count": len(notes),
        "pitch_min": min((n.pitch for n in notes), default=None),
        "pitch_max": max((n.pitch for n in notes), default=None),
        "midi_end_time_s": float(pm.get_end_time()),
        "instruments": len(pm.instruments),
    }


def run() -> int:
    from basic_pitch.inference import predict_and_save

    model, model_path = require_onnx()
    import importlib.util

    tf_installed = importlib.util.find_spec("tensorflow") is not None

    WORK.mkdir(parents=True, exist_ok=True)
    wav_dir = WORK / "wav"
    out_dir = WORK / "out"
    wav_dir.mkdir(exist_ok=True)
    out_dir.mkdir(exist_ok=True)
    MIDI_DIR.mkdir(parents=True, exist_ok=True)
    EXCERPT_DIR.mkdir(parents=True, exist_ok=True)

    jobs: list[tuple[str, Path, str | None]] = []
    for stem in ("vocals", "bass", "piano", "drums"):
        src = STEMS_DIR / f"{stem}.mp3"
        if not src.is_file():
            raise SystemExit(f"Stem manquant : {src}")
        wav = wav_dir / f"{stem}.wav"
        ffmpeg("-i", str(src), "-ac", "1", "-ar", "44100", str(wav))
        jobs.append((stem, wav, None))

    synth = EXCERPT_DIR / "piano-synthetic-fixture.wav"
    synthesize_piano_fixture(synth)
    synth_wav = wav_dir / "piano_synthetic.wav"
    shutil.copy(synth, synth_wav)
    jobs.append(("piano_synthetic", synth_wav, "piano-fixture-supplement"))

    sketch_src = ROOT / "website" / "public" / "examples" / "piano-roll-sketch.wav"
    if sketch_src.is_file():
        sketch_wav = wav_dir / "piano_sketch.wav"
        ffmpeg("-i", str(sketch_src), "-ac", "1", "-ar", "44100", str(sketch_wav))
        jobs.append(("piano_sketch", sketch_wav, "piano-fixture-supplement"))

    results = []
    for stem, audio, role in jobs:
        t0 = perf_counter()
        predict_and_save(
            [str(audio)],
            str(out_dir),
            True,
            True,
            False,
            True,
            model,
        )
        elapsed = perf_counter() - t0
        mid = out_dir / f"{stem}_basic_pitch.mid"
        dest = MIDI_DIR / f"{stem}.mid"
        dest.write_bytes(mid.read_bytes())
        son = out_dir / f"{stem}_basic_pitch.wav"
        excerpt_orig = EXCERPT_DIR / f"{stem}-original-8s.wav"
        excerpt_midi = EXCERPT_DIR / f"{stem}-midi-sonify-8s.wav"
        ffmpeg("-i", str(audio), "-t", "8", str(excerpt_orig))
        if son.is_file():
            ffmpeg("-i", str(son), "-t", "8", str(excerpt_midi))
        row = {
            "stem": stem,
            "elapsed_seconds": round(elapsed, 3),
            "midi_file": f"midi/{stem}.mid",
            "backend": "onnx",
            "model": str(model_path),
            "tensorflow_installed": tf_installed,
            "onnxruntime_installed": True,
            **midi_stats(dest),
        }
        if role:
            row["role"] = role
            row["source"] = str(audio)
        results.append(row)
        print(json.dumps(row, ensure_ascii=False))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "metrics.json").write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Écrit {OUT / 'metrics.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
