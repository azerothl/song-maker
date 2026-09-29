# Contrastes WCAG 2.2 — maquette Song Maker (thème sombre, premier lancement)

Fichier audité : `/workspace/songmaker-mockup/index.html` (états A, B, C et fiche D), rendu Chrome headless 1280×720.
Date : 29/09/2026 (Europe/Paris).

## Méthode

- Playwright (Chromium headless, même configuration que `render.py`). Pour **chaque nœud de texte visible** : couleur calculée (`getComputedStyle().color`, alpha fondu), taille et graisse calculées.
- Fond effectif : capture d'écran avec le texte rendu transparent, puis lecture de **tous les pixels réels derrière chaque ligne de texte** (dégradés, fonds semi-transparents et empilement des ancêtres inclus) ; on retient le pire ratio du nœud.
- Ratio = formule WCAG 2.x de luminance relative : (L1 + 0,05) / (L2 + 0,05).
- Seuils : texte normal 4,5:1 ; grand texte (≥ 24 px, ou ≥ 18,66 px en gras) 3:1 ; éléments d'interface non textuels (bordures de contrôles, anneau de focus, remplissage de barre vs piste, icônes porteuses de sens) 3:1 (1.4.11).
- Composants d'interface : couleurs lues dans le CSS calculé (fond, bordure, outline, `accent-color`) et vérifiées sur pixels ; fond = fond visible autour du composant (élément masqué).
- Grille de contrôle complémentaire (checklist du skill accessibilité) : états non uniquement en couleur, focus visible, taille des cibles.

## Résultat

- **Paires texte/fond mesurées : 163 nœuds de texte, soit 44 couples de couleurs uniques** — 0 KO.
- **Composants d'interface / fond : 35 paires** dont 26 exigées (contrôles, focus, barres, icônes porteuses de sens) et 9 indicatives (bordures décoratives de cartes, doublées par du texte ou un contrôle natif).
- **Échecs avant correction : 12 paires d'interface exigées** (A1, B1-B4, B6, C2, C5-C7, C9, C11), 0 pour le texte. **Après correction : 0 KO.**

## 1. Texte (couples uniques ; annexe = détail des 163 nœuds)

