# Maquette — onglet « Créer » (Song Maker)

Réf. : issue azerothl/song-maker#131. Maquette statique, **rien n’est commité ni poussé**.

## Fichiers
- `index.html` : maquette autonome (HTML + CSS, un peu de JS pour le compteur, Ctrl+Entrée et les flèches des onglets).
- `render.py` : rendu Playwright/Chromium (même approche que `../songmaker-mockup/render.py`) ; affiche aussi un contrôle de visibilité sans défilement.
- `creer-1280x720.png`, `creer-1600x900.png`, `creer-800x700-une-colonne.png` : rendus.

## Valeurs d’exemple
Toutes les valeurs (« test 3 », texte de style, paroles, 392/1000) sont des **exemples** : pastille jaune « exemple » sur chaque champ, préfixe « Exemple : » / « (exemple) » dans les textes, badge « Maquette · valeurs d’exemple » en en-tête.

## Décisions de design
- **Langage visuel repris** de `songmaker-mockup` : mêmes tokens (`--line2 #7A6EA1`, `--purple-btn #805CDF`, survol `#6A3FD9`), Fraunces pour les titres, Inter pour l’interface, fond sombre à halos violets. Barre latérale + en-tête + onglets Créer | Partition | Production | Versions.
- **Deux colonnes** (1,45fr / 1fr), largeur de contenu max. 1200 px, centrée. Gauche = texte (Nom, Style et ambiance, Paroles) ; droite = réglages.
- **Paroles remplit la hauteur restante** (flex:1) ; Style a une hauteur fixe (112 px) pour laisser la place aux paroles.
- **« Générer » épinglé en bas de la colonne droite** (`margin-top:auto`), avec l’indication « Ctrl+Entrée » dessous ; c’est le seul bouton plein (violet), donc action principale évidente.
- **Style, Paroles et Générer visibles sans défilement à 1280×720** (vérifié par `render.py` : Style 234–346 px, Paroles 409–676 px, Générer 624–676 px pour 720 px de haut).
- **Réglages facultatifs** : groupe `<details>` replié par défaut, pour ne pas surcharger l’écran.
- **Statut** « Un ABC validé sera envoyé avec cette génération. » : encart discret vert, non bloquant.
- **Sous 900 px** : une seule colonne (texte puis réglages), barre latérale réduite aux icônes, bouton « Générer » collant (`sticky`) en bas pour rester atteignable ; le contenu défile.

## Accessibilité
- **Contraste AA** (calculé) : texte `#F3F0FA` sur `#221E2C` = 14,5:1 ; texte secondaire `#BDB6CF` sur `#221E2C` = 8,3:1 ; blanc sur bouton `#805CDF` = 4,65:1 et sur survol `#6A3FD9` = 6,3:1 ; anneau de focus `#FFD76A` sur `#221E2C` = 11,8:1. Bordure des champs `#7A6EA1` sur fond de page `#141218` = 4,05:1 (≥ 3:1 requis pour les composants d’interface).
- **Cibles ≥ 44 px** : champ Nom 44, onglets 44, entrées de menu 44, case « Mode instrumental » 44, résumé du groupe facultatif 48, « Générer » 52.
- **Focus visible** : anneau jaune 3 px (`:focus-visible`) sur boutons, liens, champs, onglets et résumé ; la bordure des champs passe aussi en jaune. « Générer » est montré en état focus sur les rendus (démo).
- **Ordre de tabulation = ordre visuel** : DOM dans l’ordre gauche puis droite (Nom → Style → Paroles → Mode instrumental → Réglages facultatifs → Générer), sans `tabindex` positif. À 1 colonne, même ordre.
- **Libellés** : chaque champ a un `<label for>` ; compteur et aides reliés par `aria-describedby` ; description de la case reliée aussi ; statut en `role="status"`.
- **Onglets** : `role="tablist"/"tab"/"tabpanel"`, `aria-selected`, flèches gauche/droite.
- **Raccourci** : Ctrl+Entrée déclare `aria-keyshortcuts` et reste affiché en texte (pas uniquement au survol).
- L’état n’est jamais porté par la couleur seule (icône ✓ + texte pour le statut) ; `prefers-reduced-motion` respecté.

## Points ouverts
- Le contenu des « Réglages facultatifs » (durée, graine, variantes…) est un simple espace réservé, à confirmer.
- Comportement du bouton « Générer » quand Style est vide ou quand un ABC n’est pas validé : non maquetté.
