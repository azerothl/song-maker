#!/usr/bin/env python3
"""Product transcribe: audio → MIDI via BasicPitch 0.4.0 ONNX (no TensorFlow)."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: transcribe.py <input-audio> <output.mid>", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    dest = Path(sys.argv[2])
    if not src.is_file():
        print(json.dumps({"error": f"audio missing: {src}"}), file=sys.stderr)
        return 1
    try:
        import onnxruntime  # noqa: F401
    except ImportError:
        print(
            json.dumps(
                {
                    "error": "onnxruntime missing — install basic-pitch==0.4.0 --no-deps and onnxruntime"
                }
            ),
            file=sys.stderr,
        )
        return 1
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import Model, predict_and_save

    model_path = Path(ICASSP_2022_MODEL_PATH)
    if model_path.suffix != ".onnx":
        print(
            json.dumps({"error": f"default model is not ONNX: {model_path}"}),
            file=sys.stderr,
        )
        return 1
    import importlib.util

    out_dir = dest.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    predict_and_save(
        [str(src)],
        str(out_dir),
        True,
        True,
        False,
        True,
        Model(model_path),
    )
    produced = out_dir / f"{src.stem}_basic_pitch.mid"
    if not produced.is_file():
        print(json.dumps({"error": "BasicPitch did not write MIDI"}), file=sys.stderr)
        return 1
    dest.write_bytes(produced.read_bytes())
    print(
        json.dumps(
            {
                "midiPath": str(dest),
                "model": str(model_path),
                "backend": "onnx",
                "tensorflowInstalled": importlib.util.find_spec("tensorflow") is not None,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
