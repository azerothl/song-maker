# Song Maker

Application desktop locale pour générer, séparer et mixer un morceau avec **audio.cpp** (YuE2 GGUF) + HTDemucs. Contrat : `specs/SONG_MAKER_SPEC.md` v1.0.

## Stack

- Tauri 2 + React + TypeScript + Vite
- UI française (`src/ui/fr.json`)
- Serveur local `audiocpp_server` (`max_loaded_models=1`, file FIFO côté app)

## Phase 0 (scripts, pas de GPU requis pour télécharger)

```bash
cd scripts/phase0
./download-binaries.sh --linux   # ou --windows / --all
./download-models.sh --q4        # Q8 si VRAM ≥ 12 Go
./verify-hashes.sh
./health-check.sh
```

Load test CUDA Ubuntu (`cuda12.8-colab`) — **GPU NVIDIA requis** :

```bash
./load-test-cuda.sh
```

Sans `nvidia-smi`, le script se termine en code 2 et **ne déclare pas** un succès CUDA. Voir [`scripts/phase0/README.md`](scripts/phase0/README.md).

## Phase 1 — développement

```bash
npm install
npm run tauri dev
```

Prérequis : Rust stable, dépendances Linux Tauri, `ffmpeg` avec libsoxr, NVIDIA CUDA pour la génération réelle.

## Hors périmètre de ce build

Piano roll / MIDI / ABC éditable, LoRA, SheetSage2, worker distant, Akasha.
