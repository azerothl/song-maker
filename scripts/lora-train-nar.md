# Trainer NAR local (optionnel)

Placez ici un script exécutable `lora-train-nar.py` (ou `.sh`) pour que
`@song-maker/lora-training` passe de `not_implemented` à `queued` lorsque
l’hôte détecte le fichier (`trainerExists: true`).

Contrat attendu (hôte) :

```text
<trainer> --job-dir training-jobs/<id> --manifest training-jobs/<id>/manifest.json
```

Le script doit rester isolé du processus UI, écrire sous le dossier du job, et
produire un SafeTensors **non fusionné**. Song Maker n’active jamais l’adaptateur
automatiquement.
