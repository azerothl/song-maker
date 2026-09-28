# Trainer NAR local

Script livré : `scripts/lora-train-nar.py`.

L’hôte Tauri détecte le fichier (`trainerExists: true`) et lance :

```text
python scripts/lora-train-nar.py --job-dir <jobs>/<id> --manifest <jobs>/<id>/manifest.json
```

Le processus reste isolé de l’UI, écrit sous le dossier du job, et produit un SafeTensors **non fusionné**. Song Maker n’active jamais l’adaptateur automatiquement.

Prérequis : Python 3.10+ (ou `SONG_MAKER_PYTHON`). `torch` est optionnel (améliore l’export RNG) ; sans torch un adapter de format est tout de même écrit pour tests de charge — ce n’est pas une promesse de qualité GPU.
