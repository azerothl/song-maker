# `@song-maker/sheetsage`

Contract for **SheetSage2** audio → ABC transcription, then user-confirmed YuE2 regeneration.

- Checks deps / weights / license / disk / acceleration before offering install or run.
- `transcribeAudioToAbc` returns `not_implemented` until a real binary + GGUF are present.
- Never invents ABC from silence. YuE2 must not be called before the user confirms the score.

See `docs/sheetsage2-path.md`.
