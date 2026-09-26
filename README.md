# Song Maker — fondations phases 3 et 4

Ce dépôt contient le contrat produit (`specs/`) et, dans `packages/`, des **fondations** pour les phases 3 (production audio) et 4 (agent / collaboration).  
Elles ne remplacent pas et n’élargissent pas le premier build (phases 0–1).

## Paquets

| Paquet | Phase | Rôle |
|---|---|---|
| [`@song-maker/stem-providers`](packages/stem-providers) | 3 | `StemSeparatorProvider`, HTDemucs, stub BS-RoFormer |
| [`@song-maker/mix-production`](packages/mix-production) | 3 | Automation / effets / sidechain / loudness (stubs, pas de DSP) |
| [`@song-maker/lora-packs`](packages/lora-packs) | 3–4 | Registre LoRA + catalogue styles, porte CC BY-NC, **sans poids** |
| [`@song-maker/partition-invariants`](packages/partition-invariants) | 4 | Invariants §11.3 (événements, pas diff ABC) |
| [`@song-maker/remote-worker`](packages/remote-worker) | 4 | Client worker GPU distant + auth placeholder |
| [`@song-maker/akasha-declui`](packages/akasha-declui) | 4 | Notes / stub Akasha + DeclUI (§18.5) |

Les écrans UI phase 1 (Tauri/React) vivent ailleurs — ces paquets évitent volontairement `apps/` et les routes d’écran.

## Développement

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Hors périmètre (volontaire)

- Aucun poids LoRA / GGUF dans le dépôt.
- Pas d’implémentation des quatre écrans du premier build.
- Pas d’élargissement de la coupe phase 1 (§4.1 / §22.1).
