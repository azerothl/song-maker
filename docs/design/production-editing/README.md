# Palette et zones de la timeline

La palette expose Sélection, Découper et Fondu avec les raccourcis 1/2/3. Les flèches de la palette changent l’outil et le focus. La découpe par clic respecte l’aimantation ; le bouton utilise la position de lecture à l’intérieur du clip, sinon son milieu. Les champs de déplacement, rognage et fondus en ms restent accessibles au clavier.

Tempo et Marqueurs disposent de zones distinctes sur le même axe que les clips. Leurs panneaux conservent les fonctions existantes : carte de tempo, type et nom du marqueur, position, déplacement associé des clips, navigation et suppression. Échap rend le focus au bouton déclencheur. La règle et les zones restent visibles lors du défilement des pistes.

Mesuré : tests navigateur de clavier, découpe et sélection, saisie des fondus, ouverture et fermeture des panneaux, retour du focus. Les six captures 1280×720 et 640×720 utilisent les vrais composants React avec des pistes de démonstration. `captures/metrics.json` contient les rectangles et les empreintes des images.

Non testé : fenêtre Tauri, lecteur d’écran, tactile réel, écoute du résultat audio, campagne de mutations. Le mix et la timeline de clips restent deux sections de la page commune ; leur axe graphique n’est pas encore fusionné. Refs #227, #228 : livraison partielle.
