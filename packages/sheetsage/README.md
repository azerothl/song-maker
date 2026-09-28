# `@song-maker/sheetsage`

SheetSage2 audio → ABC → (user confirm) → YuE2.

- `checkSheetsageReadiness` gates license / binary / weights / disk.
- `createSheetsageTranscriber(probe, runner?)` — inject a `LiveSheetsageRunner` (Tauri host) for real `--task midi --family sheetsage2` transcription.
- Without a runner, returns `not_implemented` and **never invents ABC**.
- `assertAbcConfirmedForYue2` before any generation call.

See `docs/sheetsage2-path.md`.
