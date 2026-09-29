# Essai interne : BasicPitch, audio → MIDI par piste

Issue : [#169](https://github.com/azerothl/song-maker/issues/169).  
Artefacts : [`docs/basicpitch-trial/`](.) sur `main`.  
**Essai interne uniquement** — aucun bouton produit. Décision d’intégration : Loïc (#170 ensuite).

## Méthode

| Élément | Détail |
|---|---|
| Paquet | `basic-pitch==0.4.0` (Apache-2.0) |
| Backend | **ONNX** (`nmp.onnx` embarqué) + `onnxruntime==1.30.0` |
| TensorFlow | **Non installé** pour cet essai |
| Données d’entraînement | **Non vérifiées** ici (licence / provenance des corpus Spotify non auditées dans Song Maker). |
| Sources | Stems `website/public/examples/real-generation-6/{vocals,bass,piano,drums}.mp3` (~20 s) ; complément piano : fixture synthétique + `piano-roll-sketch.wav` |
| Script | [`scripts/basicpitch-trial/`](../../scripts/basicpitch-trial/README.md) |
| Preuves | MIDI, extraits A/B MP3, spectrogrammes, JSON mesurés dans ce dossier |

Sur Linux + Python ≥ 3.11, `pip install basic-pitch` tire TensorFlow par défaut. Ici : `pip install basic-pitch==0.4.0 --no-deps` puis dépendances + `onnxruntime` (voir `requirements.txt`). Le modèle par défaut devient alors `…/nmp.onnx` (`MODEL_TYPES.ONNX`).

**Écoute matérielle** : non réalisée (pas de sortie audio sur l’environnement d’essai). Les sections « avis d’écoute » ci-dessous s’appuient uniquement sur les mixes A/B MP3, les spectrogrammes et les compteurs MIDI — **pas sur une audition directe des fichiers**.

## Mesuré (faits / compteurs)

Pas de métrique de qualité de transcription (pas de F1, pas de ground truth pour les stems réel-génération). Chiffres ci-dessous uniquement.

### Runtime

- Transcription des 4 stems ~20 s : **0,18–0,34 s** chacune (CPU, ONNX).
- TensorFlow absent ; ONNX Runtime chargé ; modèle `.onnx`.
- **Conclusion mesurée** : intégration possible **sans TensorFlow**, via ONNX (testé ici ; le README Spotify le cite, c’était non testé avant).

### Compteurs MIDI (`metrics.json`)

| Piste | Notes | Tessiture MIDI | Fin MIDI (s) |
|---|---:|---|---:|
| vocals | 44 | 49–89 | 19,73 |
| bass | 86 | 22–54 | 19,86 |
| piano (stem site) | 81 | 27–77 | 19,86 |
| drums | 4 | 39–44 | 12,81 |
| piano_synthetic (fixture) | 16 | 60–79 | 6,83 |
| piano_sketch (démo site) | 15 | 60–67 | 4,96 |

### Fixture piano (seul cas avec hauteurs attendues)

Fixture synthétique : hauteurs prévues `{60,62,64,65,67,69,72,76,79}`.  
**Mesuré** : toutes présentes dans le MIDI ; **aucune hauteur hors ensemble**. Ce n’est pas une mesure de timing ni une métrique produit.

### Stem piano du site (marketing)

`real-generation-6/piano.mp3` : **RMS ≈ 7,9×10⁻⁵** (quasi silence). **Ne pas utiliser ce stem pour juger BasicPitch sur le piano** : les 81 notes MIDI sont des détections sur bruit de fond. Jugement piano basé sur la **fixture synthétique** et **`piano-roll-sketch`** uniquement.

### Import Partition / piano roll (`midi-import-score-engine.json`)

Tous les `.mid` s’ouvrent via `importMidiToScoreDocument` (`@song-maker/score-engine`) :

- `source: "midi"`, notes présentes sur une voix `melody`.
- Avertissements fréquents `midi_overlapping_notes` (notes superposées) — attendu avec BasicPitch polyphonique / pitch bends.
- Pas d’exception à l’import.
- L’UI Partition (`ScorePanel` → import MIDI → `PianoRoll`) consomme le même chemin : **oui, le MIDI s’ouvre dans Partition / piano roll**.

Clippy : **N/A** (aucun fichier Rust modifié).

## Avis d’écoute (**non écouté** — dérivé A/B MP3 + spectrogrammes)

Avis qualitatif **sans audition directe** : comparaison des mixes A/B et des spectrogrammes. **Ne pas lire comme un score.**

### Voix (`vocals`)

Le contour mélodique et les plages actives semblent retrouvés dans le MIDI sonifié (spectrogramme + A/B). Le sonify est une mélodie « clavier » simplifiée. Utile comme brouillon de ligne mélodique à éditer, pas comme remplacement de la piste vocale.

Fichiers : [`excerpts/ab/vocals-ab-original-then-midi.mp3`](excerpts/ab/vocals-ab-original-then-midi.mp3), [`spectrograms/vocals-ab-spectrogram.png`](spectrograms/vocals-ab-spectrogram.png).

### Basse (`bass`)

Le rythme et le registre grave semblent suivis sur spectrogramme ; quelques attaques / notes fantômes possibles. Correct comme piste MIDI basse à corriger à la main (avis non écouté).

Fichiers : [`excerpts/ab/bass-ab-original-then-midi.mp3`](excerpts/ab/bass-ab-original-then-midi.mp3), [`spectrograms/bass-ab-spectrogram.png`](spectrograms/bass-ab-spectrogram.png).

### Piano

- **Stem site** : original quasi muet ; le MIDI sonifié invente une phrase — **non significatif** ([`spectrograms/piano_stem-ab-spectrogram.png`](spectrograms/piano_stem-ab-spectrogram.png)).
- **Fixture synthétique** : enchaînement et accords cohérents sur spectrogramme ; bon candidat pour un usage Partition (avis non écouté).
- **`piano-roll-sketch`** : mélodie claire sur spectrogramme / A/B (avis non écouté).

Fichiers : [`midi/piano_synthetic.mid`](midi/piano_synthetic.mid), [`midi/piano_sketch.mid`](midi/piano_sketch.mid), A/B sous `excerpts/ab/`.

### Batterie (`drums`)

BasicPitch est un modèle de notes **pitchées**. Sur 20 s de batterie réelle : **4 notes** seulement, toutes après ~9 s. Même sur la fenêtre 8–16 s, le sonify rate presque toute la grille (cymbales / snares absents). **Avis (non écouté) : inutilisable pour une piste batterie** dans Song Maker ; un outil dédié drums (hors ADTOF NC) serait requis si on veut du MIDI batterie.

Fichiers : [`midi/drums.mid`](midi/drums.mid), [`excerpts/ab/drums-ab-original-then-midi.mp3`](excerpts/ab/drums-ab-original-then-midi.mp3), [`spectrograms/drums-ab-spectrogram.png`](spectrograms/drums-ab-spectrogram.png).

## Intégration — synthèse pour Loïc

| Question | Réponse d’essai |
|---|---|
| Sans TensorFlow ? | **Oui**, via ONNX + `onnxruntime` (testé). Sur Py≥3.11 Linux, il faut `--no-deps` pour éviter le pull TF. |
| MIDI ouvre dans Partition / piano roll ? | **Oui** (`importMidiToScoreDocument` OK sur tous les fichiers d’essai). |
| Qualité par piste | Non mesurée. Avis (non écouté) : utile pour voix / basse / piano (sources pitchées, hors stem piano site) ; **pas** pour batterie. |
| Recommandation produit | Décision Loïc. Si go : chemin opt-in type SheetSage2, script/runtime local, pas de bouton tant que #170 n’est pas tranché. **Stem piano du site marketing quasi silencieux** — à corriger avant toute démo publique. |

## Contenu du dossier

```
docs/basicpitch-trial/
  REPORT.md                 ← ce compte rendu
  metrics.json              ← compteurs runtime / notes
  midi-import-score-engine.json
  note-details.json
  ab-compare-stats.json     ← RMS / chroma (corrélats, pas scores qualité)
  midi/*.mid
  excerpts/ab/*-ab-*.mp3    ← extraits A/B (WAV redondants retirés du dépôt)
  excerpts/piano-synthetic-fixture.wav
  spectrograms/*-ab-spectrogram.png
```
