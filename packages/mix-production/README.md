# `@song-maker/mix-production`

Phase **3** — automation, effets, sidechain et loudness ([spec §10.3](../../specs/SONG_MAKER_SPEC.md)).

## Sous-ensemble réel (pas des stubs vides)

| Module | Comportement |
|---|---|
| `MixAutomationEngine.sampleAt` | Interpolation linéaire des points volume / pan |
| `TrackEffectsRack.process` | Compresseur + limiteur soft (EQ gain shelf) ; réverb = passe-through |
| `SidechainRouter.applyDucking` | Ducking destination ← enveloppe source |
| `LoudnessMeter.measurePcm` | True peak dBFS + estimation LUFS intégrée (pas un filtre K BS.1770 complet) |

Le rendu offline phase 1 (formule §10.5) reste la source de vérité pour l’export. Ce paquet alimente le panneau production phase 3.

## Tests

```bash
pnpm --filter @song-maker/mix-production test
```
