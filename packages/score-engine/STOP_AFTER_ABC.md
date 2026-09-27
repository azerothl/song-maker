# Gate `stop_after=abc`

**Statut :** gated — non activé  
**Drapeau :** `STOP_AFTER_ABC_ENABLED = false` dans `src/generation/stop-after.ts`  
**Épingle actuelle :** audio.cpp `v0.8.2` (`pins.rs`)

## Pourquoi ce n’est pas activé

`stop_after=abc` (score sans WAV) est documenté à partir d’audio.cpp **≥ v0.8.2**. Cette version et ses archives CUDA sont maintenant épinglées et vérifiées.
La fonction reste désactivée parce que la commande desktop attend une réponse audio et ne transmet pas encore `stop_after`.

Pour l’activer, il reste à ajouter le chemin score seulement à la commande desktop, stocker son artefact sans WAV, puis tester avec CUDA. Le drapeau restera désactivé jusque-là.

## Contrat produit (quand le drapeau passera)

- `cot` ∈ `melody|full` ; pas d’ABC externe.
- UI FR : « Générer la partition seulement ».
- Plusieurs rendus audio ultérieurs sur le même ABC (appels séquentiels, un GPU).

## Sources

- [yue2.md v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/yue2.md)
- Spec §23 piste 2 ; `docs/yue2-ameliorations.md` item 2
