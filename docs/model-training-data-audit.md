# Données et évaluation du modèle maison

État de préparation de l’issue [#323](https://github.com/azerothl/song-maker/issues/323), vérifié le 11 octobre 2026. Ce document prépare une décision ; il ne constitue ni une autorisation de données, ni un protocole approuvé, ni une preuve d’entraînement.

## Sources examinées

| Source | Apport possible | Licence ou limite connue | Décision pour des poids redistribuables |
|---|---|---|---|
| [Slakh2100](https://www.slakh.com/) | Audio synthétique, stems et MIDI multi-instrument | Le site officiel annonce CC BY 4.0. Le jeu est rendu depuis le Lakh MIDI Dataset ; cette licence de jeu ne prouve pas, à elle seule, les droits sur chaque œuvre et transcription sous-jacentes. | Candidat technique limité ; ne pas l’utiliser pour entraîner ou redistribuer des poids avant clarification des droits des compositions, des MIDI et des sons rendus. |
| [MAESTRO v2](https://magenta.withgoogle.com/datasets/maestro) | Audio piano et MIDI alignés avec précision | Google indique CC BY-NC-SA 4.0 ; le corpus est centré sur le piano. La clause non commerciale est incompatible en première analyse avec une redistribution commerciale envisagée. La qualification juridique des poids dérivés doit être confirmée séparément. | Recherche non commerciale éventuellement ; exclu de la voie de production redistribuable sans avis juridique écrit. |
| [Lakh MIDI Dataset](https://colinraffel.com/projects/lmd/) | Grand corpus MIDI symbolique | Le mainteneur indique CC BY 4.0, mais précise ne pas avoir transcrit les œuvres et que les métadonnées de droits ne sont pas utilisées de façon cohérente. Il ne fournit pas, à lui seul, un corpus audio apparié dont les droits de redistribution sont établis. | Ne pas retenir pour des poids redistribuables tant que les droits sur les œuvres et les données audio associées ne sont pas établis. |

### Portée de Slakh2100

Le site du projet décrit 2 100 morceaux instrumentaux avec MIDI et stems alignés ; l’article d’origine rapporte 145 heures réparties entre entraînement, validation et test ([site du projet](https://www.slakh.com/), [article MERL](https://www.merl.com/publications/docs/TR2019-124.pdf)). Cela en fait une piste pour prototyper des tâches instrumentales multi-pistes ou audio-vers-MIDI. Le corpus est instrumental et ne fournit pas de prompts textuels appariés : il ne couvre donc pas à lui seul la génération demandée dans #323 (texte ou audio vers mix et partition, inpainting et multi-pistes).

L’article précise que les fichiers MIDI proviennent du Lakh MIDI Dataset, collecté à partir de fichiers disponibles sur le Web auprès d’auteurs largement inconnus. La déclaration CC BY 4.0 du jeu ne résout pas cette provenance, ni celle des instruments et sons utilisés pour le rendu. Slakh2100 reste donc un **candidat de recherche à examiner**, pas une source admise pour un entraînement ou une redistribution de poids. Aucun fichier n’a été téléchargé ni utilisé.

La page du mainteneur du [Lakh MIDI Dataset](https://colinraffel.com/projects/lmd/) précise que les fichiers viennent de sources publiquement accessibles, sans attribution fiable par morceau, et que les événements de copyright intégrés aux MIDI sont peu utilisés. Les auteurs de l’Anticipatory Music Transformer signalent aussi des transcriptions potentiellement dérivées d’œuvres protégées et rapportent un quasi-doublon observé avec leur modèle entraîné sur Lakh ([Stanford CRFM](https://crfm.stanford.edu/2023/06/16/anticipatory-music-transformer.html)). Ces éléments documentent un risque de provenance et de mémorisation ; ils ne constituent pas une conclusion juridique générale.

**Conclusion actuelle : aucune de ces sources n’est approuvée pour entraîner et redistribuer le modèle Song Maker.** Une licence publiée pour un jeu ne démontre pas à elle seule les droits sur chaque enregistrement, œuvre, transcription ou banque de sons. Aucun jeu de données ne doit être épinglé dans `pins.json` ni utilisé pour l’entraînement tant qu’une source n’a pas été approuvée.

## Conditions d’admission d’un jeu

Avant tout téléchargement ou entraînement, enregistrer dans un manifeste versionné :

- l’identifiant/version de la source, l’URL d’origine, la date d’accès et une empreinte du fichier ;
- les titulaires et la preuve des droits pour l’audio, les stems, le MIDI/score, les annotations et les banques de sons ;
- les usages autorisés séparément : accès, copie, entraînement, conservation, redistribution des exemples et redistribution des poids ;
- les restrictions territoriales, commerciales, d’attribution, de partage à l’identique, de retrait et de durée de conservation ;
- le traitement des demandes de retrait et la procédure pour exclure un élément déjà préparé ;
- les groupes de composition/performance utilisés pour les splits et les contrôles de doublons.

Un jeu qui autorise seulement le téléchargement ou la recherche académique ne passe pas ce contrôle. Les droits des sorties générées et ceux des poids doivent être documentés explicitement, sans déduire qu’ils sont libres parce que le code d’entraînement l’est.

## Protocole d’évaluation proposé

Ce protocole est une proposition à valider avant de constituer le jeu. Les seuils d’acceptation ne sont pas encore définis et ne doivent pas être inventés après observation des résultats.

1. **Séparer par œuvre** : créer train/validation/test avant augmentation ou rendu synthétique ; toutes les performances, MIDI dérivés, stems, versions et doublons d’une même œuvre restent dans un seul split. Garder le test hors entraînement et hors choix d’hyperparamètres.
2. **Fixer les baselines** : comparer aux parcours réellement livrés (YuE2, ACE-Step et SheetSage2 selon la tâche), avec prompts, graines, paramètres, versions et fichiers d’entrée archivés.
3. **Mesurer chaque capacité séparément** :
   - texte/audio vers mix : évaluation humaine en écoute aveugle de la qualité musicale et du respect du brief ; CLAP/FAD restent des mesures secondaires ;
   - audio vers partition : précision/rappel des notes et des débuts de notes avec tolérance temporelle fixée avant le test, plus métriques de tempo, tonalité et accords ;
   - édition par masque : respect de la consigne dans la zone éditée et conservation mesurée hors masque ;
   - multi-pistes : rôles, alignement temporel, cohérence de tempo/tonalité et absence de fuite entre stems, comparés aux références appariées quand elles existent.
4. **Vérifier les risques de mémorisation** : recherche de quasi-doublons entre splits, comparaison de passages générés avec le corpus et revue humaine des correspondances les plus proches.
5. **Préenregistrer le verdict** : choisir avant l’entraînement les seuils par tâche, la taille de l’échantillon humain, les critères d’échec et les conditions de publication. Publier les métriques, exemples, limites et empreintes sans inclure de données dont la redistribution n’est pas permise.

Tant qu’une source conforme et ces seuils ne sont pas convenus, l’état produit reste `unavailable`, sans poids, décodeur ni action « Modèle maison » activable. La recette jouet de `scripts/model-training/` ne satisfait aucun de ces critères.
