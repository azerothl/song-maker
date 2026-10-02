# Palette et zones de la timeline

La palette expose Sélection, Découper, Fondu et Marqueur (V/C/F/M). Les zones **Tempo** et **Marqueurs** (libellés `production.lane.*`, jamais « voie ») sont posées sous la règle, même axe que les clips. Unité : **ms**.

## Décisions « à trancher » — défauts consignés (2026-10-02)

Inférés depuis la maquette / produit existant, faute de Pascal/Loïc :

| Sujet | Décision |
|-------|----------|
| Nom libre des marqueurs | **Conservé** |
| Case « déplacer les clips avec le marqueur » | **Conservée** (défaut coché) |
| Position numérique marqueur | **Conservée** (ms entiers) |
| Champ BPM « À (ms) » | **Conservé** (ms entiers) |
| Format décimal affiché | FR virgule / EN point (`formatMs` / `formatMsForClipLabel`) |

Les panneaux conservent carte de tempo (titre popover), type/nom, navigation et suppression. Échap rend le focus au bouton déclencheur. Sticky règle/zones au défilement vertical.

Mesuré : tests navigateur (`arrangementInteractions.behavior.test.ts`, dont FR Tempo/Marqueurs + `0:12,3`) et `productionTempoMarkersFormat.test.ts`.

Non testé : fenêtre Tauri, lecteur d’écran, tactile réel, écoute audio, campagne de mutations complète.

Refs #227.
