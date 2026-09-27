# `@song-maker/remote-worker`

Phase **4** — client worker GPU distant ([spec §18.2](../../specs/SONG_MAKER_SPEC.md)).

Contrat HTTP : [`docs/remote-worker-contract.md`](../../docs/remote-worker-contract.md).

## Rôle

- **Local-first par défaut** : `localFirst: true`, `remoteEnabled: false` → **zéro** appel réseau.
- Rien envoyé sans **consentement explicite** + accusé de réception de la rétention (`RemoteGenerateConfirm`).
- Auth : jeton Paramètres ou `SONG_MAKER_REMOTE_WORKER_TOKEN` (pas d’IdP).
- TLS `https://` ; payload via `buildProjectPayload` (SHA-256 + AES-GCM Web Crypto quand dispo).
- Transport HTTP réel (`FetchRemoteHttpTransport`) contre le contrat — **échec explicite** si pas de worker ; pas de repli local silencieux.
- Ce n’est **pas** la réponse au manque de VRAM (Q4 / message CUDA restent).

## Branchement SongScreen

1. Si `remoteEnabled` : construire le payload, afficher `RemoteGenerateConfirm`, puis `submitRemoteGeneration`.
2. Sinon : `api.startGeneration` local uniquement.
3. Ne jamais enchaîner local après un échec distant sans action utilisateur.

## Tests

```bash
pnpm --filter @song-maker/remote-worker test
```
