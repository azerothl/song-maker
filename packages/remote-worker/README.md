# `@song-maker/remote-worker`

Phase **4** — client worker GPU distant ([spec §18.2](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

- **Local-first par défaut** : `localFirst: true`, `remoteEnabled: false`.
- Rien envoyé sans **consentement explicite** + accusé de réception de la rétention.
- Auth utilisable : jeton dans Paramètres ou `SONG_MAKER_REMOTE_WORKER_TOKEN`.
- TLS requis (`https://`) ; payload référencé comme `EncryptedBlobRef`.
- Ce n’est **pas** la réponse au manque de VRAM du premier build (Q4 / message CUDA restent).

## Rétention (message produit)

`DEFAULT_RETENTION_POLICY.messageFr` : chiffrement en transit, max 24 h, suppression après téléchargement, local reste le défaut.

## Branchement

```ts
const client = createRemoteGpuWorkerClient({
  localFirst: true,
  remoteEnabled: prefs.remoteEnabled,
  accessToken: prefs.accessToken,
});
```

Le client actuel file en mémoire (pas de socket) pour exercer le chemin UI. Remplacer le transport plus tard sans changer `RemoteGpuWorkerClient`.

## Tests

```bash
pnpm --filter @song-maker/remote-worker test
```
