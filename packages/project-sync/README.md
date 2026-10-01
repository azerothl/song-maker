# `@song-maker/project-sync`

Optional per-project sync — local-first.

```ts
import {
  createProjectSyncClient,
  FilesystemProjectSyncTransport,
  HttpProjectSyncTransport,
} from "@song-maker/project-sync";
```

- **Filesystem / NAS / USB** — `FilesystemProjectSyncTransport` (AES-GCM at rest).
- **Self-hosted HTTP** — `HttpProjectSyncTransport` + `scripts/project-sync-server.py`.
- Opt-out never performs network/FS transfers.
- Secrets / settings / LoRA cache excluded.

See `docs/project-sync-contract.md`.

UI: `ProjectSyncPanel` — Settings intro + Library per-project push/pull/delete.
