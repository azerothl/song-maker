# Modèle musical multimodal — dossier de spécifications

**Version :** 0.1 — proposition de conception<br>
**Date :** 1er octobre 2026<br>
**Périmètre confirmé :** instrumental et chant dès la première version.

Créer un modèle capable de composer, interpréter et transformer de la musique à partir de **texte, audio, partition et MIDI**, seuls ou combinés. Chaque résultat peut être livré en **mix audio, pistes audio par instrument, partition et MIDI**, selon les sorties demandées.

Le modèle doit prendre en charge la génération originale, les **covers**, les **variantes** et l'**inpainting temporel et par piste**. Les pistes générées, les notes et le chant doivent partager la même structure musicale et la même chronologie.

Ce dossier décrit un **nouveau modèle à développer**. Il ne décrit pas des fonctionnalités déjà disponibles dans Song Maker et ne constitue pas un engagement de performances mesurées.

## Documents

| Document | Contenu |
|---|---|
| [MODEL_SPEC.md](MODEL_SPEC.md) | Usages, formats, modes, représentation musicale, architecture, API et intégration Song Maker |
| [TRAINING_PLAN.md](TRAINING_PLAN.md) | Corpus, alignement, entraînement instrumental et vocal, choix de modèles, calcul et jalons |
| [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) | Critères de livraison, mesures musicales et audio, scénarios de validation réelle |
| [Exemple de génération](examples/generate.request.json) | Texte + paroles → chanson, pistes, partition et MIDI |
| [Exemple d'inpainting](examples/inpaint.request.json) | Remplacer une région d'une piste sans modifier les régions protégées |
| [Exemple de cover](examples/cover.request.json) | Audio + partition confirmée → nouvel arrangement chanté |

## Décisions de départ

1. **Chant et instrumental en V1.** La première livraison complète doit contenir les deux ; les étapes de recherche ne valent pas livraison V1.
2. **Modèle structuré en plusieurs composants.** Un plan musical commun pilote la génération audio de plusieurs pistes, dont la voix. L'ensemble forme un système de génération unique, versionné et entraîné sur des tâches communes.
3. **Pistes natives par instrument.** Une piste correspond à une partie musicale identifiable : piano, basse, guitare, voix, etc. Le groupe « autres instruments » ne satisfait pas cette exigence.
4. **Exports cohérents.** Le mix de référence est construit depuis les pistes ; la partition et le MIDI proviennent des mêmes événements musicaux, avec une vérification de leur réalisation dans l'audio.
5. **Retouches avec protection explicite.** Le masque indique les pistes et intervalles modifiables. La conservation exacte hors masque est assurée sur le PCM de référence par l'assemblage final, puis vérifiée.
6. **Cover et variante définies par des invariants.** L'utilisateur choisit ce qui doit rester identique et ce qui peut changer.
7. **Entraînement et inférence séparés.** Une exécution locale est une cible ; le matériel d'entraînement et les ressources nécessaires seront déterminés par profilage.

## Périmètre V1 proposé

| Dimension | Cible V1, à valider expérimentalement |
|---|---|
| Création | Instrumental, chanson chantée, voix seule, accompagnement d'une voix ou d'un instrument |
| Langues | Consignes et chant en français et en anglais ; langues supplémentaires annoncées après validation |
| Entrées | Texte/paroles, WAV/FLAC/MP3, MIDI `.mid`, MusicXML `.musicxml`/`.mxl`, ABC importable |
| Sorties | Mix et pistes WAV/FLAC, MusicXML + PDF, MIDI type 1, représentation musicale JSON |
| Durée | Extraits de 10 à 30 s pour la recherche ; livraison V1 sur 10 à 240 s |
| Pistes | Jusqu'à 8 pistes simultanées ; identités d'instrument explicites, voix incluse |
| Instruments de validation | Batterie, basse, piano/clavier, guitare, cordes/pad, instrument mélodique, voix principale, chœurs |
| Contrôle | Tempo, métrique, tonalité, structure, paroles, mélodie, harmonie, instrumentation et zones protégées |
| Édition | Inpainting d'un passage, d'une piste entière ou de plusieurs régions/pistes ; cover et variante |
| Plateforme initiale | Prototype PyTorch ; intégration locale Windows/CUDA dans Song Maker après validation du modèle |

Les limites sont des **bornes de conception proposées**, pas des capacités acquises. Huit pistes peuvent contenir plusieurs instances du même instrument ; la nomenclature ne doit pas imposer une piste unique par famille. Une batterie est un instrument composé ; ses éléments individuels sont une extension.

Une partition désigne en V1 une notation structurée. La lecture de photos, scans et PDF de partitions nécessite un module de reconnaissance optique distinct et reste une extension. Le PDF en sortie est produit par un moteur de gravure musicale.

## Ancrage dans Song Maker

Les documents actuels du dépôt indiquent que YuE2 ne consomme pas directement d'audio de référence et que les stems du parcours principal sont obtenus ensuite par séparation. Le nouveau modèle doit apporter un conditionnement audio, une édition locale et des pistes générées par instrument. Sources locales consultées : [README](../../README.md), [spécification existante](../SONG_MAKER_SPEC.md), [moteur de partition](../../packages/score-engine/README.md) et [contrat worker](../../docs/remote-worker-contract.md).

Le `ScoreDocument` actuel utilise 960 ticks par noire. Il constitue un point d'intégration, mais ses types ne couvrent pas à eux seuls les instruments, toutes les articulations, les contrôleurs de performance et l'alignement phonémique nécessaires au nouveau modèle. L'adaptation doit préserver les projets existants.

## Références de conception

Sources primaires consultées le 1er octobre 2026. Elles motivent les options de recherche ; leurs résultats publiés ne sont pas des mesures du futur modèle.

| Référence | Apport retenu | Limite par rapport au contrat visé |
|---|---|---|
| [JASCO — article](https://arxiv.org/abs/2406.10970) | Conditionnements textuels, symboliques et audio, contrôle temporel, flow matching | Le contrôle multimodal ne prouve pas une transcription complète ni des pistes natives pour chaque instrument |
| [StemGen — article](https://arxiv.org/abs/2312.08723), [démonstrations des auteurs](https://julian-parker.github.io/stemgen/) | Génération d'une partie cohérente avec un contexte musical audio | Une partie ajoutée ne couvre pas à elle seule la chanson complète et les sorties symboliques |
| [MusicGen-Stem — article](https://arxiv.org/abs/2501.01757) | Flux audio parallèles et édition de stems avec dépendances musicales | Les trois stems présentés sont basse, batterie et autres ; le besoin impose une granularité par instrument |
| [SongGen — dépôt des auteurs](https://github.com/LiuZH-19/SongGen) | Génération chantée et modes mix/voix-accompagnement séparés | Deux pistes voix/accompagnement ne suffisent pas aux pistes par instrument |
| [ACE-Step 1.5 — dépôt officiel](https://github.com/ace-step/ACE-Step-1.5), [releases](https://github.com/ace-step/ACE-Step-1.5/releases) | Référence à comparer pour chant, cover, repaint et variantes ; fonctionnalités dépendantes du checkpoint | Le checkpoint et sa liste réelle de tâches doivent être fixés avant comparaison ; les exports cohérents partition/MIDI font l'objet de notre contrat propre |
| [Slakh2100-redux — dépôt des auteurs sur Zenodo](https://zenodo.org/records/4599666) | Audio multipiste synthétique et MIDI aligné ; attention explicite aux doublons entre splits | Les rendus synthétiques ne couvrent pas le chant ni le réalisme des enregistrements de studio |
| [GTSinger — dépôt des auteurs](https://github.com/AaronZ345/GTSinger) | Corpus de chant avec audio, annotations temporelles et MusicXML, incluant français et anglais | Corpus spécialisé de chant ; conditions de réutilisation à relever avant inclusion |

## Points à trancher après les premières expériences

Le budget GPU, le volume de données réellement accessible, les poids réutilisables, la licence des futurs poids, le moteur de rendu de partition et les seuils musicaux définitifs restent à choisir. Le dossier fixe les contrats pour que ces choix puissent être comparés sur les mêmes tâches.

Le premier travail concret est un corpus pilote aligné **audio multipiste + notes + paroles**, suivi d'une expérience instrumentale et vocale de 20 à 30 secondes. L'objectif est de vérifier la faisabilité des sorties cohérentes avant d'investir dans un entraînement long.
