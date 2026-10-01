# Pilote local de LoRA YuE2 à partir d'audio utilisateur

## Décision

Le pilote local est exécutable via `scripts/lora-train-nar.py`, isolé du processus Tauri. Les jobs persistent sous `Documents/Song Maker/training-jobs/<id>/` (manifeste, logs, métriques, checkpoints, adapter SafeTensors non fusionné). L’adaptateur reste **inactif** jusqu’à validation audio.cpp + écoute A/B.

YuE2/audio.cpp accepte des LoRA AR pour la planification sémantique et des LoRA NAR pour le rendu acoustique. Les adaptateurs exportés par des workflows ComfyUI doivent passer un test de compatibilité.

Package produit : `@song-maker/lora-training` (validation corpus, split par morceau, store disque injectable, annulation/journaux/nettoyage). L’hôte Tauri sonde le script, mesure durée/SHA des WAV, lance et annule le worker.

## Inconnues de compatibilité (état)

| Sujet | Statut |
|---|---|
| Chargement AR/NAR unfused dans audio.cpp épinglé | **Fermé pour le runtime** — session `yue2.ar_lora` / `yue2.nar_lora` |
| Worker NAR local (`scripts/lora-train-nar.py`) | **Livré** — validation corpus, logs, checkpoints, export SafeTensors unfused |
| Entraînement GPU complet (torch + recette YuE2 officielle) | **Ouverte** — le script exporte un adapter de format pour tests de charge ; torch optionnel |
| Export ComfyUI / fusionné → audio.cpp | **Fermé côté politique** — refus catalogue jusqu’à conversion |
| VRAM / disque / durée sur machine cible | **Estimations UI `measured: false`** — mesurer avant promesse matérielle |
| Clonage de voix | **Fermé** — hors périmètre |

## Contrat trainer

```text
python scripts/lora-train-nar.py --job-dir <jobs>/<id> --manifest <jobs>/<id>/manifest.json
```

- Annulation : fichier `CANCEL` ou SIGTERM.
- Sortie : `adapter/nar_lora.safetensors` (unfused), `metrics.json`, `validation-report.json`.
- `autoActivate: false` toujours.

## Stub vs réel

| Composant | État |
|---|---|
| Validation corpus + split + estimations | Réel |
| Écriture `training-jobs/<id>/` disque | Réel (hôte Tauri) |
| Trainer Python | Réel (`scripts/lora-train-nar.py`) |
| Activation auto | **Jamais** |
| Gate catalogue | Réel (`validateAdapterForCatalog`) |

## Sources techniques

- [Documentation YuE2 d'audio.cpp, v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/yue2.md)
- [ComfyUI-YuE2-Trainer](https://github.com/Starnodes2024/ComfyUI-YuE2-Trainer) — piste communautaire, non garantie
- [ComfyUI-FL-YuE2 TRAINING](https://github.com/filliptm/ComfyUI-FL-YuE2/blob/main/docs/TRAINING.md)
