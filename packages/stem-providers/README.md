# `@song-maker/stem-providers`

Phase **3** — séparateurs de stems interchangeables ([spec §9](../../specs/SONG_MAKER_SPEC.md), §23).

## Rôle

- interface `StemSeparatorProvider` ;
- **HTDemucs** `htdemucs_q8_0` (défaut, premier build) — 4 stems ;
- **HTDemucs 6 stems ONNX** — guitare et piano en plus ; runtime Python/ONNX optionnel, ces deux stems restent expérimentaux ;
- **BS-RoFormer** `bs_roformer_q8_0` — seulement voix + instrumental (mappé sur « Accompagnement ») quand le GGUF est présent hors installeur.

## Honêteté stems

| Provider | Disponibles | Indisponibles |
|---|---|---|
| HTDemucs | voix, batterie, basse, accompagnement | guitare, piano |
| HTDemucs 6 stems | voix, batterie, basse, accompagnement, guitare, piano (estimations) | — |
| BS-RoFormer | voix, accompagnement (← instrumental) | batterie, basse, guitare, piano |

## Transport

`separate()` exige un `AudiocppSepTransport` injecté (worker Tauri). Sans transport, l’appel refuse explicitement — pas de faux succès.

## Tests

```bash
pnpm --filter @song-maker/stem-providers test
```
