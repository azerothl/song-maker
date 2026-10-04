# Song Maker

Application **desktop locale** (Tauri 2) pour générer, séparer, éditer et mixer un morceau avec **YuE2** via [audio.cpp](https://github.com/0xShug0/audio.cpp) (GGUF) et HTDemucs. Un projet = un morceau. Contrat produit : [`specs/SONG_MAKER_SPEC.md`](specs/SONG_MAKER_SPEC.md) (le spec décrit aussi l’historique des phases ; ce README décrit **ce qui est livré aujourd’hui** sur `main`). Licence du code : [Apache-2.0](LICENSE) — voir aussi [`NOTICE`](NOTICE).

Site marketing bilingue FR/EN : dossier [`website/`](website/) — landing, docs MDX, téléchargements. L’app desktop est **FR/EN** (Paramètres → Système).

## Direction produit à long terme

Song Maker vise à devenir un atelier de MAO multipiste assisté par l’IA générative, dans la famille d’usage d’un logiciel comme Cubase, sans viser la parité fonctionnelle. Deux parcours doivent converger vers le même projet de production :

- **Simple :** décrire un style et écrire des paroles pour générer une chanson, puis éditer, mixer et exporter le résultat.
- **Avancé :** partir d’une partition, de pistes audio ou de stems, puis utiliser l’IA pour créer des parties instrumentales complémentaires et aider au mix. Depuis Production, une **partie instrumentale** peut être générée dans l’arrangement (conditionnement tempo/tonalité/style). Le mix/stems en entrée audio est refusé clairement : YuE2 n’a pas `audio_input`.

À long terme, Song Maker prévoit aussi de créer son propre modèle de transformation audio, complémentaire à YuE2, pour travailler les pistes des projets existants. Les résultats de l’IA doivent rester éditables et réversibles, et les sources du projet être préservées. Cette direction n’est pas une liste de fonctions déjà livrées : le YuE2 actuel ne prend pas d’audio de référence en entrée. L’état des fonctionnalités disponibles est détaillé ci-dessous.

## Installer l’application

Téléchargez la dernière version depuis les [Releases GitHub](https://github.com/azerothl/song-maker/releases/latest) (actuelle : **v0.1.1**) :

- **Windows** : installeur `.msi` ou `.exe`, Windows x64 avec carte **NVIDIA** (CUDA). L’installeur embarque le runtime CUDA (`cudart`) à côté du serveur audio.cpp pour que le moteur soit détecté.
- **macOS** : `.dmg` Apple Silicon ou Intel (Metal). Chemin de génération moins prioritaire que CUDA Windows/Linux.
- **Linux** : `.AppImage` ou `.deb`, Linux x64 avec carte **NVIDIA**.

Au **premier lancement**, un écran d’assistant dédié vérifie GPU / composants, propose le modèle Q4 ou Q8, demande l’acceptation de la licence YuE2 **CC BY-NC 4.0**, puis télécharge les poids depuis l’application (reprise possible après interruption). Prévoyez plusieurs gigaoctets d’espace disque.

Song Maker propose aussi les mises à jour au démarrage (depuis la version **0.1.1**). Les versions antérieures doivent d’abord être mises à jour manuellement depuis les Releases. Détails : [`docs/auto-updates.md`](docs/auto-updates.md).

Les installeurs Windows déjà publiés ne sont pas signés Authenticode. Pour les prochaines releases, le workflow exige la configuration Microsoft Artifact Signing et bloque le build Windows si elle manque ; voir le [guide de signature Windows](docs/windows-code-signing.md). SmartScreen peut encore afficher un avertissement sur les premières versions signées. Sur macOS, le binaire n’est pas notarié : autoriser l’app dans Réglages Système → Confidentialité et sécurité au premier lancement.

## Ce qui est livré aujourd’hui

Parcours principal : **Bibliothèque** (liste des projets) → ouvrir un morceau → onglets **Créer → Partition → Production → Versions**. Barre latérale repliable (**Ctrl+B** / ⌘+B), état mémorisé ; repli automatique sur fenêtre étroite.

### Créer — génération YuE2

- Disposition en **deux colonnes** sur large viewport (style / paroles à gauche, options et lancement à droite).
- Style + paroles → WAV stéréo 48 kHz via le serveur local `audiocpp_server` (file FIFO, `max_loaded_models=1`).
- **Mode instrumental** : paroles facultatives (chaîne vide acceptée) — ce n’est **pas** le LoRA instrumental YuE2 CC BY-NC.
- Modes `cot` (`full` / `melody` / `off`), durée cible indicative (bornes de tokens, pas une durée musicale garantie), multi-candidats **séquentiels** (N appels locaux successifs, pas un échantillonnage parallèle natif), seed écrit.
- Continuation mid-song (`semantic_prefix` / `continuationGenerationId`) et génération partition seule (`stop_after=abc`).
- YuE2 **ne consomme pas** d’audio en entrée (`audio_input`) : pas d’inpainting ni de référence audio directe. Une génération = un nouvel appel. L’onglet Créer l’affiche explicitement ; un payload `audio_input` / masque d’inpainting est **refusé** avant l’appel GPU.

### Partition / Reprise

- Import MIDI, piano roll, validation et export ABC dialecte YuE2 (`@song-maker/score-engine`).
- Aperçu portée ABC synchronisé à la lecture ; métadonnées tempo/tonalité alignées.
- Instrument MIDI intégré (préécoute + enregistrement Web MIDI) : softsynth Web Audio (oscillateurs), **SF2 utilisateur optionnelle** (pas de banque GM bundlée) — voir [`docs/midi-instrument.md`](docs/midi-instrument.md).
- **SheetSage2** (opt-in, hors installeur premier build) : audio → ABC → confirmation → nouvelle génération YuE2. Poids ~2,7 Go CC BY-NC. Voir [`docs/sheetsage2-path.md`](docs/sheetsage2-path.md).

### Production — stems, mix, outils

- **Mix densifié** : hauteur de ligne **Auto / Compact / Confortable** ; groupes **Voix / Rythmique / Harmonie** repliables ; **M/S** par piste et par groupe ; potards gain/pan ; **couleur unique par stem** (pastille = forme d’onde).
- **Séparation** : dialogue de recommandation selon le type de piste (voix / batterie / mix) avec mention « Recommandation non mesurée », temps (`exemple, non mesuré` puis `mesuré`, chargement inclus) et avertissement si la licence du modèle n’est pas vérifiée. Modèles : **HTDemucs** 4 stems par défaut (voix, batterie, basse, other) ; HTDemucs 6 stems ONNX (guitare/piano **expérimentaux**, fuites possibles surtout sur le piano) ; **BS-RoFormer** opt-in (voix + instrumental) ; **Mel-Band RoFormer « Kim Vocal »** opt-in (voix). Badge licence + case « J’ai lu la licence » avant tout téléchargement de modèle. Relancer une séparation conserve l’historique des versions de stems.
- Mix : gain, pan, mute/solo, master ; groupes / aux / sends ; presets d’intention et équilibre auto des stems.
- **Assistant de mix** : Ollama, OpenAI-compat, sidecar **Rbitnet** (binaire + GGUF **hors installeur**, téléchargement différé), llama.cpp / serveur externe via `/v1`. Cloud expert opt-in. Foundry Local / WinML **non livrés**. Voir [`docs/design/qwen-mix-assistant/README.md`](docs/design/qwen-mix-assistant/README.md).
- Effets DSP réels (`@song-maker/mix-production`) : filtre HP/LP, EQ (shelf + paramétrique), compresseur / gate / limiteur, delay sync tempo, réverb stéréo, sidechain, correction de justesse vocale, nettoyage spectral, débruitage statistique MMSE, conversion de voix par enveloppe (voix de l’utilisateur + consentement, **pas** un modèle RVC), loudness (estimation).
- Clips : trim, fondus, déplacement, découpe ; grille musicale / arrangement ; étirement tempo / transpose (WSOLA maison) ; capture micro/ligne native (cpal : WASAPI partagé / ALSA / Core Audio) avec repli WebView — [`docs/capture-low-latency.md`](docs/capture-low-latency.md).
- Copilote de production réversible (suggestions locales, pas d’analyse distante obligatoire).
- **Export unifié** : mix WAV PCM 24 bits, FLAC 24 bits, MP3 livraison (profondeur de bits ou débit selon le format) ; export de pistes / stems sélectionnés (dossier ou zip) et paquet projet portable.

### Versions & collaboration opt-in

- Historique lisible des **prises** (noms, dates, pastilles Musique / Partition / Mix, filiation en mots) — les identifiants `gen-*` restent dans Détails. Comparateur multi-candidats, restauration réversible, événements de séparation (« Revenir à la séparation précédente »).
- Invariants de partition avant régénération (`@song-maker/partition-invariants`).
- **Worker GPU distant** : client + serveur de référence HTTP, **désactivé par défaut** (local-first, consentement + rétention). Voir [`docs/remote-worker-contract.md`](docs/remote-worker-contract.md).
- **Akasha / DeclUI** : découverte HTTP réelle (`GET /v1/host/discover`) si opt-in + hôte joignable ; sinon clairement `unavailable` — pas de faux mode connecté, pas d’hôte DeclUI embarqué.
- Synchro projet optionnelle (NAS/USB ou HTTP auto-hébergé) — jamais obligatoire. Voir [`docs/project-sync-contract.md`](docs/project-sync-contract.md).
- Packs LoRA style (opt-in) et **pilote** d’entraînement NAR local — voir [`docs/lora-training-pilot.md`](docs/lora-training-pilot.md).

### Site marketing

Package Next.js bilingue **FR / EN** (`website/`) : landing, docs MDX, exemples. Lancer : `pnpm --filter website dev` → [http://localhost:3000/fr](http://localhost:3000/fr). Détails : [`website/README.md`](website/README.md). Positionnement produit pour le site : [`website/PRODUCT.md`](website/PRODUCT.md).

## Limites assumées

| Sujet | État |
|---|---|
| Génération avec audio en entrée (`audio_input`) | Non supporté par YuE2 / audio.cpp épinglé |
| Plugins **VST3** / AU | Différés (étude : [`docs/vst3-host-feasibility.md`](docs/vst3-host-feasibility.md)) — FX natifs uniquement |
| **UniverSR** / upscaling audio | Hors périmètre |
| Runtime Python YuE2 officiel | **Volontairement absent** : non installé, **pas un repli**. Le desktop ne bascule jamais vers Python si audio.cpp échoue. |
| Modèle maison (texte/audio → audio + partition) | **Indisponible** : `houseModelRuntime: unavailable`, radio désactivée. Recette hors app : [`scripts/model-training/`](scripts/model-training/README.md). Ce n’est **pas** une génération dans l’app. |
| SheetSage2 / BS-RoFormer / Mel-Band RoFormer / LoRA packs | Opt-in, hors installeur minimal |
| HTDemucs 6 stems (guitare/piano) | Opt-in expérimental ; **déconseillé piano-heavy** ; masque de fuite post-séparation, piano non nettoyé — [`docs/htdemucs-6s-leaks.md`](docs/htdemucs-6s-leaks.md) |
| Transcription audio → MIDI produit | Audio → MIDI par piste (BasicPitch ONNX Apache-2.0, sans TensorFlow) depuis les réglages de piste → Partition ; batterie inutilisable (essai interne : [`docs/basicpitch-trial/`](docs/basicpitch-trial/REPORT.md)) |
| Sortie MIDI matériel (midir) | Compilée WinMM / CoreMIDI / ALSA. Preuve native : **Windows GS Wavetable seulement**. macOS IAC, Linux jack/USB, Windows USB : **non testés** — [`docs/midi-instrument.md`](docs/midi-instrument.md) |
| Worker distant / Akasha | Opt-in ; sans hôte = indisponible, pas un stub trompeur |
| Entraînement LoRA NAR | Pilote CPU — LoRA YuE2 GPU : `scripts/lora-train-yue2-gpu.py` (CUDA) |
| Capture basse latence | Natif cpal (WASAPI **partagé** / ALSA / Core Audio). Pas d’ASIO ni WASAPI exclusif. Repli WebView. |
| Licences modèles | YuE2 & SheetSage2 : **CC BY-NC 4.0** — usage commercial des poids restreint |
| Signature Windows / notarisation macOS | Workflow Windows configuré, signature réelle à valider avec Azure ; macOS non notarié |
| UI app bilingue | FR/EN dans Paramètres → Système (persistance locale) ; le site marketing a sa propre i18n |

## Stack

- Tauri 2 + React + TypeScript + Vite ; UI FR/EN (`src/ui/fr.json`, `src/ui/en.*.json`)
- Serveur local `audiocpp_server` (audio.cpp **v0.8.2** épinglé)
- Monorepo `packages/*` + app `src/` / `src-tauri/`
- Code applicatif sous [Apache-2.0](LICENSE) ; notices tierces dans [`NOTICE`](NOTICE)

## Développement

```bash
pnpm install
pnpm run packages:build
pnpm run tauri dev
```

Prérequis : Rust stable, dépendances Tauri de la plateforme, **ffmpeg avec libsoxr**, NVIDIA CUDA pour la génération réelle (Windows/Linux).

Windows (ffmpeg) :

```bat
winget install Gyan.FFmpeg
```

Puis redémarrer le terminal / Song Maker. Surcharge : `SONG_MAKER_FFMPEG` = chemin vers `ffmpeg.exe`.

```bash
pnpm run packages:test
pnpm run packages:typecheck
pnpm test
```

### Scripts phase 0 (binaires / poids, sans app)

Linux / macOS / Git Bash :

```bash
cd scripts/phase0
./download-binaries.sh --linux   # ou --windows / --all
./download-models.sh --q4        # Q8 si VRAM ≥ 12 Go
./verify-hashes.sh
./health-check.sh
```

Windows (PowerShell / cmd) — [Git for Windows](https://git-scm.com/download/win) :

```bat
cd scripts\phase0
./download-binaries.cmd --windows
./download-models.cmd --q4
./verify-hashes.cmd
./health-check.cmd
```

Load test CUDA (GPU NVIDIA requis) : `./load-test-cuda.sh` (Windows : `.cmd`). Sans `nvidia-smi`, code de sortie 2 — pas un succès CUDA. Voir [`scripts/phase0/README.md`](scripts/phase0/README.md).

## Paquets monorepo (`packages/`)

| Paquet | Rôle (état actuel) |
|---|---|
| [`@song-maker/score-engine`](packages/score-engine) | ScoreDocument, MIDI, ABC YuE2, clips, candidats, `stop_after` / `semantic_prefix` — branché UI |
| [`@song-maker/sheetsage`](packages/sheetsage) | SheetSage2 readiness + transcription (runner Tauri live) — opt-in |
| [`@song-maker/stem-providers`](packages/stem-providers) | HTDemucs / 6-stems / BS-RoFormer / Mel-Band RoFormer, reco + licences |
| [`@song-maker/mix-production`](packages/mix-production) | Automation, FX, buses, bake offline, stems alignés — DSP réel |
| [`@song-maker/lora-packs`](packages/lora-packs) | Registre LoRA + catalogue styles, porte CC BY-NC — opt-in |
| [`@song-maker/lora-training`](packages/lora-training) | Pilote entraînement NAR local |
| [`@song-maker/partition-invariants`](packages/partition-invariants) | Invariants §11.3 avant régénération |
| [`@song-maker/project-sync`](packages/project-sync) | Synchro opt-in FS / HTTP |
| [`@song-maker/remote-worker`](packages/remote-worker) | Client worker GPU distant (local-first) |
| [`@song-maker/remote-worker-server`](packages/remote-worker-server) | Worker GPU de référence (contrat HTTP) |
| [`@song-maker/akasha-declui`](packages/akasha-declui) | Découverte hôte Akasha (réelle ou `unavailable`) — opt-in |
