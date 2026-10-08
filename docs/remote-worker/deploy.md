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

### Instrumental sans piste voix

Sur la machine worker, installez aussi FFmpeg avec libsoxr et enregistrez le
modèle `htdemucs` dans audio.cpp. Le worker et audio.cpp doivent pouvoir lire
le dossier de données au même chemin absolu (processus sur la même machine,
ou volume partagé identique). `SONG_MAKER_FFMPEG` permet de préciser le chemin
de FFmpeg si celui-ci n’est pas dans PATH.

Le worker conserve l’original et les quatre pistes séparées, puis publie le
mix batterie + basse + autres, après contrôle de durée. Il ne publie pas
l’original si cette étape échoue. La séparation peut laisser des résidus de
voix ; l’écoute reste nécessaire. Les fichiers conservés suivent la même
politique de rétention que le job. L’application refuse les résultats du mode
simulate : ce mode permet uniquement de tester le protocole.

## TLS / auth / rétention

- Prod : `https://` uniquement côté client (`requireTls`)  
- Auth : compare timing-safe du Bearer  
- Consentement + retentionAck exigés à la soumission  
- Purge périodique + suppression après téléchargement de `audio.wav`

## Parcours client

SongScreen (opt-in) → consentement → `runRemoteGenerationToProject` → poll → artefacts → `import_remote_generation` (checksum + provenance).  
Échec distant → **pas** de `start_generation` local automatique.
