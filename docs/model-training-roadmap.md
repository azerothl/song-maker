# Entraînement modèle maison : au-delà de YuE2 (texte/audio -> audio + partition, inpainting, multi-pistes)

## Décision

Song Maker vise à terme son propre modèle de transformation/génération audio, complémentaire à YuE2, pour travailler les pistes de projets existants (cf. README § Direction produit). YuE2/audio.cpp épinglé **ne prend pas d'audio en entrée** (`audio_input` non supporté) : pas d'inpainting ni de référence audio directe. Ce document décrit le process à mettre en place pour entraîner un modèle qui comble ce manque.

Objectif : **texte OU audio en entrée -> audio + partition éditable en sortie**, avec **inpainting** (régénérer un segment), **variantes** (resampling contrôlé), et **apprentissage piste-par-instrument** (vocals/drums/bass/other).

Non-objectifs immédiats : clonage de voix (hors périmètre, cf. `lora-training-pilot.md`), parité DAW complète.

## 1. Architecture cible (hybride LM + Flow, consensus 2025-2026)

Ne pas faire un AR pur type YuE1. Faire :

```text
Texte / Lyrics / Style ─┐
Audio ref (mix, stems,   ├─> Encodeurs -> LM hiérarchique -> plan symbolique ABC/MIDI
humming, drums) ─────────┘         |
                                   v
                    Tokens codec RVQ 8 streams + Lyrics + Caption
                                   |
                                   v
                    DiT Flow-Matching non-causal full-song (FullDiT-like)
                    + conditions denses frame-aligned + masquage inpainting
                                   |
                                   v
                    VAE 1D ~21.5-25 Hz -> Audio 44.1/48 kHz stéréo
                                   |
                                   + Décodeur partition (SheetSage-like) -> ABC / MIDI multi-pistes
```

Composants :

| Bloc | Choix recommandé | Réf |
|---|---|---|
| Tokenizer sémantique | MERT2 + RVQ 8x25Hz, BEST-RQ pretrain | YuE2 / FullDiT `2608.08787` |
| LM hiérarchique | Global ~8B (stream 1) + Local ~0.4B (streams résiduels) | FullDiT |
| Renderer | DiT flow-matching non-causal full-song, 4-way CFG (codec, lyrics, caption) | FullDiT `2608.08787` |
| Robustesse interface codec | EMDC : corruption matched aux erreurs top-1 teacher-forced + KNN cosinus | FullDiT § EMDC (+0.77 ViSQOL) |
| VAE | 1D 44 kHz -> 21.5 Hz latent | SegTune / Stable Audio |
| Partitionneur | MERT2-FS + LoRA + décodeur AR 6 couches -> beats/sections/key/chords/melody ABC 2..N voix | SheetSage2 (YuE2) |
| Contrôle structurel | Prompts globaux + prompts par segments broadcastés + prédicteur durée Qwen3-4B format LRC | SegTune (ACL 2026) |

État actuel dans l'app : parcours SheetSage2 audio->ABC->YuE2 déjà câblé (`docs/sheetsage2-path.md`), LoRA NAR pilote local (`docs/lora-training-pilot.md`). Ces deux briques servent de bootstrap data + fine-tune avant le modèle full.

## 2. Entrées texte + audio (à implémenter)

1. **Conditionnement joint symbolique + audio + texte** avec Flow Matching + bottleneck d'information + temporal blurring pour contrôles locaux (chords, melody, drum-track, full-mix). Réf : **Jasco `2406.10970`** — base du contrôle temporel fin.
2. **Adapters KV-Cache audio composables** : backbone diffusion gelé + 3 templates (Control, Prosody, Reference), 5 contrôles (beats, vocals, accompagnement, prosody, ref-audio). VAE partagée, cache calculé une fois. Réf : **DiffSynth-Music `2609.12774`** — idéal pour ajouter l'audio sans tout réentraîner.
3. **Instruction-tuning PEFT** (+8% params, 5k steps) avec module audio fusion (LLaMA-Adapter) + text fusion (LoRA) pour add/remove/separate stems. Réf : **Instruct-MusicGen (2024)** — preuve que le PEFT audio suffit pour démarrer.
4. **Édition conversationnelle** : MLLM -> concept tokens + features frame-aligned injectées dans backbone gelé (91M trainables / 1.9B gelés). FAD /4-5x sur addition/suppression out-of-domain. Réf : **AURA `2609.14344`** — pour les variantes itératives dans Song Maker.

