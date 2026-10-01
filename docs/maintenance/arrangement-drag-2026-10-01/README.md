# Glisser les drapeaux de la règle — 1 octobre 2026

Refs #227, #230. Les marqueurs et les tempos ultérieurs se déplacent horizontalement avec la souris, sur la grille courante, dans les bornes de la règle. Le tempo initial reste fixe. Échap et pointercancel rétablissent le mix initial du geste. Le glissement ne déclenche pas l'ouverture du popover ; un clic simple la conserve. Les fonctions clavier et numériques restent disponibles.

Les mises à jour de marqueur conservent l'option existante de déplacement des clips, calculée depuis le mix au début du geste. Déplacer un tempo ne réécrit aucun clip ni décalage de source. Les écouteurs de geste sont retirés à la fin et au démontage.

Validation : 427 tests réussis et compilation réussie. Un test de comportement déplace un marqueur, annule par Échap, vérifie le retour exact à sa position initiale, puis déplace un tempo et vérifie le maintien du premier tempo et des données de clips. Les tests de clavier/borne/suppression restent verts.

Validation native Tauri 1282×832 : marqueur Couplet du morceau synthétique déplacé de 30000 à 25875 ms. Lecture du mix sauvegardé : clips inchangés (2000/10000/0, 12000/5000/0, 17000/5000/5000 : début/durée/offset en ms). Capture native-marker-drag.jpg. Aucun projet personnel modifié.

Limites : tempo glissé et annulation Échap vérifiés dans le navigateur, pas dans la fenêtre native. Pas de tactile réel, lecteur d'écran ou capture native à 640 px. Les collisions de drapeaux voisins et la visibilité des commandes d'ajout lors du zoom horizontal restent à examiner pour #227.
