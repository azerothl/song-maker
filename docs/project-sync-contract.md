# Optional project sync — contract

**Status:** types + UI opt-in stub. **Cloud backend is not shipped.**  
Local-first always works. Sync is never mandatory (spec forbids mandatory cloud sync).

Package: `@song-maker/project-sync`.

## Principles

1. **Per-project opt-in** — default off; library/settings toggle.
2. **Local-complete** — all workflows work offline without sync.
3. **No silent overwrite** of score / mix / generation artifacts on conflict.
4. **Secrets excluded** — tokens, remote-worker credentials, cache keys never sync.
5. **Encryption at rest in transit** — same class as remote worker (AES-GCM) when a backend exists.

## Synced artifacts (when transport exists)

| Path / doc | Include |
|---|---|
| `project.json` | yes |
| `scores/score-v*.json` | yes |
| `generations/gen-*/{request,result,job}.json` | yes |
| `generations/gen-*/score.abc` | yes |
| `generations/gen-*/audio.wav` | yes (large; optional bandwidth gate) |
| `generations/gen-*/semantic.json` | yes |
| `separations/sep-*/*` | yes |
| `mixes/*.json` | yes |
| checksums | yes |
| Settings / tokens / LoRA cache | **no** |

## Envelope

```json
{
  "schema": "song-maker.project-sync",
  "schemaVersion": 1,
  "projectId": "…",
  "deviceId": "…",
  "pushedAt": "ISO-8601",
  "tombstone": false,
  "artifacts": [
    {
      "relativePath": "project.json",
      "contentSha256": "…",
      "byteLength": 0,
      "encryption": "aes-256-gcm"
    }
  ]
}
```

## Conflict rules

- Never silent overwrite of `score.abc`, mix docs, or `gen-*` result/audio.
- On conflict: surface both sides; user chooses keep-local / keep-remote / fork.
- Tombstones for delete sync; soft-delete retention TBD by backend.

## Transport (stub)

`ProjectSyncTransport` methods return `not_implemented` until a sync service exists.

Suggested future endpoints (not implemented):

| Method | Path |
|---|---|
| `PUT` | `/v1/projects/{id}/sync` |
| `GET` | `/v1/projects/{id}/sync` |
| `DELETE` | `/v1/projects/{id}/sync` |

## UI status values

- `never_synced` (default)
- `pending` / `syncing` / `synced` / `error` / `not_implemented`

## Honesty

Do not claim multi-device sync works. Copy must state the cloud backend is absent.
