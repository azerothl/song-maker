# Optional project sync — contract

**Status:** filesystem + self-hosted HTTP transports shipped. Hosted cloud SaaS is **not** promised.  
Local-first always works. Sync is never mandatory.

Package: `@song-maker/project-sync`.

## Principles

1. **Per-project opt-in** — default off; library/settings toggle.
2. **Local-complete** — all workflows work offline without sync.
3. **No silent overwrite** of score / mix / generation artifacts on conflict (keep-local / keep-remote / fork).
4. **Secrets excluded** — tokens, remote-worker credentials, cache keys, settings never sync.
5. **Encryption** — AES-256-GCM at rest for filesystem blobs and in transit for HTTP payloads.

## First usable targets

| Target | How |
|---|---|
| Filesystem / NAS / USB | Default root `Documents/Song Maker/sync` (editable). Encrypted `.enc` + meta. |
| Self-hosted HTTP | `python scripts/project-sync-server.py --port 8787` then set endpoint `http://127.0.0.1:8787`. |

## Synced artifacts

| Path / doc | Include |
|---|---|
| `project.json` | yes |
| `scores/score-v*.json` | yes |
| `generations/gen-*/…` | yes |
| `separations/sep-*/*` | yes |
| `mixes/*.json` | yes |
| Large audio | yes with bandwidth gate (~80 MiB default skip) |
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

## HTTP endpoints

| Method | Path |
|---|---|
| `PUT` | `/v1/projects/{id}/sync` |
| `GET` | `/v1/projects/{id}/sync` |
| `DELETE` | `/v1/projects/{id}/sync` |

## Conflict rules

- Never silent overwrite of `score.abc`, mix docs, or `gen-*` result/audio.
- On conflict: keep-local / keep-remote / fork (under `forks/<ts>/`).
- Tombstones for delete sync.

## UI status values

- `never_synced` (default)
- `pending` / `syncing` / `synced` / `error` / `conflict` / `not_implemented`

## Honesty

Do not claim a hosted multi-tenant cloud. Document self-host deploy, retention (operator-controlled data dir), and opt-out (no network when disabled).
