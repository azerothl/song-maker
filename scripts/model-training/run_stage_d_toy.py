#!/usr/bin/env python3
"""Stage D toy (FullDiT / SongCraft reconstructive + inpainting mask).

Entry documented in docs/model-training-roadmap.md and scripts/model-training/README.md.

  python scripts/model-training/run_stage_d_toy.py --out-dir <dir>
  python scripts/model-training/run_stage_d_toy.py --self-test

Honest limits:
  - CPU, stdlib only, tiny tensors (not a DiT, not EMDC, not a codec VAE).
  - Writes checkpoint.json + metrics.json so the recipe is executable, not a paragraph.
  - Does not register a desktop generation provider (desktopProvider remains null).
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_CONFIG = ROOT / "configs" / "songcraft-toy.json"
DEFAULT_PINS = ROOT / "pins.json"


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def vec(n: int, rng: random.Random) -> list[float]:
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


def add_scaled(a: list[float], b: list[float], scale: float) -> None:
    for i, v in enumerate(b):
        a[i] += v * scale


def mse(a: list[float], b: list[float], mask: list[bool] | None = None) -> float:
    total = 0.0
    count = 0
    for i, (x, y) in enumerate(zip(a, b)):
        if mask is not None and not mask[i]:
            continue
        d = x - y
        total += d * d
        count += 1
    return total / max(count, 1)


def make_example(cfg: dict, rng: random.Random) -> dict:
    dim = int(cfg["dim"])
    frames = int(cfg["frames"])
    lyrics = rng.randint(0, 7)
    chord = rng.randint(0, 11)
    beat = rng.randint(0, 3)
    residual = vec(dim * frames, rng)
    # Synthetic "latent": condition embeddings + residual (SongCraft-style reconstruct).
    target = []
    for f in range(frames):
        phase = math.sin((f + beat) * 0.35 + lyrics * 0.1)
        for d in range(dim):
            idx = f * dim + d
            target.append(
                0.25 * ((lyrics - 3) / 4.0)
                + 0.2 * math.sin(chord + d)
                + 0.15 * phase
                + 0.4 * residual[idx]
            )
    return {
        "lyrics_token": lyrics,
        "chord_token": chord,
        "beat_token": beat,
        "residual": residual,
        "target": target,
    }


class ToyRenderer:
    """Linear reconstructive renderer: target ≈ W·conditions + residual."""

    def __init__(self, dim: int, frames: int, rng: random.Random) -> None:
        self.dim = dim
        self.frames = frames
        self.size = dim * frames
        self.w_lyrics = vec(self.size, rng)
        self.w_chord = vec(self.size, rng)
        self.w_beat = vec(self.size, rng)
        self.w_residual = 0.5 + rng.random() * 0.1
        self.bias = vec(self.size, rng)

    def forward(self, ex: dict) -> list[float]:
        out = list(self.bias)
        scale_l = (ex["lyrics_token"] - 3) / 4.0
        scale_c = math.sin(ex["chord_token"])
        scale_b = (ex["beat_token"] - 1.5) / 2.0
        add_scaled(out, self.w_lyrics, scale_l)
        add_scaled(out, self.w_chord, scale_c)
        add_scaled(out, self.w_beat, scale_b)
        add_scaled(out, ex["residual"], self.w_residual)
        return out

    def step(self, ex: dict, pred: list[float], mask: list[bool], lr: float) -> None:
        # Gradient of masked MSE vs target; update even unmasked so reconstruction stays global,
        # but masked frames get full loss (inpainting) and unmasked get 0.25 (preserve).
        err = []
        for i, (p, t) in enumerate(zip(pred, ex["target"])):
            w = 1.0 if mask[i] else 0.25
            err.append(w * (p - t))
        n = max(len(err), 1)
        scale_l = (ex["lyrics_token"] - 3) / 4.0
        scale_c = math.sin(ex["chord_token"])
        scale_b = (ex["beat_token"] - 1.5) / 2.0
        g_res = sum(e * r for e, r in zip(err, ex["residual"])) / n
        for i, e in enumerate(err):
            g = (2.0 * e) / n
            self.w_lyrics[i] -= lr * g * scale_l
            self.w_chord[i] -= lr * g * scale_c
            self.w_beat[i] -= lr * g * scale_b
            self.bias[i] -= lr * g
        self.w_residual -= lr * 2.0 * g_res

    def state_dict(self) -> dict:
        return {
            "w_lyrics": self.w_lyrics,
            "w_chord": self.w_chord,
            "w_beat": self.w_beat,
            "w_residual": self.w_residual,
            "bias": self.bias,
            "dim": self.dim,
            "frames": self.frames,
        }


def frame_mask(size: int, frames: int, dim: int, ratio: float, rng: random.Random) -> list[bool]:
    n_frames = max(1, int(round(frames * ratio)))
    chosen = set(rng.sample(range(frames), n_frames))
    mask = []
    for f in range(frames):
        on = f in chosen
        mask.extend([on] * dim)
    assert len(mask) == size
    return mask


def eval_batch(
    model: ToyRenderer, examples: list[dict], cfg: dict, rng: random.Random
) -> tuple[float, float, float]:
    recon = 0.0
    masked = 0.0
    unmasked = 0.0
    for ex in examples:
        ratio = rng.uniform(float(cfg["maskRatioMin"]), float(cfg["maskRatioMax"]))
        mask = frame_mask(model.size, model.frames, model.dim, ratio, rng)
        pred = model.forward(ex)
        inv = [not m for m in mask]
        recon += mse(pred, ex["target"])
        masked += mse(pred, ex["target"], mask)
        unmasked += mse(pred, ex["target"], inv)
    n = max(len(examples), 1)
    return recon / n, masked / n, unmasked / n


def train(cfg: dict, out_dir: Path) -> dict:
    rng = random.Random(int(cfg["seed"]))
    model = ToyRenderer(int(cfg["dim"]), int(cfg["frames"]), rng)
    steps = int(cfg["steps"])
    batch = int(cfg["batch"])
    lr = float(cfg["lr"])
    dataset = [make_example(cfg, rng) for _ in range(max(32, batch * 8))]
    history: list[dict] = []
    for step in range(1, steps + 1):
        start = ((step - 1) * batch) % len(dataset)
        mini = [dataset[(start + i) % len(dataset)] for i in range(batch)]
        for ex in mini:
            ratio = rng.uniform(float(cfg["maskRatioMin"]), float(cfg["maskRatioMax"]))
            mask = frame_mask(model.size, model.frames, model.dim, ratio, rng)
            pred = model.forward(ex)
            model.step(ex, pred, mask, lr)
        recon, masked, unmasked = eval_batch(
            model, dataset, cfg, random.Random(int(cfg["seed"]) + 99)
        )
        row = {
            "step": step,
            "recon_mse": recon,
            "masked_mse": masked,
            "unmasked_mse": unmasked,
        }
        history.append(row)
    out_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = {
        "schema": "songmaker.model-training.checkpoint",
        "schemaVersion": 1,
        "stage": "D",
        "kind": "toy-linear-renderer",
        "notADesktopWeight": True,
        "config": cfg,
        "state": model.state_dict(),
        "final": history[-1],
    }
    (out_dir / "checkpoint.json").write_text(
        json.dumps(checkpoint, indent=2) + "\n", encoding="utf-8"
    )
    metrics = {
        "status": "completed",
        "stage": "D",
        "desktopProvider": None,
        "history": history,
        "final": history[-1],
        "noteFr": (
            "Checkpoint jouet uniquement. Aucun fournisseur desktop n’est enregistré. "
            "Entraînement FullDiT réel = GPU hors app (voir docs/model-training-roadmap.md)."
        ),
    }
    (out_dir / "metrics.json").write_text(
        json.dumps(metrics, indent=2) + "\n", encoding="utf-8"
    )
    return metrics


def self_test() -> int:
    import tempfile

    cfg = load_json(DEFAULT_CONFIG)
    with tempfile.TemporaryDirectory(prefix="songmaker-stage-d-") as tmp:
        metrics = train(cfg, Path(tmp))
        ckpt = Path(tmp) / "checkpoint.json"
        met = Path(tmp) / "metrics.json"
        if not ckpt.is_file() or not met.is_file():
            print("FAIL: checkpoint ou metrics manquant", file=sys.stderr)
            return 1
        payload = json.loads(ckpt.read_text(encoding="utf-8"))
        if payload.get("notADesktopWeight") is not True:
            print("FAIL: le checkpoint doit refuser le branchement desktop", file=sys.stderr)
            return 1
        first = metrics["history"][0]["recon_mse"]
        last = metrics["final"]["recon_mse"]
        if not (last < first):
            print(f"FAIL: recon_mse n’a pas baissé ({first} -> {last})", file=sys.stderr)
            return 1
        print(f"OK stage D toy: recon_mse {first:.4f} -> {last:.4f}")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Song Maker Stage D toy trainer")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--pins", default=str(DEFAULT_PINS))
    parser.add_argument("--out-dir", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    cfg = load_json(Path(args.config))
    pins = load_json(Path(args.pins))
    if pins.get("desktopProvider") is not None:
        print("Pins: desktopProvider doit rester null tant qu’il n’y a pas de poids.", file=sys.stderr)
        return 2
    out = Path(args.out_dir) if args.out_dir else Path("training-jobs") / "stage-d-toy"
    metrics = train(cfg, out)
    print(json.dumps({"outDir": str(out), "final": metrics["final"]}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
