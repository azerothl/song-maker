# Édition des clips — 1 octobre 2026

## Palette

L'outil actif est indiqué par une coche et un soulignement, en plus du contour et de `aria-pressed`. La coche est masquée aux technologies d'assistance ; les noms accessibles restent Sélection / Découper / Fondu, ou Select / Split / Fade. Les boutons gardent une hauteur et une largeur minimales de 44 px, et un seul arrêt de tabulation. Les flèches et Début/Fin changent l'outil et le focus.

Les douze captures de `captures-react` couvrent les trois outils, en FR/EN, à 1280×720 et 640×720. Elles montent le vrai composant de Production avec des données synthétiques. Leurs mesures vérifient une seule sélection, la coche, le soulignement, les cibles et « Split ». Elles ne prouvent pas une traduction exhaustive de toute la page : des libellés voisins restent en français.

## Parcours natif

Dans Tauri Windows, sur un projet créé pour cet audit et un WAV synthétique de 12 s :

1. Début du clip saisi à 2 000 ms ; fondus d'entrée/sortie à 500/750 ms.
2. Durée rognée à 10 000 ms, offset source conservé à 0.
3. Duplication : nouveau clip à 12 000 ms, durée 10 000 ms, mêmes fondus, sélection sur le duplicata.
4. Découpe du duplicata par le bouton : deux moitiés de 5 000 ms, début de la seconde à 17 000 ms et offset source à 5 000 ms ; seconde moitié sélectionnée.
5. Annuler : deux clips retrouvés dans le JSON sauvegardé ; rétablir : trois clips retrouvés, avec les mêmes valeurs.
6. Retour à la bibliothèque puis réouverture du projet : les trois clips sont rechargés aux positions et durées attendues, avec une durée totale de 22 s (`native-reopened.jpg`).

La source normalisée garde son SHA256 initial. `native-edit-metrics.json` reprend les valeurs sauvegardées et l'empreinte de la source. `native-selected-after-redo.jpg` (1282×832) montre la sélection, les valeurs en ms et la nouvelle coche.

## Limites

Validation logicielle de ce lot : 421 tests passent et la compilation de production réussit.

Contribution partielle à #228 : pas de fermeture. Les boutons de déplacement, les boutons de fondu, la revue exhaustive de l'inspecteur et des gestes souris, les annonces d'édition et les captures natives à 640 px restent à couvrir. Aucun test d'écoute comparative n'a été réalisé. Les captures de palette sont des preuves React/Chromium, distinctes du parcours natif décrit ci-dessus.
