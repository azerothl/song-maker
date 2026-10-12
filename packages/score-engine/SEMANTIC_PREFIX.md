# `semantic_prefix`

**Statut :** activé (continuation mid-song)  
**Drapeau :** `SEMANTIC_PREFIX_ENABLED = true` dans `src/generation/semantic-prefix.ts`  
**Épingle actuelle :** audio.cpp `v0.9.1` (`pins.rs`)

## Frontière score-engine / Tauri

- Le client score-engine (`planSemanticPrefixContinuation` / `DesktopSemanticPrefixClient.continueFromPrefix`) valide l’état du parent (`semanticTruncated`, présence de `semantic.json`, plafond de tokens) et renvoie le fragment d’options `{ semantic_prefix_file, export_semantic: true }`.
- L’appel GPU reste dans la commande desktop `start_generation` avec `continuationGenerationId` : lecture de `generations/<id>/semantic.json`, injection de `semantic_prefix_file`, job `kind: "continuation"`.
- `StubSemanticPrefixClient` est un **alias déprécié** de `DesktopSemanticPrefixClient` (compat imports).

## Contrat

1. La prise source doit avoir `result.json.semanticTruncated === true` et un `semantic.json` non vide.
2. `cot ∈ melody|full` exige le `score.abc` de la prise source (ou un ABC fourni).
3. Incompatible avec `stop_after=abc`.
4. `export_semantic` reste actif sur la continuation pour enchaîner d’autres sections.

## UI

- Panneau « Continuer » sur une génération tronquée (`can_continue`).
- Paroles additionnelles concaténées au brief du projet.

## Sources

- [yue2.md v0.9.1](https://github.com/0xShug0/audio.cpp/blob/v0.9.1/docs/models/yue2.md)
- Spec §23 ; `docs/yue2-ameliorations.md` item 3
- `packages/score-engine/STOP_AFTER_ABC.md` (chemin voisin, score-only)
