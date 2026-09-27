# Gate `stop_after=abc`

**Statut :** gated — non activé  
**Drapeau :** `STOP_AFTER_ABC_ENABLED = false` dans `src/generation/stop-after.ts`  
**Épingle actuelle :** audio.cpp `v0.8.1` (`pins.rs`)

## Pourquoi ce n’est pas activé

`stop_after=abc` (score sans WAV) est documenté à partir d’audio.cpp **≥ v0.8.2**.
Le premier build et la Phase 1 restent sur `v0.8.1` (archives CUDA Windows 12.4 +
Linux `cuda12.8-colab`, hashes figés). Une nouvelle épingle exige :

1. Vérifier les digests des archives CUDA `v0.8.2` (ou hotfix) — mêmes rôles Windows / Linux.
2. Relancer le parcours Phase 0 / Phase 1 (GPU CUDA, `GET /health`, génération style+paroles).
3. **Ne pas** substituer Vulkan, CPU ou macOS Metal si CUDA échoue.
4. Mettre à jour `pins.rs` + l’écran licences / paramètres.
5. Ensuite seulement : `STOP_AFTER_ABC_ENABLED = true` et câbler `stop_after` dans
   `POST /v1/tasks/run` (options YuE2).

## Contrat produit (quand le drapeau passera)

- `cot` ∈ `melody|full` ; pas d’ABC externe.
- UI FR : « Générer la partition seulement ».
- Plusieurs rendus audio ultérieurs sur le même ABC (appels séquentiels, un GPU).

## Sources

- [yue2.md v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/yue2.md)
- Spec §23 piste 2 ; `docs/yue2-ameliorations.md` item 2
