# `@song-maker/lora-packs`

Phases **3–4** — registre de packs LoRA optionnels (métadonnées uniquement).

## Rôle

Le premier build n’installe **aucun** LoRA (§4.3, §23). Ce paquet catalogue :

| Kind | Exemple | Slot audio.cpp |
|---|---|---|
| `ar_instrumental` | Mothersuperior instrumental CoT | `yue2.ar_lora` |
| `nar_realaudio` | realaudio tokenizer v4 | `yue2.nar_lora` |
| `style` | chanson française `chnsn`, industrial rock | AR + NAR |

Tous sont **CC BY-NC 4.0**, layout `unfused_safetensors` (pas ComfyUI), `includedInFirstBuildInstaller: false`.

## Porte de licence

`gateLoraPackAccess` refuse :

- licence CC BY-NC non acceptée ;
- redistribution commerciale (`allowCommercialRedistribution`) ;
- packs inconnus / layouts non unfused.

Aucun poids n’est téléchargé par ce paquet. `requestOptionalLoraDownload` ne fait que revalider la porte.

## Branchement après phase 1–2

1. Écran Licences phase 1 reste inchangé (YuE2 / GGUF CC BY-NC).
2. Phase 3 : téléchargement volontaire AR/NAR derrière la même porte.
3. Phase 4 : catalogue de styles (`listStyleLoraPacks`) + options de session.

## Tests

```bash
pnpm --filter @song-maker/lora-packs test
```
