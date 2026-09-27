# `@song-maker/project-sync`

Optional **per-project** sync — local-first. Cloud backend **not shipped**.

Contract: [`docs/project-sync-contract.md`](../../docs/project-sync-contract.md).

## API

```ts
import { createProjectSyncClient, createEmptyEnvelope } from "@song-maker/project-sync";

const client = createProjectSyncClient();
client.setPreferences(projectId, { syncEnabled: true });
await client.push(projectId, createEmptyEnvelope(projectId));
// → { status: "not_implemented", error: "…" }
```

## UI

`ProjectSyncPanel` — toggle + status (`never_synced`). Wire in Settings/library; SongScreen stays local-complete either way.

## Tests

```bash
pnpm --filter @song-maker/project-sync test
```
