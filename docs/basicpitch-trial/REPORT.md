# Essai interne : BasicPitch, audio → MIDI par piste

Issue : [#169](https://github.com/azerothl/song-maker/issues/169).  
Branche d’essai : `cursor/basicpitch-trial-ca11` (après merge #172) ; corrections de compte rendu : `cursor/basicpitch-report-fix-ca11`.  
**Essai interne uniquement** — aucun bouton produit. Décision d’intégration : Loïc (#170 ensuite).

## Licence

- Code / poids BasicPitch (`spotify/basic-pitch`) : **Apache-2.0** (vérifié).
- **Données d’entraînement : non vérifiées.** Aucune source primaire ni date de lecture n’a été établie pour le corpus d’entraînement. Ne pas traiter cet essai comme une validation licence des données.

## Méthode

| Élément | Détail |
|---|---|
| Paquet | `basic-pitch==0.4.0` (Apache-2.0) |
| Backend | **ONNX** (`nmp.onnx` embarqué) + `onnxruntime==1.30.0` |
| TensorFlow | **Non installé** pour cet essai |
| Sources | Stems `website/public/examples/real-generation-6/{vocals,bass,piano,drums}.mp3` (~20 s) ; complément piano : fixture synthétique + `piano-roll-sketch.wav` |
| Script | [`scripts/basicpitch-trial/`](../../scripts/basicpitch-trial/README.md) |
| Preuves | MIDI, mixes A/B (mp3), spectrogrammes, JSON mesurés dans ce dossier |

Sur Linux + Python ≥ 3.11, `pip install basic-pitch` tire TensorFlow par défaut. Ici : `pip install basic-pitch==0.4.0 --no-deps` puis dépendances + `onnxruntime` (voir `requirements.txt`). Le modèle par défaut devient alors `…/nmp.onnx` (`MODEL_TYPES.ONNX`).

L’environnement d’agent n’a **pas de sortie audio matérielle**. Aucune piste n’a été écoutée au casque / haut-parleur. Les avis qualitatifs ci-dessous sont **non écoutés** : ils s’appuient uniquement sur les mixes A/B (fichiers) et les spectrogrammes côte à côte — pas sur une écoute réelle, ni sur un score chiffré de « qualité ».

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

### Stem piano du site — quasi silence (fixture inutilisable)

`real-generation-6/piano.mp3` : **RMS ≈ 7,9×10⁻⁵** (quasi silence). Les 81 notes MIDI sont des détections sur bruit de fond.

**Conséquence** : ce stem **ne permet aucun jugement** sur la qualité piano de BasicPitch. Tout avis piano ci-dessous repose sur la **fixture synthétique** et sur `piano-roll-sketch` — pas sur le stem marketing du site.

### Import Partition / piano roll (`midi-import-score-engine.json`)

Tous les `.mid` s’ouvrent via `importMidiToScoreDocument` (`@song-maker/score-engine`) :

- `source: "midi"`, notes présentes sur une voix `melody`.
- Avertissements fréquents `midi_overlapping_notes` (notes superposées) — attendu avec BasicPitch polyphonique / pitch bends.
- Pas d’exception à l’import.
- L’UI Partition (`ScorePanel` → import MIDI → `PianoRoll`) consomme le même chemin : **oui, le MIDI s’ouvre dans Partition / piano roll**.

Clippy : **N/A** (aucun fichier Rust modifié).

## Avis qualitatif — non écouté (pas mesuré)

**Étiquette : non écouté.** Comparaison visuelle / structurelle des mixes A/B et spectrogrammes uniquement. **Ne pas lire comme un score ni comme un avis d’écoute réelle.**

### Voix (`vocals`) — non écouté

Le contour mélodique et les plages actives se retrouvent dans le MIDI sonifié (spectrogramme / A/B). Le sonify apparaît comme une mélodie « clavier » simplifiée (peu d’harmoniques aigües, vibrato aplati). Utile comme brouillon de ligne mélodique à éditer, pas comme remplacement de la piste vocale.

Fichiers : [`excerpts/ab/vocals-ab-original-then-midi.mp3`](excerpts/ab/vocals-ab-original-then-midi.mp3), [`spectrograms/vocals-ab-spectrogram.png`](spectrograms/vocals-ab-spectrogram.png).

### Basse (`bass`) — non écouté

Le rythme et le registre grave sont globalement suivis sur le spectrogramme / A/B ; le sonify ressemble à une ligne basse MIDI jouable. Quelques attaques / notes fantômes possibles. Correct comme piste MIDI basse à corriger à la main.

Fichiers : [`excerpts/ab/bass-ab-original-then-midi.mp3`](excerpts/ab/bass-ab-original-then-midi.mp3), [`spectrograms/bass-ab-spectrogram.png`](spectrograms/bass-ab-spectrogram.png).

### Piano — non écouté ; jugement sur synthétique / sketch seulement

- **Stem site** : original **quasi muet** (RMS ≈ 7,9×10⁻⁵) ; le MIDI sonifié invente une phrase — **non significatif**, ne pas en tirer de conclusion ([`excerpts/ab/piano-stem-silent-ab.mp3`](excerpts/ab/piano-stem-silent-ab.mp3), [`spectrograms/piano_stem-ab-spectrogram.png`](spectrograms/piano_stem-ab-spectrogram.png)).
- **Fixture synthétique** : enchaînement et accords repris sur spectrogramme / A/B ; bon candidat pour un usage Partition — **seul fondement** du jugement piano ici.
- **`piano-roll-sketch`** : mélodie claire, alignement original ↔ MIDI convaincant sur spectrogramme.

Fichiers : [`midi/piano_synthetic.mid`](midi/piano_synthetic.mid), [`midi/piano_sketch.mid`](midi/piano_sketch.mid), A/B sous `excerpts/ab/`.

### Batterie (`drums`) — non écouté

BasicPitch est un modèle de notes **pitchées**. Sur 20 s de batterie réelle : **4 notes** seulement, toutes après ~9 s. Même sur la fenêtre 8–16 s (là où ces notes existent), le sonify rate presque toute la grille (cymbales / snares absents sur spectrogramme). **Avis : inutilisable pour une piste batterie** dans Song Maker ; un outil dédié drums (hors ADTOF NC) serait requis si on veut du MIDI batterie.

Fichiers : [`midi/drums.mid`](midi/drums.mid), [`excerpts/ab/drums-ab-original-then-midi.mp3`](excerpts/ab/drums-ab-original-then-midi.mp3), [`spectrograms/drums-ab-spectrogram.png`](spectrograms/drums-ab-spectrogram.png).

## Intégration — synthèse pour Loïc

| Question | Réponse d’essai |
|---|---|
| Sans TensorFlow ? | **Oui**, via ONNX + `onnxruntime` (testé). Sur Py≥3.11 Linux, il faut `--no-deps` pour éviter le pull TF. |
| MIDI ouvre dans Partition / piano roll ? | **Oui** (`importMidiToScoreDocument` OK sur tous les fichiers d’essai). |
| Qualité par piste | Non mesurée. Avis **non écouté** (spectro / A/B) : utile pour voix / basse / piano **pitché** (piano jugé sur synthétique + sketch, pas sur le stem site silencieux) ; **pas** pour batterie. |
| Données d’entraînement | **Non vérifiées.** |
| Recommandation produit | Décision Loïc. Si go : chemin opt-in type SheetSage2, script/runtime local, pas de bouton tant que #170 n’est pas tranché. Stem piano du site marketing à corriger (silence). |

## Contenu du dossier

```
docs/basicpitch-trial/
  REPORT.md                 ← ce compte rendu
  metrics.json              ← compteurs runtime / notes
  midi-import-score-engine.json
  note-details.json
  ab-compare-stats.json     ← RMS / chroma (corrélats, pas scores qualité)
  midi/*.mid
  excerpts/ab/*-ab-*.mp3    ← mixes A/B (original puis MIDI sonifié)
  spectrograms/*-ab-spectrogram.png
```

Les WAV d’extraits 8 s (original / sonify) ont été retirés : redondants avec les mp3 A/B.
