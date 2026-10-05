# `@song-maker/remote-worker-server`

Reference **remote GPU worker** implementing [`docs/remote-worker-contract.md`](../../docs/remote-worker-contract.md) (#65).

## Run

```bash
export SONG_MAKER_REMOTE_WORKER_TOKEN=dev-token
pnpm --filter @song-maker/remote-worker-server build
pnpm --filter @song-maker/remote-worker-server start
```

Docs: [`docs/remote-worker/deploy.md`](../../docs/remote-worker/deploy.md), [`diagnostics.md`](../../docs/remote-worker/diagnostics.md).

## Duration and instrumental requests

Real YuE2 requests use the desktop semantic budget: 25 frames per second,
with equal minimum and maximum for fixed-duration or instrumental requests.
The returned WAV is measured before publication (250 ms tolerance). An output
outside this tolerance fails the job; `audio-unpublished.wav` remains in the
job directory until retention cleanup, and is not offered for download.
Lyrics-first sung requests retain duration headroom. Result metadata reports
the actual sample rate, channel count and duration.

Instrumental requests discard both request and artifact lyric drafts on the
server. This worker does **not** yet remove generated vocals with HTDemucs;
empty lyrics do not guarantee the absence of singing. That remains part of
issue #377. The simulated WAV is only a contract-test fixture and bypasses
the musical duration check; it is not a real generation validation.

## Tests

```bash
pnpm --filter @song-maker/remote-worker-server test
```
