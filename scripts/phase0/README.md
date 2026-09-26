# Phase 0 — validation technique Song Maker

Scripts pour télécharger, vérifier et tester le binaire audio.cpp **v0.8.1** et les poids GGUF épinglés. Aucune génération audio n’est lancée ici.

## Épingles (source de vérité)

Fichier : [`pins.json`](./pins.json)

| Artefact | SHA-256 |
|---|---|
| `audio-v0.8.1-bin-windows-x64-cuda12.4.zip` | `28bbe8ac…` |
| `audio-v0.8.1-cudart-windows-x64-cuda12.4.zip` | `025faacf…` |
| `audio-v0.8.1-bin-ubuntu-x64-cuda12.8-colab.tar.gz` | `f9698117…` |
| `yue2-3b-q8_0.gguf` | `f3a9e3b1…` |
| `yue2-3b-q4_0.gguf` | `97af67d7…` |
| `yue2-vae-f16.gguf` | `d4f4a05d…` |
| `htdemucs-q8_0.gguf` | `b0f532ac…` |

Cache par défaut : `$HOME/.cache/song-maker` (surcharge : `SONG_MAKER_CACHE`).

## Scripts (pas de GPU requis pour télécharger / vérifier)

```bash
cd scripts/phase0
chmod +x *.sh

# Archives de la plateforme courante
./download-binaries.sh
# ou toutes / Linux seulement / Windows
./download-binaries.sh --all
./download-binaries.sh --linux

# Modèles (Q8 par défaut ; --q4 si VRAM < 12 Go)
./download-models.sh
./download-models.sh --q4

# Vérifier les hashes des fichiers présents
./verify-hashes.sh

# Santé : GPU, VRAM, disque, hashes, GET /health si serveur déjà up
./health-check.sh
```

`health-check.sh` et `load-test-cuda.sh` **refusent de déclarer un succès CUDA** si `nvidia-smi` est absent.

## Load test Ubuntu `cuda12.8-colab` (GPU NVIDIA requis)

L’archive Linux CUDA épinglée s’appelle `audio-v0.8.1-bin-ubuntu-x64-cuda12.8-colab.tar.gz`. Le mot `colab` est un fait upstream. Le contrat : la lancer sur un **Ubuntu desktop**, `--backend cuda`, et charger `yue2`. Si ça échoue hors Colab, **Linux CUDA n’est pas livré** sur Vulkan/CPU.

### Prérequis machine

1. Ubuntu x86_64
2. Driver NVIDIA **≥ 570.26** (CUDA 12.8)
3. VRAM ≥ 8 Go (Q4) ; ≥ 12 Go pour présélection Q8
4. ~8 Go libres pour Q4+VAE+HTDemucs, davantage pour Q8

### Procédure

```bash
cd scripts/phase0
./download-binaries.sh --linux
./download-models.sh --q4          # ou sans --q4 si VRAM ≥ 12 Go
./load-test-cuda.sh
```

Le script :

1. vérifie `nvidia-smi` ;
2. vérifie le hash de l’archive ;
3. extrait `audiocpp_server` ;
4. écrit une config avec `max_loaded_models=1`, `lazy_load=true`, port `8765` ;
5. démarre le serveur `--backend cuda` ;
6. attend `GET /health` ;
7. tente un chargement `yue2` (sans génération).

Journal : `$SONG_MAKER_CACHE/binaries/v0.8.1/load-test-cuda.log`.

### Interpréter le résultat

| Code | Signification |
|---|---|
| 0 | `/health` + chargement `yue2` OK |
| 2 | Pas de GPU NVIDIA — **ne pas cocher Phase 0 CUDA** |
| 1 | Archive/modèle manquant, serveur crash, ou erreur CUDA dans le journal |
| 3 | `/health` OK mais `load_model` non confirmé — inspecter le journal |

Sur une machine **sans** GPU (ex. agent cloud), `./load-test-cuda.sh` se termine en code 2 avec le message explicite. C’est le comportement attendu.

## Config serveur de référence

```json
{
  "host": "127.0.0.1",
  "port": 8765,
  "backend": "cuda",
  "device": 0,
  "lazy_load": true,
  "max_loaded_models": 1,
  "idle_unload_ms": 0,
  "busy_timeout_ms": 300000,
  "models": [
    {
      "id": "yue2",
      "family": "yue2",
      "path": "<cache>/models/Yue2-3B-GGUF",
      "task": "gen",
      "mode": "offline",
      "busy_timeout_ms": 1800000
    },
    {
      "id": "htdemucs",
      "family": "htdemucs",
      "path": "<cache>/models/htdemucs/htdemucs-q8_0.gguf",
      "task": "sep",
      "mode": "offline",
      "busy_timeout_ms": 600000
    }
  ]
}
```

Song Maker place une file FIFO devant ce serveur et n’envoie jamais deux HTTP à la fois.
