# `@song-maker/partition-invariants`

Phase **4** — vérificateurs d’invariants de conservation de partition ([spec §11.3](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

Avant une régénération, l’utilisateur choisira un niveau :

- hauteurs exactes ;
- hauteurs et rythmes ;
- contour seulement ;
- adaptation mélodique limitée ;
- réharmonisation ;
- changement de tempo ;
- changement de structure.

Ces invariants se vérifient sur les **événements** (`ScoreEventSnapshot`), jamais par comparaison de texte ABC. Ce n’est ni un critère du premier build, ni de la phase 2.

## Branchement après phase 1–2

1. Phase 2 livre `ScoreDocument` / piano roll / export ABC.
2. Phase 4 branche `createPartitionInvariantChecker()` avant « régénérer depuis la partition ».
3. Les niveaux `contour_only` et suivants renvoient `stub_unimplemented` jusqu’aux algorithmes réels.

## Tests

```bash
pnpm --filter @song-maker/partition-invariants test
```
