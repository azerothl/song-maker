# Maquette — onglet « Production » (densité)

Maquette statique, **rien n’est commité ni poussé**, aucune écriture GitHub.

## Fichiers
- `index.html` : maquette autonome (HTML + CSS + un peu de JS : densité, groupes repliables, M/S, boutons rotatifs au clavier/souris, info-bulle, popovers). `index.html#six` charge le jeu de 6 pistes (utilisé pour le rendu « confortable »).
- `render.py` : rendu Playwright/Chromium (même approche que `../songmaker-mockup-creer/render.py`) ; affiche aussi hauteur de ligne, nombre de lignes entièrement visibles et hauteur des boutons.
- `production-compact-1280x720.png` : 12 pistes d’exemple, 3 groupes (Rythmique replié), ligne 48 px — **8 pistes entièrement visibles** + groupes.
- `production-confortable-1280x720.png` : variante 72 px, 6 pistes (2 groupes + 2 pistes libres).
- `production-tooltip.png` : info-bulle « Estimé * » (fuites, phases, stems piano/guitare expérimentaux).
- `production-assistant-popin.png` : popover « Assistant de mix » ouvert (non bloquant).
- `captures-react/` : **captures de l’app React réelle** (Vite + Playwright), distinctes de la maquette HTML ci-dessus.

## Valeurs d’exemple
Pistes, niveaux, durée 7:24, « Enregistré à 14:42 », suggestions de l’assistant : tout est **exemple**. Badge « Maquette · valeurs d’exemple » dans l’en-tête, pastille jaune « exemple » sur la bande master et le titre des popovers.

## Décisions de design
- **Langage visuel repris** de `songmaker-mockup-creer` : tokens (`--line2 #7A6EA1`, `--purple-btn #805CDF`, survol `#6A3FD9`), Fraunces/Inter, halos violets, barre latérale Bibliothèque/Nouveau/Paramètres, onglets Créer | Partition | Production | Versions.
- **Bande master collante** (52 px) tout en haut du contenu : Lecture, temps `0:00 / 7:24`, **seule forme d’onde du morceau entier**, gain master. La ligne d’en-tête des colonnes est collante juste dessous ; **la barre d’outils défile avec la liste**, pour gagner de la hauteur (compromis : les outils disparaissent quand on défile).
- **Ligne compacte = 48 px** (variable `--row-h`) : bande de couleur + nom | bouton gain + « −3,0 dB » | bouton pan + « C » / « G 20 » / « D 10 » | M/S empilés | forme d’onde sur toute la largeur restante. Gain et pan sont **avant** la forme d’onde. Colonnes alignées par une grille commune avec l’en-tête.
- **Confortable = 72 px** : boutons rotatifs 42 px, M/S 26 px chacun, forme d’onde 58 px.
- **Formes d’onde plus claires** (couleurs 8:1 à 13:1 sur `#171320`), fond de piste `#171320`.
- **M / S empilés** (2 × 14 px = 28 px en compact ; 2 × 26 px en confortable). État actionné = `aria-pressed="true"` **et** fond plein + lettre soulignée + bordure blanche (pas la couleur seule). Piste en sourdine : forme d’onde hachurée, atténuée, pastille « Muet ». Piste implicitement coupée par un solo : hachurée aussi.
- **Groupes** Voix / Rythmique / Harmonie : en-tête 32 px avec chevron (`aria-expanded`, `aria-controls`), nombre de pistes, M/S du groupe. Groupe replié (Rythmique) : résumé « Groupe replié — 3 pistes masquées (…) » en texte, pour qu’on sache ce qui est caché.
- **Bascule Compact / Confortable** : groupe de deux boutons `aria-pressed` avec coche ✓ sur l’actif.
- **« Estimé * »** près du titre « Pistes » (bouton focusable, `aria-describedby`) ; l’astérisque est répété sur les pistes concernées (Guitare, Piano). Info-bulle ouverte au survol, au focus et au clic ; fermée par Échap (WCAG 1.4.13).
- **Assistant de mix / Copilote de production** : boutons secondaires ouvrant un **popover non bloquant** (`role="dialog"` `aria-modal="false"`, pas de voile, la liste reste défilable et réglable, Échap ferme et rend le focus au bouton). Chaque suggestion a un bouton « Appliquer » qui règle réellement le bouton de la piste dans la maquette.
- **Outils** : « Séparer à nouveau… » (secondaire) et « Exporter les pistes » (plein, seule action primaire). « Enregistré à 14:42 » en haut à droite avec ✓ + texte (`role="status"`).

## Accessibilité
- **Contrastes AA (calculés)** : texte `#F3F0FA` sur fond ≥ 14:1 ; secondaire `#BDB6CF` sur `#171320` 9,4:1 ; blanc sur `#805CDF` 4,65:1 ; lettre M/S actif `#1A1424` sur ambre 10,2:1 et sur turquoise 10,4:1 ; formes d’onde 8,0–13,2:1 sur `#171320` ; bordures de composants `#7A6EA1` sur `#141218` 4,05:1 (≥ 3:1). Exception voulue : forme d’onde d’une piste en sourdine (état désactivé, doublé par le hachurage et le texte « Muet »).
- **Focus visible** : anneau jaune `#FFD76A` 3 px (2 px sur M/S) sur tous les contrôles ; le bouton gain de « Chœurs » (compact) et « Assistant de mix » (popover) sont montrés en focus sur les rendus.
- **Cibles** : boutons principaux/secondaires de la barre d’outils et Lecture = **44 px** (mesuré). Exception assumée et demandée : M/S (28 px empilés) et boutons rotatifs 30 px en compact — compensée par le **clavier** (flèches, Maj = grand pas, Début/Fin, Suppr = réinitialiser) et par des `aria-label` complets (« Muet — Voix lead »).
- Boutons rotatifs = `role="slider"` avec `aria-valuetext` en français (« moins 3,0 décibels », « gauche 20 »).
- Ordre de tabulation = ordre visuel : onglets → Lecture → position → gain master → outils → pistes (nom, gain, pan, M, S) ; aucun `tabindex` positif.
- Les couleurs de piste sont décoratives : le nom est toujours en texte ; « stem expérimental » ajouté pour lecteurs d’écran.

## Points ouverts / inventés
- Noms de pistes, plages de gain (−24…+6 dB) et de pan (G/D 100), pas de réglage : inventés.
- « Copilote de production » : contenu du popover (champ + 3 idées) inventé.
- Les M/S de 28 px ne respectent pas 44 px : à valider avec de vrais utilisateurs, ou offrir un raccourci M/S au clavier sur la ligne sélectionnée.
- Ligne compacte à 1280×720 : 8 pistes complètes visibles avec Rythmique replié ; groupe déplié = 6 lignes de moins visibles.
- Sous 1100 px de large, la barre d’outils devrait passer à 2 lignes : non maquetté.
