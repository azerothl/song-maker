# `@song-maker/remote-worker`

Phase **4** — client worker GPU distant ([spec §18.2](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

L’app desktop pourra parler à un worker GPU plus tard :

- fichiers chiffrés en transit (`EncryptedBlobRef`) ;
- rien envoyé sans consentement (`ConsentRecord`) ;
- auth placeholder (`bearer_placeholder`) — pas d’IdP branché.

Ce n’est **pas** la réponse au manque de VRAM du premier build (pack Q4 / message CUDA restent).

## Branchement après phase 1–2

1. Phase 1–2 restent 100 % locales (`audiocpp_server` 127.0.0.1).
2. Phase 4 injecte `createRemoteGpuWorkerClient()` derrière un réglage opt-in.
3. Remplacer le stub par un transport réel (TLS + chiffrement) sans changer l’interface `RemoteGpuWorkerClient`.

## Tests

```bash
pnpm --filter @song-maker/remote-worker test
```