## 3. Inpainting et variantes

Deux paradigmes, à combiner :

**a) Inpainting par masquage (zones temporelles) :**
- Adapteur hétérogène PEFT qui transforme un LM AR (MusicGen) en mask-filling, inpainting >8s + contrôles frame-level (drums, chords, piano cover rendu en audio). Réf : **AIRGen `2402.09508`**.
- Baseline historique gaps <2s : **VampNet (2023)**.
- Limite : bornes manuelles, pas de changement global (ex. voice conversion).

**b) Édition reconstructive sans masque (recommandé) :**
- Pré-entraînement reconstructif : `audio = f(lyrics, phonèmes word-level, vocal MIDI, chords, speaker embedding, beat, encoding acoustique résiduel)`. En édition : modifier UN attribut, garder les autres fixes -> déterministe, sans tuning de bruit, sans données pairées. Supporte lyrics, melody, beats, singer ID. + phoneme alignment word-level et representation alignment sur latents VAE. Réf : **SongCraft `2609.16315`** — papier central à implémenter.
- Transfert timbre inference-only (injection bruit ciblée channels + clamping early-step). Réf : **Diffusion Timbre Transfer `2601.01294`** — pour variantes rapides.
- Inversion flow : **ACE-Step + FlowEdit** — sensible aux hyperparams, en repli uniquement.

Recette : entraînement reconstructif style SongCraft + 10-20% du temps masquage aléatoire pour inpainting arbitraire. Inférence variantes = même plan symbolique + seed/température/guidance différents ; inpainting = masque latent + conditions denses inchangées hors zone.

## 4. Sortie audio + partition

1. **SheetSage2 (YuE2)** : audio -> lead sheet ABC éditable (beats, sections, key, chords, melody **2..N voix**). Déjà intégré opt-in CC BY-NC dans l'app (`docs/sheetsage2-path.md`, sélecteur N voix). YuE2 ne consomme que Vocal/Ins.
2. **Modèle unifié multitâche Image<->Audio<->MIDI<->MusicXML** avec tokenization VQ unifiée, 1300h paires YouTube. OMR SER 24.58%->13.67%, première génération audio depuis image de partition. Prouve le bénéfice multitâche. Réf : **Unified Cross-modal `2505.12863`**.
3. **Chant -> score time-aligné** : note = quadruplet `<onset><pitch><offset><note_value>`, Transformer + masking + pseudo-labels note-values via beat-tracker. F1 0.61 SOTA chant. Réf : **T3MS `2502.12438`** — à adapter voix + instru.
4. **Désentrelacement content/style, alignement score-perf avec repeats, LM note-level comme prior** : **Joint EPR/APT `2509.23878`**, **RUMAA (2025)**, **Singing MIDI Transcription with LMs (APSIPA 2025)**.
5. **Scalabilité symbolique depuis audio seul** : 1M audios annotés via MIR (beat, chords, sections, multi-track) + prompt bars + génération contrainte par FSM. Réf : **SymPAC `2409.03055`** — solution au manque de données symboliques.

Pipeline partition dans l'app : `Audio généré -> beat tracking + séparation -> vocal MIDI (T3MS-like) + chords + sections -> quantize -> ABC/MusicXML -> ScoreDocument / piano roll` (packages `score-engine`, `sheetsage` existants).

## 5. Apprentissage piste-par-instrument

