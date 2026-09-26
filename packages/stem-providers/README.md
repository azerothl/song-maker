# `@song-maker/stem-providers`

Phase **3** foundations for interchangeable stem separation ([spec §9](../../specs/SONG_MAKER_SPEC.md), §23).

## Rôle

Après les phases 1–2, Song Maker garde un seul séparateur vivant : HTDemucs `htdemucs_q8_0` via `audiocpp_server`, avec rééchantillonnage soxr 48 kHz ↔ 44,1 kHz dans le worker. Ce paquet expose :

- l’interface `StemSeparatorProvider` ;
- la forme de l’adaptateur HTDemucs (métadonnées épinglées, pas d’appel HTTP) ;
- un stub BS-RoFormer (`bs_roformer`) comme second provider documenté.

## Branchement après phase 1–2

1. Phase 1 continue d’appeler HTDemucs directement (ou via ce package une fois câblé).
2. Phase 3 enregistre un second provider et laisse l’utilisateur choisir la famille dans les paramètres — **pas** dans les quatre écrans du premier build.
3. Les rôles `guitar` / `piano` sont marqués `less_reliable` ; `other` reste « Accompagnement ».

## Hors périmètre

- Pas d’écrans UI phase 1.
- Pas de poids GGUF téléchargés ici.
- `separate()` lève volontairement tant que le worker phase 1 / 3 n’est pas branché.

## Tests

```bash
pnpm --filter @song-maker/stem-providers test
```
