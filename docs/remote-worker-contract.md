# Remote GPU worker — HTTP contract

**Status:** client implemented; **no worker server ships in this repository**.  
The desktop refuses silent local fallback when a remote submit fails.

Opt-out (`remoteEnabled=false`) → **zero** remote HTTP calls.

## Auth

- `Authorization: Bearer <token>`
- Token from Settings or `SONG_MAKER_REMOTE_WORKER_TOKEN`
- No IdP in-repo

## TLS

Production endpoints must be `https://`. The client rejects non-TLS when `requireTls` is true.

## Endpoints

Base URL example: `https://worker.example.com`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health` | Liveness / readiness for Settings probe |
| `POST` | `/v1/jobs` | Submit encrypted job |
| `GET` | `/v1/jobs/{id}` | Poll status / result cipher ref |
| `POST` | `/v1/jobs/{id}/cancel` | Cancel queued/running job |

### `GET /v1/health`

**200** JSON (any body). Non-200 → probe failed.

### `POST /v1/jobs`

Request:

```json
{
  "kind": "yue2_generate",
  "consent": {
    "userConsented": true,
    "consentedAt": "2026-09-27T00:00:00.000Z",
    "scope": "generation",
    "retentionAcknowledged": true
  },
  "payload": {
    "cipherPath": "memory://aes-gcm/…",
    "contentSha256": "<64 hex of plaintext>",
    "encryption": "aes-256-gcm",
    "byteLength": 1234
  },
  "ciphertextBase64": "<optional AES-GCM ciphertext>"
}
```

`kind`: `yue2_generate` | `htdemucs_separate`

Response **202/200**:

```json
{
  "id": "job-…",
  "status": "queued"
}
```

Errors: JSON `{ "id"?, "status": "failed", "error": "…" }` with non-2xx.

### `GET /v1/jobs/{id}`

```json
{
  "id": "job-…",
  "status": "queued|running|succeeded|failed",
  "resultCipher": {
    "cipherPath": "…",
    "contentSha256": "…",
    "encryption": "aes-256-gcm"
  },
  "error": null
}
```

### Retention (product promise)

- Max retention **24 h**
- Delete ciphertext after successful download when advertised
- Nothing sent without explicit consent + retention acknowledgement

## Client package

`@song-maker/remote-worker` — `FetchRemoteHttpTransport`, `buildProjectPayload` (SHA-256 + AES-GCM via Web Crypto when available).

## Honesty

Until a worker implementing this contract is deployed, Settings probe and SongScreen remote submit will **fail with a clear error**. Local generation remains the default path when remote is disabled.
