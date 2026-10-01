# Remote GPU worker — déploiement de référence (#65)

Package : `@song-maker/remote-worker-server`  
Contrat : [`../remote-worker-contract.md`](../remote-worker-contract.md)

## Démarrage rapide (simulate — sans GPU)

```bash
export SONG_MAKER_REMOTE_WORKER_TOKEN='change-me'
pnpm --filter @song-maker/remote-worker-server build
pnpm --filter @song-maker/remote-worker-server start
# → http://127.0.0.1:8787
```

Dans Song Maker → Paramètres → Worker distant :

1. Activer l’opt-in + accuser la rétention  
2. URL `http://127.0.0.1:8787` (TLS assoupli pour localhost)  
3. Même jeton  
4. « Tester le worker »

## GPU réel (YuE2)

Sur la machine worker (NVIDIA + audiocpp_server + modèles YuE2) :

```bash
# démarrer audiocpp_server (CUDA) — noter son URL, ex. http://127.0.0.1:8090
export AUDIOCPP_URL=http://127.0.0.1:8090
export SONG_MAKER_REMOTE_WORKER_TOKEN='…'
unset SONG_MAKER_REMOTE_WORKER_SIMULATE
pnpm --filter @song-maker/remote-worker-server start
```

Placer un reverse-proxy TLS (Caddy / nginx) devant le port worker pour la prod.

## Configuration (env)

| Variable | Défaut | Rôle |
|---|---|---|
| `SONG_MAKER_REMOTE_WORKER_TOKEN` | _(requis)_ | Bearer partagé client ↔ worker |
| `SONG_MAKER_REMOTE_WORKER_HOST` | `127.0.0.1` | Bind |
| `SONG_MAKER_REMOTE_WORKER_PORT` | `8787` | Port |
| `SONG_MAKER_REMOTE_WORKER_DATA` | OS tmp | Artefacts job |
| `SONG_MAKER_REMOTE_WORKER_MAX_BYTES` | 8 MiB | Quota payload |
| `SONG_MAKER_REMOTE_WORKER_RETENTION_HOURS` | 24 | Purge |
| `AUDIOCPP_URL` | — | YuE2 réel |
| `SONG_MAKER_REMOTE_WORKER_SIMULATE` | auto | Forcer simulate |

Les logs n’écrivent **jamais** la valeur du jeton.

## TLS / auth / rétention

- Prod : `https://` uniquement côté client (`requireTls`)  
- Auth : compare timing-safe du Bearer  
- Consentement + retentionAck exigés à la soumission  
- Purge périodique + suppression après téléchargement de `audio.wav`

## Parcours client

SongScreen (opt-in) → consentement → `runRemoteGenerationToProject` → poll → artefacts → `import_remote_generation` (checksum + provenance).  
Échec distant → **pas** de `start_generation` local automatique.
