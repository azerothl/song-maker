# Commandes communes de tempo et de marqueurs — 1 octobre 2026

Refs #227, #230, #223. Livraison partielle, sans fermeture de ces tickets.

Les deux boutons du bandeau d'arrangement sont remplacés par un bouton + dans chaque zone. Les popovers conservent le BPM, la position en ms, la liste des tempos, les noms/types/positions des marqueurs, leur navigation, le déplacement optionnel des clips et le marqueur au début du clip. Un espace de 52 px à droite de la timeline empêche les boutons de recouvrir le marqueur de fin ; l'axe des pistes, de la règle et de la courbe reste commun.

Un changement de tempo à t > 0 peut être déplacé avec les flèches (pas courant) ou Maj+flèche (50 ms). Le tempo initial ne se déplace ni ne se supprime. Suppr/Retour arrière supprime un tempo ultérieur et rend le focus au bouton +. Un déplacement remplace l'événement à une même position, sans modifier les clips ni leurs sources. Le focus suit le drapeau déplacé.

Tests ciblés : protection du tempo initial, déplacement fin et retour de focus, suppression et retour au +, conservation exacte des données de clips. Les tests existants de bornes BPM, remplacement sans doublon, marqueurs, règle, alignement et popovers sont adaptés aux nouveaux points d'entrée.

Observation native : Tauri 1282×832, morceau synthétique. Les boutons + sont visibles, séparés du drapeau Couplet situé en fin de règle. Le + Tempo ouvre les champs BPM/À (ms). Échap ferme le panneau et remet le focus au +. Capture native-zones.jpg.

Limites : glisser un drapeau de tempo/marqueur à la souris reste à livrer. Les boutons d'ajout suivent horizontalement la timeline zoomée. La hauteur et la densité complète demandées par #227, les captures FR/EN à 640 px, le tactile réel et les lecteurs d'écran restent à vérifier. Les preuves native et navigateur sont distinctes.
