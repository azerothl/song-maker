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
server, then keep `audio-original.wav` and remove the estimated vocals using
HTDemucs. Only drums, bass and other stems enter the published mix. The
original and all four stems remain in the job directory until retention
cleanup; only the final accompaniment is offered as `audio.wav`. Separation
can leave vocal residue, which still requires listening validation (#377).

This path requires FFmpeg with libsoxr (`SONG_MAKER_FFMPEG` or PATH), the
`htdemucs` model registered in audio.cpp, and a data directory readable at
the **same absolute path** by the worker and audio.cpp. Use co-located
processes on the GPU machine, or a shared mount with matching paths. Missing
dependencies or missing/ambiguous stems fail the job and retain the original;
there is no fallback that publishes the unprocessed file. Cancellation is
checked between processing stages; it does not interrupt an already running
audio.cpp separation call. Result metadata records the original hash and
included/excluded roles. It does not certify the administrator's model hash.

The simulated WAV is only a contract-test fixture and bypasses
the musical duration check; it is not a real generation validation.

## Tests

```bash
pnpm --filter @song-maker/remote-worker-server test
```
