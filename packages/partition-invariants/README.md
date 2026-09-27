# `@song-maker/partition-invariants`

Phase **4** — vérificateurs d’invariants de conservation de partition ([spec §11.3](../../specs/SONG_MAKER_SPEC.md)).

## Rôle

Avant une régénération, l’utilisateur choisit un niveau :

| Niveau | Vérification |
|---|---|
| `exact_pitches` | Hauteurs inchangées |
| `pitches_and_rhythms` | Hauteurs + rythmes |
| `contour_only` | Signe des intervalles successifs |
| `limited_melodic_adaptation` | Δpitch ≤ 2 demi-tons, rythme conservé |
| `reharmonization` | Mélodie conservée ; accords libres |
| `tempo_change` | Notes conservées ; tempo libre |
| `structure_change` | Notes conservées ; sections libres |

Ces invariants se vérifient sur les **événements** (`ScoreEventSnapshot` / `snapshotFromScoreDocument`), jamais par comparaison de texte ABC.

## Branchement

1. Avant « Générer » avec partition : capturer le snapshot courant.
2. Après une édition / candidat : `createPartitionInvariantChecker().check(level, before, after)`.
3. L’UI affiche les violations ; la génération phase 1 (sans partition) n’est pas concernée.

## Tests

```bash
pnpm --filter @song-maker/partition-invariants test
```
