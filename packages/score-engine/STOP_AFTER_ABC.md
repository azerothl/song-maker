# `stop_after=abc`

**Statut :** activé  
**Drapeau :** `STOP_AFTER_ABC_ENABLED = true` dans `src/generation/stop-after.ts`  
**Épingle :** audio.cpp `v0.8.2` (`pins.rs`)

## Contrat

- `stop_after=abc` produit le score ABC **sans** WAV.
- `cot` ∈ `melody|full` ; pas d’ABC externe.
- Le client score-engine (`planStopAfterAbc` / `GatedStopAfterAbcClient.run`) valide et renvoie le fragment d’options `{ stop_after: "abc" }` — l’appel GPU reste dans la commande desktop `start_generation`.
- La commande desktop doit :
  1. transmettre `stop_after` dans `options` de `POST /v1/tasks/run` ;
  2. accepter un job réussi avec `score.abc` et `audio: null` (`state: "score_only"`) ;
  3. ne pas exiger de WAV.

## Multi-rendu

Après une génération score-only, plusieurs rendus audio réutilisent le même `score.abc` via `render_from_generation` (ABC immuable + `parentGenerationId` = gen source). Pas de `stop_after` sur ces appels.

## UI

- « Générer la partition seulement »
- « Rendre N fois depuis ce score »

## Sources

- [yue2.md v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/yue2.md)
- Spec §23 piste 2 ; `docs/yue2-ameliorations.md` item 2