| Élément(s) (exemple) | Écrans | Couleurs (texte / fond) | Ratio | Seuil | Verdict |
|---|---|---|---|---|---|
| « Télécharger (8,5 Go) » (16 px/700); « Continuer sans génération » (15 px/700) (+8 autres) | ABCD | `#FFFFFF` / `#805CDF` | 4.65:1 | 4.5:1 | OK |
| « ! » (20 px/900) | B | `#2A0D10` / `#FF6B6B` | 6.50:1 | 3:1 | OK |
| « ! » (18 px/900) | C | `#2A0D10` / `#FF6B6B` | 6.50:1 | 4.5:1 | OK |
| « Plus exigeant » (11.5 px/700) | A | `#BDB6CF` / `#2F2A3D` | 7.08:1 | 4.5:1 | OK |
| « Recommandé pour cet ordinate… » (13.5 px/600) | A | `#BDB6CF` / `#2D264F` | 7.16:1 | 4.5:1 | OK |
| « VRAM utilisée ≈ 9 / 12 Go » (12 px/400); « Option 3 · Disponible tout d… » (13 px/400) (+3 autres) | AB | `#BDB6CF` / `#2C2650` | 7.17:1 | 4.5:1 | OK |
| « Compatible avec la génératio… » (12.5 px/400) | A | `#BDB6CF` / `#1F2D2F` | 7.29:1 | 4.5:1 | OK |
| « Ce qui sera téléchargé » (13.5 px/600); « Moteur audio, VAE, HTDemucs » (13.5 px/400) (+32 autres) | ABCD | `#BDB6CF` / `#2A2536` | 7.59:1 | 4.5:1 | OK |
| « Modèle de génération » (12 px/400); « / 7,2 Go · 43 % » (12.5 px/400) (+3 autres) | C | `#BDB6CF` / `#2F2130` | 7.79:1 | 4.5:1 | OK |
| « ▣ » (20 px/400) | A | `#5ED8C9` / `#12332F` | 7.88:1 | 4.5:1 | OK |
| « Nous avons analysé votre ord… » (14.5 px/400); « Choisissez comment vous souh… » (14.5 px/400) (+2 autres) | ABC | `#BDB6CF` / `#221E2C` | 8.34:1 | 4.5:1 | OK |
| « Vous pourrez changer de modè… » (12 px/400) | A | `#BDB6CF` / `#201C2A` | 8.53:1 | 4.5:1 | OK |
| « Total : » (13 px/400); « reçus sur 8,5 Go (41 %) » (13 px/400) (+2 autres) | C | `#BDB6CF` / `#201C29` | 8.54:1 | 4.5:1 | OK |
| « Norman · Retour d’informatio… » (13 px/600); « Norman · Affordances et cont… » (13 px/600) (+4 autres) | D | `#5ED8C9` / `#2A2536` | 8.57:1 | 4.5:1 | OK |
| « Reprise automatique si la co… » (12 px/400); « Aucun modèle lourd ne sera t… » (12.5 px/400) (+3 autres) | ABC | `#BDB6CF` / `#1F1B28` | 8.63:1 | 4.5:1 | OK |
| « ✓ » (12.5 px/600); « Carte graphique détectée » (12.5 px/600) (+1 autres) | A | `#7FE0A1` / `#1F2D2F` | 8.87:1 | 4.5:1 | OK |
| « contrastes ≥ 4,5:1 (texte) s… » (12.5 px/400); « progressbar » (12.5 px/400) (+2 autres) | D | `#BDB6CF` / `#1C1826` | 8.90:1 | 4.5:1 | OK |
| « ⚠ » (13 px/700); « Interrompu » (13 px/700) (+1 autres) | C | `#FFB4A8` / `#2F2130` | 8.94:1 | 4.5:1 | OK |
| « CC BY-NC 4.0 » (13.5 px/400) | A | `#C4B2FF` / `#1F1B28` | 8.96:1 | 4.5:1 | OK |
| « Toutes les valeurs (GPU, tai… » (12 px/400) | D | `#BDB6CF` / `#1C1725` | 8.97:1 | 4.5:1 | OK |
| « Bonne qualité, génération pl… » (13 px/400); « Utilisez la » (13 px/400) (+5 autres) | AB | `#D6CDF0` / `#2C2650` | 9.23:1 | 4.5:1 | OK |
| « ✓ » (13 px/700); « Terminé » (13 px/700) (+1 autres) | C | `#7FE0A1` / `#2A2536` | 9.23:1 | 4.5:1 | OK |
| « Première installation » (15 px/600) (+3 autres) | ABCD | `#5ED8C9` / `#221E2C` | 9.41:1 | 4.5:1 | OK |
| « Fiche de conception » (15 px/600) | D | `#5ED8C9` / `#201B2B` | 9.69:1 | 4.5:1 | OK |
| « Détection du GPU, progressio… » (13 px/400); « texte. » (13 px/400) (+5 autres) | D | `#D7D0E8` / `#2A2536` | 9.94:1 | 4.5:1 | OK |
| « Pourquoi : il tient dans vos… » (13.5 px/400) | A | `#DCD5F0` / `#2B2449` | 10.21:1 | 4.5:1 | OK |
| « Exemple » (10.5 px/700) (+2 autres) | AB | `#1A1424` / `#E9C46A` | 10.75:1 | 4.5:1 | OK |
| « Attention : aucune carte gra… » (16 px/700); « La connexion Internet a été … » (15.5 px/700) (+2 autres) | BCD | `#FFD5CF` / `#3A1F26` | 11.16:1 | 4.5:1 | OK |
| « La génération de musique dem… » (13.5 px/400); « NVIDIA » (13.5 px/700) (+7 autres) | BC | `#F5DCD8` / `#3A1F26` | 11.48:1 | 4.5:1 | OK |
| « ★ Recommandé » (11.5 px/700) (+1 autres) | A | `#FFFFFF` / `#3A2F70` | 11.54:1 | 4.5:1 | OK |
| « Maquette · valeurs d’exemple » (11 px/400) (+2 autres) | ABC | `#E8E1FF` / `#2A2050` | 11.71:1 | 4.5:1 | OK |
| « Focus #FFD76A » (11.5 px/400) | D | `#FFD76A` / `#221E2C` | 11.77:1 | 4.5:1 | OK |
| « Q4 · Rapide et léger » (18 px/600); « 7,2 Go » (14 px/700) (+2 autres) | AB | `#F3F0FA` / `#2C2650` | 12.44:1 | 4.5:1 | OK |
| « Modèle Q4 » (20 px/600) | A | `#F3F0FA` / `#2C254C` | 12.64:1 | 4.5:1 | OK |
| « NVIDIA GeForce RTX 3060, 12 … » (15 px/700) | A | `#F3F0FA` / `#1F2D2F` | 12.65:1 | 4.5:1 | OK |
| « YuE2 est sous licence » (13.5 px/400); « : usage personnel et non com… » (13.5 px/400) (+1 autres) | A | `#E4DEF3` / `#1F1B28` | 12.88:1 | 4.5:1 | OK |
| « 1,3 Go » (13.5 px/600); « 7,2 Go » (13.5 px/600) (+23 autres) | ABCD | `#F3F0FA` / `#2A2536` | 13.17:1 | 4.5:1 | OK |
| « YuE2 (Q4) » (14.5 px/700); « 3,1 Go » (12.5 px/600) (+1 autres) | C | `#F3F0FA` / `#2F2130` | 13.51:1 | 4.5:1 | OK |
| « Préparons Song Maker » (34 px/600) (+2 autres) | ABC | `#F3F0FA` / `#221E2C` | 14.46:1 | 3:1 | OK |
| « Texte #F3F0FA / #221E2C » (11.5 px/400) | D | `#F3F0FA` / `#221E2C` | 14.46:1 | 4.5:1 | OK |
| « 3,5 Go » (13 px/700) | C | `#F3F0FA` / `#201C29` | 14.81:1 | 4.5:1 | OK |
| « Pourquoi cet écran est plus … » (30 px/600) | D | `#F3F0FA` / `#201B2B` | 14.89:1 | 3:1 | OK |
| « J’ai lu et j’accepte la lice… » (14 px/600); « Annuler et revenir au choix » (15 px/700) (+1 autres) | AC | `#F3F0FA` / `#1F1B28` | 14.98:1 | 4.5:1 | OK |
| « Accessibilité : » (12.5 px/700) | D | `#F3F0FA` / `#1C1826` | 15.44:1 | 4.5:1 | OK |

Notes : le texte du bouton principal est passé de 6,31:1 à 4,65:1 (couleur de bouton éclaircie, voir corrections) — toujours OK. Les titres H1 (34 px / 30 px) sont évalués en grand texte (3:1) et dépassent largement 14:1. Le texte le plus faible restant est `#FFF` sur `#805CDF` à 4,65:1.

## 2. Composants d'interface (non-texte, 3:1)

Colonnes « Avant » = valeurs d'origine ; « Après » = valeurs après correction.

| N° | Écran | Composant / fond | Couleurs après | Ratio avant | Ratio après | Seuil | Verdict avant | Verdict après |
|---|---|---|---|---|---|---|---|---|
| A1 | A | Bouton principal « Télécharger » : remplissage / fond de carte | `#805CDF` / `#1F1B28` | 2.67:1 | 3.62:1 | 3:1 | KO | OK |
| A2 | A | Anneau de focus 3 px « Télécharger » / fond de carte | `#FFD76A` / `#1F1B28` | 12.19:1 | 12.19:1 | 3:1 | OK | OK |
| A3 | A | Radio Q4 (cochée) : remplissage accent / fond de carte | `#FFFFFF` / `#2C2650` | 14.00:1 | 14.00:1 | 3:1 | OK | OK |
| A4 | A | Radio Q8 (non cochée) : contour natif / fond de carte | `#7D7C7D` / `#2A2536` | 3.57:1 | 3.57:1 | 3:1 | OK | OK |
| A5 | A | Case licence (cochée) : remplissage accent / fond | `#C2AEFF` / `#1E1A28` | 8.75:1 | 8.75:1 | 3:1 | OK | OK |
| A6 | A | Jauge VRAM Q4 : remplissage / piste | `#5ED8C9` / `#171320` | 10.55:1 | 10.55:1 | 3:1 | OK | OK |
| A7 | A | Jauge VRAM Q8 : remplissage / piste | `#F0B45A` / `#171320` | 9.89:1 | 9.89:1 | 3:1 | OK | OK |
| A8 | A | Icône ▣ GPU (pastille) : bordure / fond du panneau | `#2F6B62` / `#1F2D2F` | 2.31:1 | 2.31:1 | 3:1 | KO (indicatif) | KO (indicatif) |
| A9 | A | Carte modèle Q4 sélectionnée : bordure 2 px / fond | `#A58BFF` / `#221E2B` | 6.00:1 | 6.00:1 | 3:1 | OK | OK |
| A10 | A | Carte modèle Q8 : bordure 2 px / fond | `#3D3654` / `#211D2A` | 1.46:1 | 1.46:1 | 3:1 | KO (indicatif) | KO (indicatif) |
| B1 | B | Bouton secondaire « Ouvrir la page des pilotes » : bordure 2 px / fond | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| B2 | B | Bouton secondaire « Relancer la détection » : bordure 2 px / fond | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| B3 | B | Bouton secondaire « Configurer un worker » : bordure 2 px / fond | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| B4 | B | Interrupteur worker (désactivé) : bordure de la piste / fond | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| B5 | B | Interrupteur worker : pastille / piste | `#BDB6CF` / `#171320` | 9.35:1 | 9.35:1 | 3:1 | OK | OK |
| B6 | B | Bouton principal « Continuer sans génération » : remplissage / fond de carte | `#805CDF` / `#2C2650` | 2.22:1 | 3.01:1 | 3:1 | KO | OK |
| B7 | B | Anneau de focus « Continuer sans génération » / fond de carte | `#FFD76A` / `#2C2650` | 10.12:1 | 10.12:1 | 3:1 | OK | OK |
| B8 | B | Icône « ! » (disque) : remplissage / fond de l’alerte | `#FF6B6B` / `#3A1F26` | 5.39:1 | 5.39:1 | 3:1 | OK | OK |
| B9 | B | Cadre d’alerte : bordure 2 px / fond de carte | `#FF6B6B` / `#221E2C` | 5.87:1 | 5.87:1 | 3:1 | OK | OK |
| B10 | B | Carte option 3 : bordure 2 px / fond de carte | `#A58BFF` / `#211D2B` | 6.07:1 | 6.07:1 | 3:1 | OK | OK |
| C1 | C | Barre Moteur audio (100 %) : remplissage / piste | `#5ED8C9` / `#171320` | 10.55:1 | 10.55:1 | 3:1 | OK | OK |
| C2 | C | Barre Moteur audio : bordure de la piste / fond de ligne | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| C3 | C | Barre YuE2 (43 %) : hachures claires / piste | `#FF8F8F` / `#171320` | 8.33:1 | 8.33:1 | 3:1 | OK | OK |
| C4 | C | Barre YuE2 (43 %) : hachures foncées / piste | `#D95C5C` / `#171320` | 4.90:1 | 4.90:1 | 3:1 | OK | OK |
| C5 | C | Barre YuE2 : bordure de la piste / fond de ligne | `#7A6EA1` / `#2F2130` | 1.90:1 | 3.31:1 | 3:1 | KO | OK |
| C6 | C | Barre VAE (0 %, vide) : bordure de la piste / fond de ligne | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| C7 | C | Barre HTDemucs (0 %, vide) : bordure de la piste / fond de ligne | `#7A6EA1` / `#2A2536` | 1.86:1 | 3.23:1 | 3:1 | KO | OK |
| C8 | C | Icône « ! » (disque) : remplissage / fond du cadre | `#FF6B6B` / `#3A1F26` | 5.39:1 | 5.39:1 | 3:1 | OK | OK |
| C9 | C | Bouton principal « Reprendre » : remplissage / fond de carte | `#805CDF` / `#1F1B28` | 2.67:1 | 3.62:1 | 3:1 | KO | OK |
| C10 | C | Anneau de focus « Reprendre » / fond de carte | `#FFD76A` / `#1F1B28` | 12.19:1 | 12.19:1 | 3:1 | OK | OK |
| C11 | C | Bouton secondaire « Annuler et revenir » : bordure 2 px / fond de carte | `#7A6EA1` / `#1F1B28` | 2.11:1 | 3.67:1 | 3:1 | KO | OK |
| C12 | C | Ligne en erreur : bordure 2 px / fond de carte | `#FF6B6B` / `#211D2B` | 5.93:1 | 5.93:1 | 3:1 | OK | OK |
| C13 | C | Cadre d’erreur : bordure 2 px / fond de carte | `#FF6B6B` / `#1F1B29` | 6.07:1 | 6.07:1 | 3:1 | OK | OK |
| D1 | D | Pastille numérotée 1–5 : disque / fond de carte | `#805CDF` / `#2A2536` | 2.35:1 | 3.19:1 | 3:1 | KO (indicatif) | OK |
| D2 | D | Échantillon de couleur (bordure 1 px) / fond | `#7A6EA1` / `#1C1725` | 2.19:1 | 3.81:1 | 3:1 | KO (indicatif) | OK |

Lecture des lignes « indicatives » (non comptées comme échec) :
- A8 (bordure de la pastille ▣, 2,31:1) : icône décorative (`aria-hidden`), l'information est portée par le texte « Carte graphique détectée » (8,87:1).
- A10 (bordure de la carte Q8 non sélectionnée, 1,46:1) et A9/B10/C12/C13 : la sélection est portée par le contrôle radio natif (A4 : 3,57:1) et le texte ; la bordure de carte n'est pas l'unique identifiant. **Recommandation facultative** : éclaircir `--line` (`#3D3654`) pour la carte Q8 si l'on veut que la zone cliquable soit aussi repérable (non requis par 1.4.11).
- D1/D2 : éléments de la fiche de conception, pas de contrôles. D1 (pastille numérotée) passe à 3,19:1 grâce à la nouvelle couleur de bouton.
- Anneau de focus jaune `#FFD76A` (3 px, décalage 3 px) : 10,1 à 12,2:1 sur tous les fonds de carte ; contre le bouton violet adjacent il fait 4,56:1 (ancien `#6A3FD9`) et 3,4:1 (nouveau `#805CDF`) : OK.

## 3. États non signalés par la couleur seule (1.4.1)

| État | Indices non chromatiques | Verdict |
|---|---|---|
| Modèle sélectionné (A) | Radio coché (natif), pastille « ★ Recommandé » avec texte, épaisseur de bordure | OK |
| Charge VRAM Q4 vs Q8 (A) | Valeurs textuelles « ≈ 9 / 12 Go » et « ≈ 11,5 / 12 Go » ; jauge `aria-hidden` (décorative) | OK |
| GPU détecté (A) | Icône ✓ + texte « Carte graphique détectée » | OK |
| Alerte sans GPU (B) | Icône « ! » + titre « Attention : … » + texte + `role="alert"` | OK |
| Interrupteur worker (B) | Position du bouton à gauche + texte « (désactivé) » | OK |
| Terminé / Interrompu / En attente (C) | Icônes ✓ / ⚠ / ◷ + libellés texte | OK |
| Barre en erreur (C) | Hachures (motif) + libellé « Interrompu » + pourcentage 43 % ; `role="progressbar"` avec `aria-valuenow` | OK |
| Barres vide / pleine (C) | Pourcentage et octets en texte | OK |
| Focus clavier | Anneau 3 px décalé de 3 px (forme), pas seulement une teinte | OK |
| Liens | Souligné (`text-decoration:underline`) | OK |

## 4. Autres points de la checklist accessibilité (vérifiés, hors contraste)

- `lang="fr"`, un `<h1>` par écran, landmarks `<main>`, sections nommées : OK.
- Focus visible défini (`:focus-visible`, 3 px `#FFD76A`) sur boutons, liens, champs, `summary` : OK (2.4.7). Non masqué par un élément fixe : OK (2.4.11).
- Taille des cibles (2.5.8, 24 px min) : boutons 49–54 px de haut, cartes modèle 548×103, `summary` 134×26 : OK. Les cases/radios natives font 20×20 px mais l'étiquette entière est cliquable ; l'étiquette de la case de licence fait 751×20 px (hauteur 20 < 24 px, exception d'espacement probable, aucun autre contrôle dans un rayon de 24 px). **À surveiller.**
- La fiche D annonce « cibles ≥ 44 px de hauteur » : vrai pour les boutons (49–54 px) mais pas pour la case de licence (20 px) ni « Détails techniques » (26 px). Formulation à nuancer (aucun changement appliqué).
- Le texte des puces d'exemple en 11 px et les badges 10,5–11 px passent le contraste mais sont petits (lisibilité, non couvert par WCAG AA).

## 5. Corrections appliquées dans `index.html`

| Variable CSS | Ancienne valeur | Nouvelle valeur | Raison |
|---|---|---|---|
| `--line2` | `#544B73` | `#7A6EA1` | Bordures des boutons secondaires (B1-B3, C11), contour de l'interrupteur (B4), bordures des pistes de barres de progression (C2, C5-C7) : 1,7–2,1:1 → 3,2–3,7:1. Valeur minimale conservant la teinte (même H et S, luminosité augmentée) qui atteint ≥ 3:1 sur le pire fond (`#2A2536`, `#2F2130`). |
| `--purple-btn` | `#6A3FD9` | `#805CDF` | Fond des boutons principaux (A1, B6, C9) et pastilles D1 : 2,2–2,7:1 → 3,0–3,6:1 contre le fond de carte. Texte blanc dessus : 6,31:1 → 4,65:1 (OK). |
| `--purple-btn-h` (survol) | `#7B52E6` | `#6A3FD9` | L'ancien survol, plus clair que le nouveau bouton, aurait cassé le texte blanc de justesse ; on utilise l'ancienne couleur du bouton (blanc dessus : 6,31:1). |
| Échantillon fiche D (`style` inline) | `#6a3fd9` + libellé « #FFF / #6A3FD9 » | `#805cdf` + libellé « #FFF / #805CDF » | Cohérence avec le nouveau bouton. |

Les PNG ont été régénérés avec `python3 render.py` :
`etat-a-gpu-detecte.png`, `etat-b-sans-gpu.png`, `etat-c-telechargement-interrompu.png`, `fiche-d-rationale-design.png` (dans `/workspace/songmaker-mockup/`).

## Annexe — détail des 163 nœuds de texte (après correction)

| Écran | Élément | Texte | Couleurs | Taille/graisse | Ratio | Seuil | Verdict |
|---|---|---|---|---|---|---|---|
| A | `div.eyebrow` | Première installation | `#5ED8C9` / `#221E2C` | 15 px / 600 | 9.41:1 | 4.5:1 | OK |
| A | `h1` | Préparons Song Maker | `#F3F0FA` / `#221E2C` | 34 px / 600 | 14.46:1 | 3:1 | OK |
| A | `p.lead` | Nous avons analysé votre ordinateur  | `#BDB6CF` / `#221E2C` | 14.5 px / 400 | 8.34:1 | 4.5:1 | OK |
| A | `span.mockbadge` | Maquette · valeurs d’exemple | `#E8E1FF` / `#2A2050` | 11 px / 400 | 11.71:1 | 4.5:1 | OK |
| A | `div.ico` | ▣ | `#5ED8C9` / `#12332F` | 20 px / 400 | 7.88:1 | 4.5:1 | OK |
| A | `span` | ✓ | `#7FE0A1` / `#1F2D2F` | 12.5 px / 600 | 8.87:1 | 4.5:1 | OK |
| A | `span.status` | Carte graphique détectée | `#7FE0A1` / `#1F2D2F` | 12.5 px / 600 | 8.87:1 | 4.5:1 | OK |
| A | `span.tag-ex` | Exemple | `#1A1424` / `#E9C46A` | 10.5 px / 700 | 10.75:1 | 4.5:1 | OK |
| A | `b` | NVIDIA GeForce RTX 3060, 12 Go de VR | `#F3F0FA` / `#1F2D2F` | 15 px / 700 | 12.65:1 | 4.5:1 | OK |
| A | `small` | Compatible avec la génération de mus | `#BDB6CF` / `#1F2D2F` | 12.5 px / 400 | 7.29:1 | 4.5:1 | OK |
| A | `h2` | Recommandé pour cet ordinateur | `#BDB6CF` / `#2D264F` | 13.5 px / 600 | 7.16:1 | 4.5:1 | OK |
| A | `div.big` | Modèle Q4 | `#F3F0FA` / `#2C254C` | 20 px / 600 | 12.64:1 | 4.5:1 | OK |
| A | `span.chip` | ★ Recommandé | `#FFFFFF` / `#3A2F70` | 11.5 px / 700 | 11.54:1 | 4.5:1 | OK |
| A | `p` | Pourquoi : il tient dans vos 12 Go d | `#DCD5F0` / `#2B2449` | 13.5 px / 400 | 10.21:1 | 4.5:1 | OK |
| A | `h2` | Ce qui sera téléchargé | `#BDB6CF` / `#2A2536` | 13.5 px / 600 | 7.59:1 | 4.5:1 | OK |
| A | `span.tag-ex` | Exemple | `#1A1424` / `#E9C46A` | 10.5 px / 700 | 10.75:1 | 4.5:1 | OK |
| A | `dt` | Moteur audio, VAE, HTDemucs | `#BDB6CF` / `#2A2536` | 13.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| A | `dd` | 1,3 Go | `#F3F0FA` / `#2A2536` | 13.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| A | `dt` | Modèle YuE2 Q4 | `#BDB6CF` / `#2A2536` | 13.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| A | `dd` | 7,2 Go | `#F3F0FA` / `#2A2536` | 13.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| A | `dt` | Total à télécharger | `#F3F0FA` / `#2A2536` | 13.5 px / 700 | 13.17:1 | 4.5:1 | OK |
| A | `dd` | 8,5 Go | `#F3F0FA` / `#2A2536` | 13.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| A | `dt` | Durée estimée à 50 Mo/s | `#BDB6CF` / `#2A2536` | 13.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| A | `dd` | ≈ 3 min | `#F3F0FA` / `#2A2536` | 13.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| A | `b` | Q4 · Rapide et léger | `#F3F0FA` / `#2C2650` | 18 px / 600 | 12.44:1 | 4.5:1 | OK |
| A | `span.chip` | ★ Recommandé | `#FFFFFF` / `#3A2F70` | 11.5 px / 700 | 11.54:1 | 4.5:1 | OK |
| A | `span.size` | 7,2 Go | `#F3F0FA` / `#2C2650` | 14 px / 700 | 12.44:1 | 4.5:1 | OK |
| A | `p` | Bonne qualité, génération plus rapid | `#D6CDF0` / `#2C2650` | 13 px / 400 | 9.23:1 | 4.5:1 | OK |
| A | `span` | VRAM utilisée ≈ 9 / 12 Go | `#BDB6CF` / `#2C2650` | 12 px / 400 | 7.17:1 | 4.5:1 | OK |
| A | `b` | Q8 · Qualité maximale | `#F3F0FA` / `#2A2536` | 18 px / 600 | 13.17:1 | 4.5:1 | OK |
| A | `span.chip.neutral` | Plus exigeant | `#BDB6CF` / `#2F2A3D` | 11.5 px / 700 | 7.08:1 | 4.5:1 | OK |
| A | `span.size` | 13,1 Go | `#F3F0FA` / `#2A2536` | 14 px / 700 | 13.17:1 | 4.5:1 | OK |
| A | `p` | Rendu un peu plus fin, mais plus len | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| A | `span` | VRAM utilisée ≈ 11,5 / 12 Go | `#BDB6CF` / `#2A2536` | 12 px / 400 | 7.59:1 | 4.5:1 | OK |
| A | `p.hint` | Vous pourrez changer de modèle plus  | `#BDB6CF` / `#201C2A` | 12 px / 400 | 8.53:1 | 4.5:1 | OK |
| A | `p` | YuE2 est sous licence | `#E4DEF3` / `#1F1B28` | 13.5 px / 400 | 12.88:1 | 4.5:1 | OK |
| A | `a` | CC BY-NC 4.0 | `#C4B2FF` / `#1F1B28` | 13.5 px / 400 | 8.96:1 | 4.5:1 | OK |
| A | `p` | : usage personnel et non commercial  | `#E4DEF3` / `#1F1B28` | 13.5 px / 400 | 12.88:1 | 4.5:1 | OK |
| A | `label.cb` | J’ai lu et j’accepte la licence | `#F3F0FA` / `#1F1B28` | 14 px / 600 | 14.98:1 | 4.5:1 | OK |
| A | `button.btn.lg.focus-demo` | Télécharger (8,5 Go) | `#FFFFFF` / `#805CDF` | 16 px / 700 | 4.65:1 | 4.5:1 | OK |
| A | `span.hint` | Reprise automatique si la connexion  | `#BDB6CF` / `#1F1B28` | 12 px / 400 | 8.63:1 | 4.5:1 | OK |
| B | `div.eyebrow` | Première installation | `#5ED8C9` / `#221E2C` | 15 px / 600 | 9.41:1 | 4.5:1 | OK |
| B | `h1` | Préparons Song Maker | `#F3F0FA` / `#221E2C` | 34 px / 600 | 14.46:1 | 3:1 | OK |
| B | `p.lead` | Choisissez comment vous souhaitez ut | `#BDB6CF` / `#221E2C` | 14.5 px / 400 | 8.34:1 | 4.5:1 | OK |
| B | `span.mockbadge` | Maquette · valeurs d’exemple | `#E8E1FF` / `#2A2050` | 11 px / 400 | 11.71:1 | 4.5:1 | OK |
| B | `div.ai` | ! | `#2A0D10` / `#FF6B6B` | 20 px / 900 | 6.50:1 | 3:1 | OK |
| B | `h2` | Attention : aucune carte graphique c | `#FFD5CF` / `#3A1F26` | 16 px / 700 | 11.16:1 | 4.5:1 | OK |
| B | `p` | La génération de musique demande une | `#F5DCD8` / `#3A1F26` | 13.5 px / 400 | 11.48:1 | 4.5:1 | OK |
| B | `b` | NVIDIA | `#F5DCD8` / `#3A1F26` | 13.5 px / 700 | 11.48:1 | 4.5:1 | OK |
| B | `p` | (Windows ou Linux) ou une puce | `#F5DCD8` / `#3A1F26` | 13.5 px / 400 | 11.48:1 | 4.5:1 | OK |
| B | `b` | Apple avec Metal | `#F5DCD8` / `#3A1F26` | 13.5 px / 700 | 11.48:1 | 4.5:1 | OK |
| B | `p` | (Mac). Sans elle, le modèle YuE2 ne  | `#F5DCD8` / `#3A1F26` | 13.5 px / 400 | 11.48:1 | 4.5:1 | OK |
| B | `span.num` | Option 1 · Si vous avez une carte NV | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `h3#b1` | Installer ou mettre à jour le pilote | `#F3F0FA` / `#2A2536` | 18 px / 600 | 13.17:1 | 4.5:1 | OK |
| B | `p` | Un pilote absent ou trop ancien est  | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `li` | Ouvre le site officiel de NVIDIA | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `li` | Redémarrage possible | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `a.btn.sec` | Ouvrir la page des pilotes ↗ | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| B | `button.btn.sec` | ↻ Relancer la détection | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| B | `span.num` | Option 2 · Facultatif | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `h3#b2` | Utiliser un worker GPU distant | `#F3F0FA` / `#2A2536` | 18 px / 600 | 13.17:1 | 4.5:1 | OK |
| B | `p` | Un autre ordinateur ou un serveur GP | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `li` | Désactivé par défaut | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `li` | Vos données audio quittent cet ordin | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| B | `label.toggle` | Activer le worker distant (désactivé | `#F3F0FA` / `#2A2536` | 12.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| B | `button.btn.sec` | Configurer un worker… | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| B | `span.num` | Option 3 · Disponible tout de suite | `#BDB6CF` / `#2C2650` | 13 px / 400 | 7.17:1 | 4.5:1 | OK |
| B | `h3#b3` | Continuer sans génération | `#F3F0FA` / `#2C2650` | 18 px / 600 | 12.44:1 | 4.5:1 | OK |
| B | `p` | Utilisez la | `#D6CDF0` / `#2C2650` | 13 px / 400 | 9.23:1 | 4.5:1 | OK |
| B | `b` | séparation de stems | `#D6CDF0` / `#2C2650` | 13 px / 700 | 9.23:1 | 4.5:1 | OK |
| B | `p` | et le | `#D6CDF0` / `#2C2650` | 13 px / 400 | 9.23:1 | 4.5:1 | OK |
| B | `b` | mixage | `#D6CDF0` / `#2C2650` | 13 px / 700 | 9.23:1 | 4.5:1 | OK |
| B | `p` | . Seul HTDemucs (0,3 Go, exemple) se | `#D6CDF0` / `#2C2650` | 13 px / 400 | 9.23:1 | 4.5:1 | OK |
| B | `li` | La génération de musique sera désact | `#BDB6CF` / `#2C2650` | 12.5 px / 400 | 7.17:1 | 4.5:1 | OK |
| B | `li` | Modifiable plus tard dans les Réglag | `#BDB6CF` / `#2C2650` | 12.5 px / 400 | 7.17:1 | 4.5:1 | OK |
| B | `button.btn.focus-demo` | Continuer sans génération | `#FFFFFF` / `#805CDF` | 15 px / 700 | 4.65:1 | 4.5:1 | OK |
| B | `span` | Aucun modèle lourd ne sera télécharg | `#BDB6CF` / `#1F1B28` | 12.5 px / 400 | 8.63:1 | 4.5:1 | OK |
| B | `span` | Détection : aucun GPU NVIDIA ni Appl | `#BDB6CF` / `#1F1B28` | 12.5 px / 400 | 8.63:1 | 4.5:1 | OK |
| B | `span.tag-ex` | Exemple | `#1A1424` / `#E9C46A` | 10.5 px / 700 | 10.75:1 | 4.5:1 | OK |
| C | `div.eyebrow` | Première installation · Téléchargeme | `#5ED8C9` / `#221E2C` | 15 px / 600 | 9.41:1 | 4.5:1 | OK |
| C | `h1` | Téléchargement interrompu | `#F3F0FA` / `#221E2C` | 34 px / 600 | 14.46:1 | 3:1 | OK |
| C | `p.lead` | Rien n’est perdu : les fichiers déjà | `#BDB6CF` / `#221E2C` | 14.5 px / 400 | 8.34:1 | 4.5:1 | OK |
| C | `span.mockbadge` | Maquette · valeurs d’exemple | `#E8E1FF` / `#2A2050` | 11 px / 400 | 11.71:1 | 4.5:1 | OK |
| C | `b` | Moteur audio | `#F3F0FA` / `#2A2536` | 14.5 px / 700 | 13.17:1 | 4.5:1 | OK |
| C | `span` | Traitement du son | `#BDB6CF` / `#2A2536` | 12 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `b` | 412 Mo | `#F3F0FA` / `#2A2536` | 12.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| C | `span` | / 412 Mo | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `span` | 100 % | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `span` | ✓ | `#7FE0A1` / `#2A2536` | 13 px / 700 | 9.23:1 | 4.5:1 | OK |
| C | `div.st.ok` | Terminé | `#7FE0A1` / `#2A2536` | 13 px / 700 | 9.23:1 | 4.5:1 | OK |
| C | `b` | YuE2 (Q4) | `#F3F0FA` / `#2F2130` | 14.5 px / 700 | 13.51:1 | 4.5:1 | OK |
| C | `span` | Modèle de génération | `#BDB6CF` / `#2F2130` | 12 px / 400 | 7.79:1 | 4.5:1 | OK |
| C | `b` | 3,1 Go | `#F3F0FA` / `#2F2130` | 12.5 px / 600 | 13.51:1 | 4.5:1 | OK |
| C | `span` | / 7,2 Go · 43 % | `#BDB6CF` / `#2F2130` | 12.5 px / 400 | 7.79:1 | 4.5:1 | OK |
| C | `span` | Vitesse : 0 Mo/s (avant coupure : 48 | `#BDB6CF` / `#2F2130` | 12.5 px / 400 | 7.79:1 | 4.5:1 | OK |
| C | `span` | ⚠ | `#FFB4A8` / `#2F2130` | 13 px / 700 | 8.94:1 | 4.5:1 | OK |
| C | `span` | Interrompu | `#FFB4A8` / `#2F2130` | 13 px / 700 | 8.94:1 | 4.5:1 | OK |
| C | `small` | Reste ≈ 1 min 25 s après reprise | `#BDB6CF` / `#2F2130` | 12 px / 400 | 7.79:1 | 4.5:1 | OK |
| C | `b` | VAE | `#F3F0FA` / `#2A2536` | 14.5 px / 700 | 13.17:1 | 4.5:1 | OK |
| C | `span` | Décodage audio | `#BDB6CF` / `#2A2536` | 12 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `b` | 0 Mo | `#F3F0FA` / `#2A2536` | 12.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| C | `span` | / 620 Mo | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `span` | 0 % | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `span` | ◷ | `#BDB6CF` / `#2A2536` | 13 px / 700 | 7.59:1 | 4.5:1 | OK |
| C | `div.st.wt` | En attente | `#BDB6CF` / `#2A2536` | 13 px / 700 | 7.59:1 | 4.5:1 | OK |
| C | `b` | HTDemucs | `#F3F0FA` / `#2A2536` | 14.5 px / 700 | 13.17:1 | 4.5:1 | OK |
| C | `span` | Séparation de stems | `#BDB6CF` / `#2A2536` | 12 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `b` | 0 Mo | `#F3F0FA` / `#2A2536` | 12.5 px / 600 | 13.17:1 | 4.5:1 | OK |
| C | `span` | / 300 Mo | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `span` | 0 % | `#BDB6CF` / `#2A2536` | 12.5 px / 400 | 7.59:1 | 4.5:1 | OK |
| C | `span` | ◷ | `#BDB6CF` / `#2A2536` | 13 px / 700 | 7.59:1 | 4.5:1 | OK |
| C | `div.st.wt` | En attente | `#BDB6CF` / `#2A2536` | 13 px / 700 | 7.59:1 | 4.5:1 | OK |
| C | `span` | Total : | `#BDB6CF` / `#201C29` | 13 px / 400 | 8.54:1 | 4.5:1 | OK |
| C | `b` | 3,5 Go | `#F3F0FA` / `#201C29` | 13 px / 700 | 14.81:1 | 4.5:1 | OK |
| C | `span` | reçus sur 8,5 Go (41 %) | `#BDB6CF` / `#201C29` | 13 px / 400 | 8.54:1 | 4.5:1 | OK |
| C | `span` | Temps restant estimé après reprise : | `#BDB6CF` / `#201C29` | 13 px / 400 | 8.54:1 | 4.5:1 | OK |
| C | `div.ai` | ! | `#2A0D10` / `#FF6B6B` | 18 px / 900 | 6.50:1 | 4.5:1 | OK |
| C | `h2` | La connexion Internet a été coupée p | `#FFD5CF` / `#3A1F26` | 15.5 px / 700 | 11.16:1 | 4.5:1 | OK |
| C | `p` | Ce n’est pas grave, vos 3,1 Go déjà  | `#F5DCD8` / `#3A1F26` | 13.5 px / 400 | 11.48:1 | 4.5:1 | OK |
| C | `li` | Vérifiez que vous êtes connecté à In | `#F5DCD8` / `#3A1F26` | 13.5 px / 400 | 11.48:1 | 4.5:1 | OK |
| C | `li` | Cliquez sur « Reprendre ». Si cela é | `#F5DCD8` / `#3A1F26` | 13.5 px / 400 | 11.48:1 | 4.5:1 | OK |
| C | `button.btn.lg.focus-demo` | ▶ Reprendre le téléchargement | `#FFFFFF` / `#805CDF` | 16 px / 700 | 4.65:1 | 4.5:1 | OK |
| C | `button.btn.sec` | Annuler et revenir au choix | `#F3F0FA` / `#1F1B28` | 15 px / 700 | 14.98:1 | 4.5:1 | OK |
| C | `summary` | Détails techniques | `#BDB6CF` / `#1F1B28` | 12.5 px / 400 | 8.63:1 | 4.5:1 | OK |
| D | `div.eyebrow` | Fiche de conception | `#5ED8C9` / `#201B2B` | 15 px / 600 | 9.69:1 | 4.5:1 | OK |
| D | `h1` | Pourquoi cet écran est plus simple à | `#F3F0FA` / `#201B2B` | 30 px / 600 | 14.89:1 | 3:1 | OK |
| D | `div.k` | 1 | `#FFFFFF` / `#805CDF` | 16 px / 800 | 4.65:1 | 4.5:1 | OK |
| D | `span.src` | Norman · Retour d’information | `#5ED8C9` / `#2A2536` | 13 px / 600 | 8.57:1 | 4.5:1 | OK |
| D | `h3` | Le système dit toujours où il en est | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| D | `p` | Détection du GPU, progression par fi | `#D7D0E8` / `#2A2536` | 13 px / 400 | 9.94:1 | 4.5:1 | OK |
| D | `em` | et | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| D | `p` | texte. | `#D7D0E8` / `#2A2536` | 13 px / 400 | 9.94:1 | 4.5:1 | OK |
| D | `em` | Écrans A et C. | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| D | `div.k` | 2 | `#FFFFFF` / `#805CDF` | 16 px / 800 | 4.65:1 | 4.5:1 | OK |
| D | `span.src` | Norman · Affordances et contraintes | `#5ED8C9` / `#2A2536` | 13 px / 600 | 8.57:1 | 4.5:1 | OK |
| D | `h3` | Seule l’action possible est mise en  | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| D | `p` | Sans GPU, aucun bouton « Télécharger | `#D7D0E8` / `#2A2536` | 13 px / 400 | 9.94:1 | 4.5:1 | OK |
| D | `em` | Écrans B et C. | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| D | `div.k` | 3 | `#FFFFFF` / `#805CDF` | 16 px / 800 | 4.65:1 | 4.5:1 | OK |
| D | `span.src` | Krug · Ne me faites pas réfléchir | `#5ED8C9` / `#2A2536` | 13 px / 600 | 8.57:1 | 4.5:1 | OK |
| D | `h3` | Une recommandation, pas un questionn | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| D | `p` | Le modèle adapté est présélectionné  | `#D7D0E8` / `#2A2536` | 13 px / 400 | 9.94:1 | 4.5:1 | OK |
| D | `em` | Écran A. | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| D | `div.k` | 4 | `#FFFFFF` / `#805CDF` | 16 px / 800 | 4.65:1 | 4.5:1 | OK |
| D | `span.src` | Divulgation progressive | `#5ED8C9` / `#2A2536` | 13 px / 600 | 8.57:1 | 4.5:1 | OK |
| D | `h3` | L’essentiel d’abord, le détail à la  | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| D | `p` | Q8, worker distant et détails techni | `#D7D0E8` / `#2A2536` | 13 px / 400 | 9.94:1 | 4.5:1 | OK |
| D | `em` | Écrans A, B et C. | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| D | `div.k` | 5 | `#FFFFFF` / `#805CDF` | 16 px / 800 | 4.65:1 | 4.5:1 | OK |
| D | `span.src` | Krug · Langage clair et confiance | `#5ED8C9` / `#2A2536` | 13 px / 600 | 8.57:1 | 4.5:1 | OK |
| D | `h3` | La licence est expliquée avant la ca | `#F3F0FA` / `#2A2536` | 15 px / 700 | 13.17:1 | 4.5:1 | OK |
| D | `p` | Usage personnel et non commercial :  | `#D7D0E8` / `#2A2536` | 13 px / 400 | 9.94:1 | 4.5:1 | OK |
| D | `em` | Écrans A et C. | `#BDB6CF` / `#2A2536` | 13 px / 400 | 7.59:1 | 4.5:1 | OK |
| D | `b` | Accessibilité : | `#F3F0FA` / `#1C1826` | 12.5 px / 700 | 15.44:1 | 4.5:1 | OK |
| D | `div.a11y` | contrastes ≥ 4,5:1 (texte) sur fond  | `#BDB6CF` / `#1C1826` | 12.5 px / 400 | 8.90:1 | 4.5:1 | OK |
| D | `em` | progressbar | `#BDB6CF` / `#1C1826` | 12.5 px / 400 | 8.90:1 | 4.5:1 | OK |
| D | `div.a11y` | · cibles ≥ 44 px de hauteur. | `#BDB6CF` / `#1C1826` | 12.5 px / 400 | 8.90:1 | 4.5:1 | OK |
| D | `span` | Texte #F3F0FA / #221E2C | `#F3F0FA` / `#221E2C` | 11.5 px / 400 | 14.46:1 | 4.5:1 | OK |
| D | `span` | Sur-titre #5ED8C9 | `#5ED8C9` / `#221E2C` | 11.5 px / 400 | 9.41:1 | 4.5:1 | OK |
| D | `span` | Bouton #FFF / #805CDF | `#FFFFFF` / `#805CDF` | 11.5 px / 400 | 4.65:1 | 4.5:1 | OK |
| D | `span` | Alerte #FFD5CF / #3A1F26 | `#FFD5CF` / `#3A1F26` | 11.5 px / 400 | 11.16:1 | 4.5:1 | OK |
| D | `span` | Focus #FFD76A | `#FFD76A` / `#221E2C` | 11.5 px / 400 | 11.77:1 | 4.5:1 | OK |
| D | `p.hint` | Toutes les valeurs (GPU, tailles, du | `#BDB6CF` / `#1C1725` | 12 px / 400 | 8.97:1 | 4.5:1 | OK |

- **Changement 29/09/2026 (cibles tactiles)** : zone cliquable de la case de licence (20 → 44 px, `min-height:44px` sur `.cb`) et de « Détails techniques » (26 → 44 px, `min-height:44px` sur `summary`) portée à 44 px ; taille visuelle quasi inchangée. Fiche D reformulée : « boutons ≥ 44 px de hauteur ; zone cliquable de la case de licence et de « Détails techniques » portée à 44 px ». PNG régénérés via `render.py`, aucun débordement (vérifié sur A–D, 1280×720). Ce changement ne modifie aucune couleur ni aucun ratio.
