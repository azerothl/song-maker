# `@song-maker/lora-training`

Local NAR LoRA training pilot (style/timbre, not voice cloning).

- Corpus validation + whole-song train/val split.
- Job folders under `training-jobs/<id>/` via injectable store (disk via Tauri host).
- Trainer: `scripts/lora-train-nar.py` (detected by host → `trainerExists: true`).
- Never auto-activates adapters (`validateAdapterForCatalog`).

See `docs/lora-training-pilot.md`.
