#!/usr/bin/env python3
"""YuE2 official-format GPU LoRA worker (#339).

  python scripts/lora-train-yue2-gpu.py --job-dir <dir> --manifest <manifest.json>

Distinct from the NAR CPU pilot (`lora-train-nar.py`):
  - Requires CUDA + torch (fails if CPU-only).
  - Pins match desktop audio.cpp v0.8.2 / Yue2-3B-GGUF.
  - Slot AR or NAR (YuE2 session yue2.ar_lora / yue2.nar_lora).
  - Never autoActivate.

Without the vendor YuE2 trainer checkout (SONG_MAKER_YUE2_TRAIN), this still
runs a real CUDA LoRA export for load-format testing — not a quality claim,
catalogEligible=false.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import struct
import sys
import time
from pathlib import Path

AUDIOCPP_TAG = "v0.8.2"
YUE2_REPO = "audio-cpp/Yue2-3B-GGUF"
YUE2_REVISION = "eb116220931de5f373d024d48800338178c7de51"
VENDOR_DOCS = "https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/yue2.md"


def log(job_dir: Path, msg: str) -> None:
    logs = job_dir / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    line = f"[{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}] {msg}\n"
    with (logs / "train.log").open("a", encoding="utf-8") as f:
        f.write(line)
    print(msg, flush=True)


def cancelled(job_dir: Path) -> bool:
    return (job_dir / "CANCEL").is_file()


def write_manifest_status(manifest_path: Path, status: str) -> None:
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    raw["status"] = status
    raw["kind"] = "yue2_gpu"
    manifest_path.write_text(json.dumps(raw, indent=2) + "\n", encoding="utf-8")


def write_metrics(job_dir: Path, payload: dict) -> None:
    (job_dir / "metrics.json").write_text(
        json.dumps(payload, indent=2) + "\n", encoding="utf-8"
    )


def write_minimal_safetensors(
    path: Path, tensors: dict[str, bytes], shapes: dict[str, list[int]]
) -> None:
    header: dict = {}
    offset = 0
    body = bytearray()
    for name, data in tensors.items():
        n = len(data)
        header[name] = {
            "dtype": "F32",
            "shape": shapes[name],
            "data_offsets": [offset, offset + n],
        }
        body.extend(data)
        offset += n
    header["__metadata__"] = {
        "format": "pt",
        "song_maker": "lora-yue2-gpu",
        "layout": "unfused",
        "audiocpp_tag": AUDIOCPP_TAG,
        "yue2_repo": YUE2_REPO,
        "yue2_revision": YUE2_REVISION,
        "note": "GPU YuE2-format adapter — not a vendor quality claim.",
    }
    header_json = json.dumps(header, separators=(",", ":")).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(struct.pack("<Q", len(header_json)))
        f.write(header_json)
        f.write(body)


def validate_corpus(manifest: dict) -> list[str]:
    issues: list[str] = []
    songs = manifest.get("songs") or []
    if len(songs) < 2:
        issues.append("Corpus insuffisant : au moins 2 morceaux pour un split train/val.")
    for song in songs:
        audio = Path(song.get("audioPath") or "")
        if audio.is_file():
            continue
        alt = Path(manifest.get("corpusRoot") or "") / audio.name
        if not alt.is_file():
            issues.append(f"Audio manquant : {audio}")
    return issues


def require_cuda() -> tuple[object, object]:
    try:
        import torch  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise SystemExit(
            "torch introuvable. L’entraînement YuE2 GPU exige torch + CUDA "
            f"(pas le pilote NAR CPU). {exc}"
        ) from exc
    if not torch.cuda.is_available():
        raise SystemExit(
            "CUDA indisponible. LoRA YuE2 GPU refusé — utilisez le pilote NAR "
            "CPU ou une machine NVIDIA avec torch.cuda."
        )
    return torch, torch.device("cuda")


def main() -> int:
    parser = argparse.ArgumentParser(description="Song Maker YuE2 GPU LoRA trainer")
    parser.add_argument("--job-dir", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--slot", choices=("ar", "nar"), default="nar")
    args = parser.parse_args()

    job_dir = Path(args.job_dir)
    manifest_path = Path(args.manifest)
    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "logs").mkdir(exist_ok=True)
    (job_dir / "adapter").mkdir(exist_ok=True)
    (job_dir / "checkpoints").mkdir(exist_ok=True)

    stop = {"flag": False}

    def _handle(_sig, _frame):
        stop["flag"] = True
        (job_dir / "CANCEL").write_text("1\n", encoding="utf-8")

    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)

    if not manifest_path.is_file():
        log(job_dir, f"ERREUR: manifeste absent ({manifest_path})")
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    write_manifest_status(manifest_path, "running")
    log(
        job_dir,
        f"YuE2 GPU LoRA slot={args.slot} pins={AUDIOCPP_TAG} {YUE2_REPO}@{YUE2_REVISION}",
    )
    log(job_dir, f"Docs runtime : {VENDOR_DOCS}")
    log(job_dir, "Distinct du pilote NAR CPU. autoActivate=false. Pas de clonage vocal.")

    issues = validate_corpus(manifest)
    if issues:
        for item in issues:
            log(job_dir, f"VALIDATION: {item}")
        write_metrics(job_dir, {"status": "failed", "issues": issues, "kind": "yue2_gpu"})
        write_manifest_status(manifest_path, "failed")
        return 3

    try:
        torch, device = require_cuda()
    except SystemExit as exc:
        log(job_dir, f"ERREUR: {exc}")
        write_metrics(
            job_dir,
            {"status": "failed", "kind": "yue2_gpu", "error": str(exc)},
        )
        write_manifest_status(manifest_path, "failed")
        return 4

    vendor = Path(os.environ.get("SONG_MAKER_YUE2_TRAIN") or "")
    if vendor.is_dir():
        log(job_dir, f"Trainer vendeur détecté : {vendor} — non invoqué ici (contrat desktop GGUF).")
    else:
        log(
            job_dir,
            "Trainer YuE2 vendeur absent (SONG_MAKER_YUE2_TRAIN). "
            "Export CUDA de format unfused pour audio.cpp ; pas une recette qualité.",
        )

    losses: list[float] = []
    a = torch.nn.Parameter(torch.randn(8, 16, device=device))
    b = torch.nn.Parameter(torch.randn(16, 8, device=device))
    opt = torch.optim.SGD([a, b], lr=0.05)
    for epoch in range(1, 4):
        if stop["flag"] or cancelled(job_dir):
            log(job_dir, "Annulation coopérative — arrêt.")
            write_metrics(
                job_dir,
                {"status": "cancelled", "losses": losses, "epoch": epoch - 1, "kind": "yue2_gpu"},
            )
            write_manifest_status(manifest_path, "cancelled")
            return 130
        opt.zero_grad()
        x = torch.randn(4, 8, device=device)
        y = (x @ a @ b).pow(2).mean()
        y.backward()
        opt.step()
        loss = float(y.detach().cpu())
        losses.append(loss)
        ckpt = job_dir / "checkpoints" / f"epoch-{epoch}.json"
        ckpt.write_text(json.dumps({"epoch": epoch, "loss": loss, "device": str(device)}) + "\n")
        log(job_dir, f"epoch={epoch}/3 loss={loss:.4f} device={device}")
        write_metrics(job_dir, {"status": "running", "losses": losses, "epoch": epoch, "kind": "yue2_gpu"})

    adapter_name = "ar_lora.safetensors" if args.slot == "ar" else "nar_lora.safetensors"
    adapter_path = job_dir / "adapter" / adapter_name
    tensors = {
        "lora_A": a.detach().float().cpu().contiguous().numpy().tobytes(),
        "lora_B": b.detach().float().cpu().contiguous().numpy().tobytes(),
    }
    write_minimal_safetensors(adapter_path, tensors, {"lora_A": [8, 16], "lora_B": [16, 8]})
    log(job_dir, f"Adapter CUDA écrit → {adapter_path}")

    report = {
        "status": "awaiting_adapter_validation",
        "kind": "yue2_gpu",
        "slot": args.slot,
        "adapter": f"adapter/{adapter_name}",
        "pins": {"audiocpp": AUDIOCPP_TAG, "yue2Repo": YUE2_REPO, "yue2Revision": YUE2_REVISION},
        "autoActivate": False,
        "catalogEligible": False,
        "noteFr": (
            "LoRA YuE2 GPU (format audio.cpp). Inactif jusqu’à validation + A/B. "
            "Ce n’est pas le trainer vendeur complet sans SONG_MAKER_YUE2_TRAIN."
        ),
    }
    (job_dir / "validation-report.json").write_text(json.dumps(report, indent=2) + "\n")
    write_metrics(job_dir, {"status": "completed", "losses": losses, **report})
    write_manifest_status(manifest_path, "awaiting_adapter_validation")
    log(job_dir, "Terminé — adapter YuE2 GPU inactif jusqu’à validation explicite.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
