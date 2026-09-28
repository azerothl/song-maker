# `@song-maker/mix-production`

Phase **3** — automation, effets, sidechain et loudness ([spec §10.3](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

Sous-ensemble DSP réel + rendu offline partagé. Les exports `Stub*` / `createStubMixProductionToolkit` sont des **alias dépréciés** vers les implémentations réelles.

| API | Comportement |
|---|---|
| `MixAutomationEngine.sampleAt` | Interpolation linéaire des lanes volume / pan |
| `TrackEffectsRack.process` | Limiteur soft + compresseur feed-forward (+ shelf EQ) |
| `SidechainRouter.applyDucking` | Ducking destination depuis enveloppe source |
| `LoudnessMeter.measurePcm` | True peak dBFS + estimation LUFS (pas filtre K BS.1770) |
| `placeClipsOnTimeline` | Placement clips (start/offset/durée/fondus) |
| `renderMixOffline` | Somme §10.5 + overlays production — **même bake** lecture / export |

## Branchement app

1. Sans overlay production : lecture GainNode live + export Rust §10.5 (phase 1).
2. Avec overlay : `bakeMixPcm` → buffer Web Audio **et** `export_pcm_audio`.
3. Correspondance **approximative** (même float32 TS), **pas bit-exact** avec le graphe live ni avec l’exporteur Rust historique.

## Hors périmètre

Réverb convolution, filtre K loudness complet, guitare/piano stems.

## Tests

```bash
pnpm --filter @song-maker/mix-production test
```
