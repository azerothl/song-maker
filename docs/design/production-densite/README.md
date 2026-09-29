# Maquette — onglet « Production » (densité) — v2 corrigée

Maquette statique, **rien n’est commité ni poussé**, aucune écriture GitHub. **Toutes les valeurs (pistes, niveaux, durées, mesures en px) sont des exemples** issus de cette maquette à 1280×720 ; elles ne sont pas mesurées sur l’application réelle.

## Correction d’une erreur de la version précédente
- **Erreur** : la v1 annonçait « M/S empilés, 2 × 14 px = 28 px » et validait la cible sur la **paire** (28 px). C’était **faux** : la capture de l’application réelle montre des boutons M/S de 14 px de haut, en fines bandes, illisibles et difficiles à viser.
- **Critère corrigé** : la taille se juge **par bouton**, pas pour la paire. Désormais M et S sont **côte à côte** (flex en ligne, écart 4 px) et chaque bouton mesure **≥ 28×28 px en compact** et **≥ 32×32 px en confortable** (mesuré, voir ci-dessous).
- Autres défauts de la v1 corrigés : boutons rotatifs qui remplissaient toute la hauteur de ligne, en-têtes de groupe trop fins sur la capture de l’application réelle (ici fixés à 24 px, texte ≥ 12 px), colonne « Piste » trop étroite (« Accompagn… »), densité compacte forcée même avec 6 pistes.

## Fichiers
- `index.html` : maquette autonome (HTML + CSS + JS : densité Auto/Compact/Confortable, groupes repliables, M/S, boutons rotatifs clavier/souris, info-bulle, popovers). Démo : boutons « 6 pistes / 12 pistes / 16 pistes » en haut à droite, ou par l’adresse : `index.html#6`, `#12` (défaut), `#16` ; ajouter `,compact` ou `,confortable` pour forcer la densité (ex. `#12,compact`). `#six` reste accepté (= `#6`).
- `render.py` : rendu Playwright/Chromium **et mesures JS `getBoundingClientRect`** ; écrit `metrics.json`, les PNG et le zoom annoté (Pillow).
- `metrics.json` : toutes les mesures (tailles M/S, boutons rotatifs et marges, hauteurs de ligne, lignes entièrement visibles, en-têtes de groupe, colonne nom, contrôles clavier, critères OK/KO).
- `production-compact-1280x720.png` : 12 pistes, compact forcé (Rythmique replié, focus clavier sur le gain de « Chœurs »).
- `production-confortable-1280x720.png` : 12 pistes, confortable forcé (le choix manuel l’emporte sur Auto ; la liste défile).
- `production-6pistes-auto-1280x720.png` : 6 pistes, Auto → **confortable** (72 px), rien ne déborde.
- `production-16pistes-auto-1280x720.png` : 16 pistes, Auto → **compact** (44 px), la liste défile.
- `production-zoom-ms.png` : zoom ×3 d’une ligne (« Chœurs », muette) en compact et en confortable, avec cotes mesurées (M/S, boutons rotatifs, marges, hauteur de ligne).
- `production-tooltip.png`, `production-assistant-popin.png` : régénérés avec la nouvelle mise en page.

## Valeurs mesurées (exemples, Chromium, 1280×720, `metrics.json`)
| Élément | Compact | Confortable |
|---|---|---|
| Hauteur de ligne | 44 px | 72 px |
| Bouton Muet / Solo (chacun) | 28×28 px | 32×32 px |
| Écart M–S (même ligne) | 4 px | 4 px |
| Largeur de la paire M+S | 60 px | 68 px |
| Bouton rotatif (gain, pan) | 36×36 px | 44×44 px |
| Marge verticale haut / bas du bouton rotatif | 4 / 4 px | 14 / 14 px |
| Colonne « Piste » (bande couleur + nom) | 192 px | 192 px |
| En-tête de groupe | 24 px, texte 13 px (compte 12 px) | 24 px |

Note colonne « Piste » : 192 px de colonne (bande couleur de 5 px, écart 8 px, retrait de 14 px pour les pistes de groupe) ; « Accompagnement » et « Guitare rythmique * » tiennent sans troncature (`accompagnement_fits`, `guitare_rythmique_fits` = vrai). Une info-bulle `title` (nom complet) n’est posée que si le nom est réellement tronqué (aucun cas dans les jeux d’exemple).

En-têtes de groupe (24 px) : le bouton chevron/nom fait 22 px de haut visible avec une zone cliquable étendue à 26 px ; il reste activable au clavier (Tab, Entrée/Espace, `aria-expanded` — vérifié dans `render.py`). Les M/S de groupe sont dessinés 28×22 px (l’en-tête ne permet pas 28 px de haut) avec une zone cliquable de 28×30 px : **seule exception à « ≥ 28×28 » visible**, à signaler.

### Lignes entièrement visibles à 1280×720 (12 pistes, compact)
- **9 lignes de pistes entièrement visibles** avec les 12 pistes, **groupe Rythmique déplié** (cas défavorable : la liste défile, 3 en-têtes de groupe visibles). Avec Rythmique replié, 9 lignes sont aussi visibles et rien ne défile. Critère « ≥ 8 lignes » : **atteint (9)**, sans réduire les boutons.
- Réglage de la « chrome » pour y arriver (pas des boutons) : bande master 60 px au lieu de 64, barre latérale 184 px au lieu de 208 px, marges du contenu réduites, en-tête de colonnes 24 px, barre d’outils sur une seule ligne (46 px).
- En confortable forcé avec 12 pistes : **6 lignes** entièrement visibles (défilement) ; en 16 pistes forcé en confortable : 6 aussi.
- 16 pistes en Auto (compact) : 9 lignes visibles, le reste par défilement.

