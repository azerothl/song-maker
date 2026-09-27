# Pilote local de LoRA YuE2 à partir d'audio utilisateur

## Décision

Le pilote est faisable, mais il n'existe pas encore de chaîne officielle YuE2 intégrée à Song Maker pour entraîner un adaptateur à partir d'un dossier de morceaux. La voie réaliste est un worker Python local optionnel, isolé du processus Tauri, qui produit un SafeTensors non fusionné puis le fait valider par le runtime audio.cpp avant de l'ajouter à `models/lora/`.

YuE2/audio.cpp accepte des LoRA AR pour la planification sémantique et des LoRA NAR pour le rendu acoustique. Le moteur documente les formats SafeTensors unfused et exige de recréer la session après leur changement. Les adaptateurs exportés par des workflows ComfyUI doivent donc passer un test de compatibilité et ne peuvent pas être déclarés utilisables d'après leur seule extension.

## Périmètre du premier pilote

1. Démarrer avec un adaptateur **NAR de style/timbre**, entraîné sur un petit corpus que l'utilisateur a le droit d'utiliser. Garder l'AR de base pour les paroles et la structure.
2. Accepter un dossier audio et des sidecars texte facultatifs (style, paroles et score ABC). Vérifier les formats, durées, doublons et métadonnées avant de copier les données dans le répertoire temporaire du job.
3. Faire des partitions entraînement/validation par morceau, jamais par segment découpé du même morceau. Conserver un extrait de validation fixe et écouter le modèle de base et l'adaptateur avec les mêmes paramètres.
4. Exécuter le trainer dans un environnement Python isolé et un processus annulable. Écrire chaque job sous `training-jobs/<id>/` avec manifeste, journaux, métriques, échantillons de validation et adaptateur final.
5. Importer l'adaptateur seulement après validation, calculer son SHA-256, conserver provenance/licence et l'exposer dans la bibliothèque locale AR/NAR de Song Maker.

Le pilote ne doit pas promettre une reproduction de voix. Les projets communautaires consultés décrivent principalement du style/timbre, et leurs recettes ainsi que leurs checkpoints ne sont pas des implémentations officielles. L'objectif d'acceptation est la compatibilité de chargement, puis une amélioration audible sur des morceaux tenus à l'écart, sans dégradation excessive des paroles et de la structure.

## Contrôles avant de lancer l'entraînement

- Afficher les prérequis GPU, VRAM, stockage, durée estimée et environnement de calcul avant de créer le job.
- Demander à l'utilisateur de confirmer ses droits sur les audios et de garder les fichiers source dans son espace local.
- Exclure les morceaux de validation du calcul de gradients; conserver un jeu de validation de base identique d'une expérience à l'autre.
- Proposer l'arrêt propre, les journaux lisibles, la reprise depuis un checkpoint et la suppression du dossier temporaire.
- Garder l'adaptateur désactivé tant que l'essai de génération audio.cpp n'a pas réussi. En cas d'échec, ne pas remplacer la configuration active.

## Compatibilité et critères de passage

Le checkpoint de YuE2, le code de training, les dépendances CUDA et les droits d'utilisation des poids doivent correspondre. Tester le format final produit par chaque trainer retenu sur le binaire audio.cpp épinglé par l'application. Pour chaque configuration AR/NAR : charger, générer une courte prise, décharger, relancer avec l'adaptateur désactivé et comparer les fichiers.

Avant d'élargir le pilote : vérifier gradients finis et non nuls, poids de base inchangés, sauvegarde/rechargement, force zéro, annulation et nettoyage; comparer des sorties à graine fixe sur validation; faire écouter à l'aveugle au moins plusieurs exemples. Un trainer qui n'exporte qu'un format ComfyUI fusionné ou qui requiert un audio-token head incompatible ne passe pas l'import direct.

## Sources techniques consultées

- [Documentation YuE2 d'audio.cpp, v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/docs/models/yue2.md) — formats et options LoRA de génération, export des tokens sémantiques et continuation.
- [ComfyUI-YuE2-Trainer](https://github.com/Starnodes2024/ComfyUI-YuE2-Trainer) — recette communautaire YuE2/LoRA et workflow de données; compatibilité à valider avec audio.cpp.
- [ComfyUI-FL-YuE2, recherche entraînement](https://github.com/filliptm/ComfyUI-FL-YuE2/blob/main/TRAINING_RESEARCH.md) — liste de vérifications proposée pour données, surapprentissage, validation et rechargement.
- [ComfyUI-FL-YuE2, entraînement](https://github.com/filliptm/ComfyUI-FL-YuE2/blob/main/docs/TRAINING.md) — préparation audio/annotations et exécution de recettes communautaires.

Ces repositories communautaires sont des pistes d'expérimentation, pas une garantie de qualité, de compatibilité ou de licence commerciale.
