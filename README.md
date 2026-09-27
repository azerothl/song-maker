# Song Maker

Application desktop locale pour générer, séparer et mixer un morceau avec **audio.cpp** (YuE2 GGUF) + HTDemucs. Contrat : `specs/SONG_MAKER_SPEC.md` v1.0.

## Stack

- Tauri 2 + React + TypeScript + Vite
- UI française (`src/ui/fr.json`)
- Serveur local `audiocpp_server` (`max_loaded_models=1`, file FIFO côté app)

## Phase 0 (scripts, pas de GPU requis pour télécharger)

Linux / macOS / Git Bash :

```bash
cd scripts/phase0
./download-binaries.sh --linux   # ou --windows / --all
./download-models.sh --q4        # Q8 si VRAM ≥ 12 Go
./verify-hashes.sh
./health-check.sh
```

Windows (PowerShell / cmd) — nécessite [Git for Windows](https://git-scm.com/download/win) :

```bat
cd scripts\phase0
./download-binaries.cmd --windows
./download-models.cmd --q4
./verify-hashes.cmd
./health-check.cmd
```

Load test CUDA — **GPU NVIDIA requis** (Windows cuda12.4 ou Linux cuda12.8-colab) :

```bash
./load-test-cuda.sh
# Windows: load-test-cuda.cmd
```

Sans `nvidia-smi`, le script se termine en code 2 et **ne déclare pas** un succès CUDA. Voir [`scripts/phase0/README.md`](scripts/phase0/README.md).

## Phase 1–2 — développement

```bash
pnpm install
pnpm run packages:build
pnpm run tauri dev
```

Prérequis : Rust stable, dépendances Linux Tauri, **ffmpeg avec libsoxr**, NVIDIA CUDA pour la génération réelle.

Windows (ffmpeg) :

```bat
winget install Gyan.FFmpeg
```

Puis redémarrer le terminal / Song Maker. Surcharge éventuelle : variable d’environnement `SONG_MAKER_FFMPEG` = chemin vers `ffmpeg.exe`.

Phase 2 (partition + audio) : import MIDI, piano roll, validation/export ABC YuE2, édition de clips sur le mix, multi-candidats séquentiels, export MP3 (livraison), graphe léger des `gen-*`. Sans partition utilisateur, le chemin phase 1 (style + paroles) reste inchangé. `stop_after=abc` reste gated (`v0.8.1`).

## Paquets monorepo (`packages/`)

| Paquet | Phase | Rôle |
|---|---|---|
| [`@song-maker/score-engine`](packages/score-engine) | 2 | ScoreDocument, MIDI, export ABC YuE2 — **branché dans l’UI** |
| [`@song-maker/stem-providers`](packages/stem-providers) | 3 | `StemSeparatorProvider`, HTDemucs, stub BS-RoFormer |
| [`@song-maker/mix-production`](packages/mix-production) | 3 | Automation / effets / sidechain / loudness (stubs) |
| [`@song-maker/lora-packs`](packages/lora-packs) | 3–4 | Registre LoRA + catalogue styles, porte CC BY-NC |
| [`@song-maker/partition-invariants`](packages/partition-invariants) | 4 | Invariants §11.3 |
| [`@song-maker/remote-worker`](packages/remote-worker) | 4 | Client worker GPU distant |
| [`@song-maker/akasha-declui`](packages/akasha-declui) | 4 | Notes / stub Akasha + DeclUI |

```bash
pnpm install
pnpm run packages:test
pnpm run packages:typecheck
pnpm test
```

## Hors périmètre encore stubbé / gated

`stop_after=abc` (exige audio.cpp ≥ 0.8.2 — drapeau off), `semantic_prefix`, SheetSage2, worker distant, Akasha, effets phase 3.