## Règle de densité automatique
- Le contrôle segmenté de la barre d’outils a trois options : **Auto** (défaut) / Compact / Confortable (`aria-pressed` + coche ✓ sur l’actif).
- **Auto** : la liste démarre en **confortable (72 px)** ; si elle ne tient pas dans la hauteur disponible (`scrollHeight > clientHeight`), elle passe en **compact (44 px)**. Recalculé au chargement, au redimensionnement et quand on plie/déplie un groupe. Un texte « Densité auto → confortable/compact » indique l’état courant.
- **6 pistes ou moins** : tient en confortable, donc reste à 72 px (rendu `production-6pistes-auto`).
- **Choix manuel** (Compact ou Confortable) : prend le pas sur Auto, sans recalcul, jusqu’à un clic sur Auto.
- Limite : c’est un seuil de **débordement**, pas un nombre de pistes fixe ; avec 12 pistes et Rythmique replié, la liste tient tout juste en compact (rien ne défile) mais déborde en confortable.

## Valeurs d’exemple
Pistes, niveaux, durée 7:24, « Enregistré à 14:42 », suggestions de l’assistant, mesures : tout est **exemple**. Badge « Maquette · valeurs d’exemple » dans l’en-tête, pastille jaune « exemple » sur la bande master et le titre des popovers. Les jeux 6 / 12 / 16 pistes sont inventés (« Accompagnement », « Grosse caisse », etc.).

## Décisions de design
- **Langage visuel repris** de `songmaker-mockup-creer` : tokens (`--line2 #7A6EA1`, `--purple-btn #805CDF`), Fraunces/Inter, barre latérale, onglets Créer | Partition | Production | Versions.
- **Bande master collante** (52 px) : Lecture, temps, seule forme d’onde du morceau entier, gain master. En-tête de colonnes collant juste dessous ; la barre d’outils défile avec la liste.
- **Ligne compacte = 44 px** : bande de couleur + nom | bouton gain 36 px + valeur | bouton pan 36 px + valeur | M/S côte à côte | forme d’onde. **Confortable = 72 px** : boutons rotatifs 44 px, M/S 32 px, forme d’onde 58 px. Le filet de bas de ligne est en ombre interne pour que la hauteur soit exactement 44 / 72 px.
- **M / S** : `aria-pressed` + fond plein + lettre soulignée + bordure blanche (pas la couleur seule). Libellés conservés : « Muet : Chœurs », « Solo : Voix lead ». Piste en sourdine : forme d’onde hachurée, atténuée, pastille « Muet ». Piste coupée implicitement par un solo : hachurée aussi.
- **Groupes** : chevron (`aria-expanded`, `aria-controls`), nombre de pistes, M/S de groupe. Groupe replié : résumé texte des pistes masquées.
- **« Estimé * »**, **Assistant de mix / Copilote** (popovers non bloquants), **Outils** : inchangés par rapport à la v1.
- Le sélecteur « Démo : 6 / 12 / 16 pistes » (en-tête) est un outil de maquette, pas une fonction du produit.

## Accessibilité
- **Contrastes AA (calculés)** : texte `#F3F0FA` sur fond ≥ 14:1 ; secondaire `#BDB6CF` sur `#171320` 9,4:1 ; blanc sur `#805CDF` 4,65:1 ; lettre M/S actif `#1A1424` sur ambre 10,2:1 et sur turquoise 10,4:1 ; formes d’onde 8,0–13,2:1 sur `#171320` ; bordures de composants `#7A6EA1` sur `#141218` 4,05:1 (≥ 3:1). Exception voulue : forme d’onde d’une piste en sourdine (état désactivé, doublé par le hachurage et le texte « Muet »).
- **Focus visible** : anneau jaune `#FFD76A` 3 px (2 px sur M/S) sur tous les contrôles ; le bouton gain de « Chœurs » (compact) et « Assistant de mix » (popover) sont montrés en focus sur les rendus.
- **Cibles** : boutons principaux/secondaires de la barre d’outils et Lecture = **44 px** (mesuré). M/S = 28×28 px (compact) / 32×32 px (confortable) **par bouton** ; boutons rotatifs 36 px (compact) / 44 px (confortable). Les cibles restent < 44 px en compact : compensé par le **clavier** (flèches, Maj = grand pas, Début/Fin, Suppr = réinitialiser) et par des `aria-label` complets (« Muet : Voix lead »).
- Boutons rotatifs = `role="slider"` avec `aria-valuetext` en français (« moins 3,0 décibels », « gauche 20 »).
- Ordre de tabulation = ordre visuel : onglets → Lecture → position → gain master → outils → pistes (nom, gain, pan, M, S) ; aucun `tabindex` positif.
- Les couleurs de piste sont décoratives : le nom est toujours en texte ; « stem expérimental » ajouté pour lecteurs d’écran.

## Points ouverts / inventés
- Noms de pistes, plages de gain (−24…+6 dB) et de pan (G/D 100), pas de réglage : inventés.
- « Copilote de production » : contenu du popover (champ + 3 idées) inventé.
- Les M/S de 28 / 32 px ne respectent pas 44 px : à valider avec de vrais utilisateurs, ou offrir un raccourci M/S au clavier sur la ligne sélectionnée.
- Sous 1100 px de large, la barre d’outils devrait passer à 2 lignes : non maquetté.
