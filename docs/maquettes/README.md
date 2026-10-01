# Maquettes (hébergement des captures)

Ces captures sont des images de maquettes HTML statiques **non publiées** (source HTML, scripts et mesures sur la boîte de travail de l'équipe). Aucun code produit. Données d'exemple factices (« Exemple factice »).

Référence produit de la maquette Production unique : `origin/main` = `2c13dd7cb79d4b4bda855b276674eb18492aef85` (README de la maquette).

Dossiers :

| Dossier | Tickets / sujet |
|---------|-----------------|
| `production-unique/` | #223–#230, #224 |
| `profils-201/` | #201 / #209 (L1 + L2) |
| `stemforge/` | séparation / licence / export (StemForge) |
| `tickets/` | maquettes proposées par ticket (`170`, `235`, `27`, …) |

## production-unique/ (1280×720 et 640×720) — hash d'URL de la maquette `index.html#…`

| Fichier | Hash | Contenu |
|---|---|---|
| `01-vue-par-defaut-1280x720.png` | `#a` | Vue par défaut : gain et pan dans chaque en-tête de piste |
| `02-outil-decouper-1280x720.png` | `#b` | Outil Découper, aperçu « Découper ici · 0:21.0 · mesure 11 » |
| `03-popover-reglages-piste-1280x720.png` | `#c` | Popover « Réglages de la piste : Voix lead » |
| `05-automation-depliee-1280x720.png` | `#e` | Courbe d'automation dépliée sous « Voix lead » |
| `06-reglages-du-mix-1280x720.png` | `#f` | Menu « Réglages du mix » |
| `07b-640-replie-640x720.png` | `#g2` | 640 px, vue repliée |
| `07c-640-reglages-du-mix-640x720.png` | `#g3` | 640 px, Réglages du mix |
| `07d-640-popover-piste-640x720.png` | `#g4` | 640 px, popover de piste |
| `08-clavier-focus-palette-1280x720.png` | `#h` | Anneau de focus clavier sur la palette « Édition des clips » |
| `09-gain-pan-clavier-focus-1280x720.png` | `#i` | Focus clavier sur le gain |
| `10-saisie-numerique-pan-1280x720.png` | `#j` | Entrée sur le pan : saisie numérique |
| `11-640-saisie-gain-2-lignes-640x720.png` | `#g5` | 640 px, en-tête sur 2 lignes, saisie du gain |
| `12-ajout-menu-ouvert-1280x720.png` | `#k` | Menu « Ajouter une piste » ouvert |
| `16-ajout-menu-ouvert-640x720.png` | `#g6` | Idem à 640 px |
| `22-egaliseur-popover-ouvert-1280x720.png` | `#m` | Égaliseur en popover |
| `24-640-egaliseur-popover-ouvert-640x720.png` | `#g8` | Idem à 640 px |
| `26-automation-popover-1280x720.png` | `#n` | Automation en popover |
| `27-640-automation-popover-640x720.png` | `#g9` | Idem à 640 px |
| `28-separer-avis-licence-ouvert-1280x720.png` | `#o` | Avis de séparation (licence FACTICE) |
| `30-640-separer-avis-licence-ouvert-640x720.png` | `#g10` | Idem à 640 px |
| `33-en-outil-split-1280x720.png` | `#b` (EN) | Outil Découper, interface en anglais proposé |

## production-unique/emplacements/ — emplacements des fonctions de l'ancien sous-onglet « Outils »

`emplacements.html`, planches `p1` à `p9` (1280×720 ; 640×800 pour `p2-640`, `p6-640`).
p1 Réglages de la piste · p2 Ligne d'effets · p3 Égaliseur · p4 Ligne d'automation + menu des cibles · p4b Automation (Réglages détaillés) · p5 Routage de la piste Basse · p6 Réglages du mix · p7 Groupes, bus auxiliaires et sends · p8 Édition des clips : Prises + Tempo / hauteur · p9 Exporter : paquet portable.
Ce sont des **propositions** d'emplacement (à valider), pas des décisions.

## profils-201/ — lots 1 et 2 (#201 / #209)

- **L1** (`profils-L1-01` … `L1-16`) : création profil Commercial, sélecteur, moteurs Hobby, fiches « Pourquoi ? », planche d’états.
- **L2** (`profils-L2-05` … `L2-11`) : FUTUR (dépend de l’intégration ACE-Step, #209) — moteurs Commercial, contrat ACE-Step, premier usage. Filigrane « Lot 2 · futur ».

## stemforge/ — séparation, licence, export

Sous-dossiers `separation/`, `licence/`, `export/` (captures de maquettes StemForge affichées dans les tickets liés).

## tickets/ — maquettes proposées par numéro d’issue

| Sous-dossier | Sujet (indicatif) |
|--------------|-------------------|
| `170/` | Sortie MIDI / « Tout arrêter » |
| `235/` | Assistant de mix (point d’entrée, propositions, erreurs) |
| `27/` … `97/` | Autres tickets (partition, piano-roll, branches, LoRA, SheetSage, presets, etc.) |

Ce sont des **propositions** à valider ; elles n’engagent pas le produit tant que le ticket concerné ne les a pas acceptées.
