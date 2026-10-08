# Remote GPU worker — HTTP contract

**Status:** client + **reference worker** (`packages/remote-worker-server`) ship in this repository.  
The desktop refuses silent local fallback when a remote submit fails.

Opt-out (`remoteEnabled=false`) → **zero** remote HTTP calls.

## Auth

- `Authorization: Bearer <token>`
- Token from Settings or `SONG_MAKER_REMOTE_WORKER_TOKEN`
- No IdP in-repo; reference worker uses timing-safe bearer compare

## TLS

Production endpoints must be `https://`. The client rejects non-TLS when `requireTls` is true.  
`http://127.0.0.1` / `http://localhost` are allowed for local reference deployments.

## Browser access

The reference worker answers `OPTIONS` preflight requests for `/v1/*`, permits
the client's `Authorization` and `Content-Type` headers, and exposes
`X-Content-SHA256` so the desktop can verify downloaded artifacts. It allows
all origins by default; deployments may restrict this with
`SONG_MAKER_REMOTE_WORKER_CORS_ORIGINS` (comma-separated exact origins). CORS
does not replace bearer-token authentication, and cookie credentials are not
enabled.

## Endpoints

Base URL example: `https://worker.example.com`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health` | Liveness / readiness for Settings probe |
| `POST` | `/v1/jobs` | Submit encrypted job |
| `GET` | `/v1/jobs/{id}` | Poll status / result cipher ref |
| `POST` | `/v1/jobs/{id}/cancel` | Cancel queued/running job |
| `GET` | `/v1/jobs/{id}/artifacts/{name}` | Download `audio.wav`, `score.abc`, or `result.json` |

### `GET /v1/health`

**200** JSON (any body). Non-200 → probe failed. May be unauthenticated for load balancers.

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
  "ciphertextBase64": "<AES-GCM ciphertext incl. auth tag>",
  "ivBase64": "<12-byte IV>"
}
```

AES key is **HKDF-SHA-256** derived from the shared bearer token (`salt=song-maker-remote-v1`, `info=payload-aes-256-gcm`). The client never sends the raw AES key.

`kind`: `yue2_generate` | `htdemucs_separate`

Response **202/200**:

```json
{
  "id": "job-…",
  "status": "queued"
}
```

Errors: JSON `{ "id"?, "status": "failed"|…, "error": "…" }` with non-2xx.

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
  "error": null,
  "artifacts": ["audio.wav", "score.abc", "result.json"]
}
```

### `GET /v1/jobs/{id}/artifacts/{name}`

Binary body. Header `X-Content-SHA256` must match the downloaded bytes.  
Corrupt on-disk bytes → **500** `artifact_corrupt` (client must not treat as success).

### Retention (product promise)

- Max retention **24 h** (server purge)
- Delete ciphertext / artifacts after successful `audio.wav` download when advertised
- Nothing sent without explicit consent + retention acknowledgement
- Max payload size enforced server-side (`SONG_MAKER_REMOTE_WORKER_MAX_BYTES`)

## Client package

`@song-maker/remote-worker` — `FetchRemoteHttpTransport`, `buildProjectPayload` (SHA-256 + AES-GCM via Web Crypto), `runRemoteGenerationToProject` (app helper).

## Reference worker

`@song-maker/remote-worker-server` — see [`docs/remote-worker/`](./remote-worker/).

- `AUDIOCPP_URL` → real YuE2 on the worker GPU via audiocpp_server  
- else `simulate` mode (contract / CI)

## Honesty

Until a worker implementing this contract is reachable, Settings probe and SongScreen remote submit **fail with a clear error**. Local generation remains the default path when remote is disabled. Remote failure never auto-starts local generation.
