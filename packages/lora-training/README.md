# `@song-maker/lora-training`

Pilot contract for **local NAR LoRA training** from user-owned recordings.

- Validates corpus (formats, durations, duplicates).
- Splits train/val by **whole song**, never by segment of the same song.
- Writes job folders under `training-jobs/<id>/` with a reproducible manifest.
- Trainer is an honest stub (`not_implemented`) unless a local trainer script exists.
- **Never** auto-activates adapters; validation gate required before catalog exposure.

See `docs/lora-training-pilot.md`.
