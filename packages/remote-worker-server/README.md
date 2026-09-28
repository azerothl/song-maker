# `@song-maker/remote-worker-server`

Reference **remote GPU worker** implementing [`docs/remote-worker-contract.md`](../../docs/remote-worker-contract.md) (#65).

## Run

```bash
export SONG_MAKER_REMOTE_WORKER_TOKEN=dev-token
pnpm --filter @song-maker/remote-worker-server build
pnpm --filter @song-maker/remote-worker-server start
```

Docs: [`docs/remote-worker/deploy.md`](../../docs/remote-worker/deploy.md), [`diagnostics.md`](../../docs/remote-worker/diagnostics.md).

## Tests

```bash
pnpm --filter @song-maker/remote-worker-server test
```