Oui, faisable. Commencer par 4 stems standard MoisesDB : `vocals/drums/bass/other` (HTDemucs déjà dans l'app, 6-stems expérimental + BS-RoFormer opt-in).

| Approche | Description | Réf |
|---|---|---|
| Tokens découplés par stem | 1 stream RVQ par stem + 1 mix, LM local parallèle, rendu joint DiT. Inpainting/mute/solo natifs | YuE track-decoupled ; MusicGen-Stem ; Instruct-MusicGen (Slakh2100) |
| Prompt bars multi-pistes | REMI multi-track : prompt bars (genre, section, tempo, chords, tracks) + song bars par piste, FSM en inférence | SymPAC |
| Reconstruction par stems | Conditions denses par piste (vocal MIDI, drum pattern, bass MIDI, chords, speaker emb. par piste), swap une piste | SongCraft étendu |

Data : `mix -> Demucs/UVR -> stems -> MIR par stem -> tokens multi-pistes alignés`. Entraîner d'abord mix+vocal (comme YuE), puis fine-tune multi-stems sur Slakh2100 synth + séparations maison.

## 6. Plan d'entraînement par étapes

1. **Data (Stage 0)** : 1M audios -> annotation auto MIR : Whisper timestamps mots, phonemizer, chords, beats, sections, vocal MIDI, speaker embedding. Stocker triplets `(audio, latents VAE, score ABC)`. Split **par morceau** (pas de leak, cf. `lora-training`).
2. **Stage A — VAE + tokenizer** : VAE 1D + MERT2 25Hz BEST-RQ.
3. **Stage B — Partitionneur** : fine-tune SheetSage2-like pour audio->ABC. Sert à auto-annoter la suite.
4. **Stage C — LM planificateur** : lyrics+style+audio-ref -> ABC -> codec (global + local).
5. **Stage D — Renderer FullDiT** : flow-matching full-song + EMDC + 4-way CFG + conditions SongCraft + masquage inpainting.
6. **Stage E — Adapters audio** : KV-cache DiffSynth + PEFT Instruct pour stems/inpainting sans casser le backbone.
7. **Éval** : WildSongBench/SongBench (musicalité, MuLan, Q3O, PER), FAD, CLAP, SDR stems, F-align notes ±50ms, F-on/F-off-vel.

Infra : entraînement GPU complet hors app (torch + recette officielle) ; pilote local existant `scripts/lora-train-nar.py` ne fait que LoRA NAR unfused + validation, `autoActivate: false` toujours. Jobs sous `training-jobs/<id>/`.

## 7. Références à lire en priorité

- YuE `2503.08638` ; YuE2 `m-a-p/YuE2-3B` + démo `map-yue2.github.io` — baseline à battre.
- FullDiT `2608.08787` — EMDC + full-context + 4-CFG.
- SongCraft `2609.16315` — reconstructif génération+édition.
- Jasco `2406.10970` — joint audio/symbolique.
- DiffSynth-Music `2609.12774` — KV-cache audio.
- AIRGen `2402.09508` ; Instruct-MusicGen (2024) ; AURA `2609.14344` ; SegTune (ACL 2026).
- Unified Cross-modal `2505.12863` ; T3MS `2502.12438` ; Joint EPR/APT `2509.23878` ; SymPAC `2409.03055`.
- Datasets : Slakh2100, MoisesDB, Maestro, ASAP/(n)ASAP, ST500, DISCO-10M, Million Song Dataset.

## 8. Règles d'honnêteté (rappel app)

- Aucun ABC fictif depuis silence ; aucun appel génération tant que partition non confirmée (`assertAbcConfirmedForYue2`).
- Adaptateur LoRA inactif jusqu'à validation + écoute A/B.
- Poids YuE2/SheetSage2 : CC BY-NC 4.0 — usage commercial restreint, opt-in hors installeur.
- Clonage de voix hors périmètre.
