# Recette d’entraînement exécutable (étape D)

Point d’entrée :

```text
python scripts/model-training/run_stage_d_toy.py --self-test
python scripts/model-training/run_stage_d_toy.py --out-dir training-jobs/stage-d-toy
```

Cela **tourne** : reconstruction + masque d’inpainting 10–20 %, `checkpoint.json` + `metrics.json`.

Ce n’est **pas** un FullDiT, ni SongCraft GPU, ni un poids YuE2. `pins.json` fixe `desktopProvider: null` : aucun bouton de génération dans l’app. Le produit « modèle maison » reste le ticket #323.

Pins : `scripts/model-training/pins.json` (audio.cpp `v0.8.2`, papiers FullDiT `2608.08787` et SongCraft `2609.16315`). Licence du jouet : recherche, pas un poids.

Prérequis : Python 3.10+, bibliothèque standard uniquement.
