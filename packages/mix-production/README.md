# `@song-maker/mix-production`

Phase **3** — automation, effets, sidechain et loudness ([spec §10.3](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

Sous-ensemble DSP réel + rendu offline partagé. Les exports `Stub*` / `createStubMixProductionToolkit` sont des **alias dépréciés** vers les implémentations réelles.

| API | Comportement |
|---|---|
| `MixAutomationEngine.sampleAt` | Interpolation linéaire des lanes volume / pan |
| `TrackEffectsRack.process` | Limiteur, compresseur (attaque/relâchement/knee), gate, filtre HP/LP, EQ shelf + EQ paramétrique, delay sync tempo, réverb stéréo, correction de justesse vocale |
| `registerCustomProcessor` | Extensions DSP `custom` ; sans registre → refus explicite (pas de no-op) |
| `SidechainRouter.applyDucking` | Ducking destination depuis enveloppe source |
| `LoudnessMeter.measurePcm` | True peak dBFS + estimation LUFS (pas filtre K BS.1770) |
| `placeClipsOnTimeline` | Placement clips (start/offset/durée/fondus) |
| `renderMixOffline` | Somme §10.5 + overlays production — **même bake** lecture / export |

## Branchement app

1. Sans overlay production : lecture GainNode live + export Rust §10.5 (phase 1).
2. Avec overlay : `bakeMixPcm` → buffer Web Audio **et** `export_pcm_audio`.
3. Correspondance **approximative** (même float32 TS), **pas bit-exact** avec le graphe live ni avec l’exporteur Rust historique.

## Filtres et EQ

- **Filtre** : passe-haut / passe-bas, fréquence et pente 12 ou 24 dB/oct.
- **EQ shelf** (`kind: "eq"`) : gain global léger (historique).
- **EQ paramétrique** (`kind: "parametricEq"`) : plusieurs bandes avec type de courbe documenté (`peak`, `lowshelf`, `highshelf`, `lowpass`, `highpass`, `notch`), fréquence, gain et Q. Distinct de l’EQ shelf.

## Delay

Delay par piste avec temps libre (ms) ou sync tempo (divisions `1/1` … `1/8t`, pointées et triolets). Feedback plafonné à **0,95**. Sans tempo valide → repli sur le temps libre. Queue documentée via `delayTailFrames` (non tronquée en lecture / export).

## Dynamique

- **Compresseur** : seuil, ratio, attaque, relâchement, knee, makeup. `getGainReductionDb` expose la réduction de crête du dernier `process`.
- **Gate / expanseur** : seuil, ratio, attaque, relâchement, atténuation max — enveloppe lissée anti-clics.
- **Limiteur** : effet distinct (plafond).

Ces outils sont des **aides de mixage**, pas un mastering automatique.

## Réverbération

Réverb algorithmique stéréo (comb + allpass). Paramètres : `mix`, `roomSize`, `damping`, `width` (0…1).
La queue s’étend d’environ **0,35 s → 2,8 s** selon `roomSize` (`reverbTailFrames`) ; lecture et export offline utilisent le même bake et ne tronquent pas cette queue.

## Correction de justesse (`pitch_correct`)

Correcteur local léger (AMDF + OLA) pour stems vocaux. Paramètres : `mode` (chromatic|scale), `tonic`, `scale`, `intensity`, `speed`, `formantPreserve`.
Voir [docs/pitch-correct.md](../../docs/pitch-correct.md). Pas un Autotune commercial ; licence in-repo Apache-2.0.

## Effets custom

`kind: "custom"` exige `params.processorId` et une extension enregistrée via `registerCustomProcessor`. Sinon `insert` / `process` lèvent une erreur visible — aucun passage silencieux.

## Hors périmètre

Réverb convolution IR, filtre K loudness complet, guitare/piano stems.

## Tests

```bash
pnpm --filter @song-maker/mix-production test
```
