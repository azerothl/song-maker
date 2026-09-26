# `@song-maker/mix-production`

Phase **3** — contrats d’automation, effets, sidechain et loudness ([spec §10.3](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

Le premier build ne livre que gain, panoramique, mute, solo et gain master (§10.1–10.2). Ce paquet prépare les interfaces de production audio **sans DSP** :

- `MixAutomationEngine` — lanes volume / pan ;
- `TrackEffectsRack` — EQ, compresseur, réverb (slots seulement) ;
- `SidechainRouter` — routes source → destination ;
- `LoudnessMeter` — rapport LUFS / true peak (stub).

## Branchement après phase 1–2

1. Garder le rendu offline phase 1 (formule §10.5) pour le mix simple.
2. En phase 3, injecter `createStubMixProductionToolkit()` (puis de vraies implémentations) dans le worker de mix, derrière les mêmes fichiers `mixes/mix-vNNN.json`.
3. Ne pas exposer ces contrôles dans les quatre écrans du premier build.

## Hors périmètre

Aucun traitement audio réel. `sampleAt`, `process` et `measure` (hors `standard: "none"`) lèvent une erreur explicite.

## Tests

```bash
pnpm --filter @song-maker/mix-production test
```
