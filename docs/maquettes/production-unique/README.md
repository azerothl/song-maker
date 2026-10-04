# Maquette « Vue unique Production » — pack docs (#224)

Direction silhouette **validée par Loïc** (2026-10-01, commentaire sur #224).  
Ce dossier versionne les **captures PNG**, le **pack documentaire A–G partiel**, et un **HTML interactif** des restes #345 (master : lecture / fader / mesure / densité ; aimantation-zoom uniquement dans Réglages du mix). Ce HTML n’est pas les 33 scènes Alphonse.

| Réf. | Valeur |
|------|--------|
| Produit tip au moment du pack | `bfec8bbe2949fb6abccb0217b9dca1c7275efd61` |
| Réf. produit citée par la maquette | `2c13dd7cb79d4b4bda855b276674eb18492aef85` |
| HTML publié | **Partiel** (`index.html` restes #345) |
| Scènes PNG | **21 / 33** |
| `metrics.json` sha256 | `4b337af1916e8414690740b6dc968a823cf6f475736294c739b1e501bfe580e9` |

## Fichiers du pack

| Fichier | Critère | État |
|---------|---------|------|
| PNG scènes + `emplacements/` | A / D | Partiel (21 scènes + 12 planches) |
| [`metrics.json`](./metrics.json) | A / C | Régénéré (empreintes PNG) |
| [`mesures.md`](./mesures.md) | C | Empreintes + lacunes HTML |
| [`tests.md`](./tests.md) | A | Mapping vers tests produit |
| [`fonctions-nouvelle-place.md`](./fonctions-nouvelle-place.md) | B | Complet (décisions consignées) |
| [`libelles-i18n.md`](./libelles-i18n.md) | E | Clés `production.*` produit FR/EN |
| `index.html` | A / G / #345 | **Partiel** (master + aimantation/zoom) |

## Scénarios disponibles — hash d’URL maquette

| Fichier | Hash | Contenu |
|---------|------|---------|
| `01-vue-par-defaut-1280x720.png` | `#a` | Vue par défaut |
| `02-outil-decouper-1280x720.png` | `#b` | Outil Découper |
| `03-popover-reglages-piste-1280x720.png` | `#c` | Popover « Réglages de la piste » |
| `05-automation-depliee-1280x720.png` | `#e` | Courbe d’automation dépliée |
| `06-reglages-du-mix-1280x720.png` | `#f` | Réglages du mix |
| `07b-640-replie-640x720.png` | `#g2` | 640 px replié |
| `07c-640-reglages-du-mix-640x720.png` | `#g3` | 640 px Réglages du mix |
| `07d-640-popover-piste-640x720.png` | `#g4` | 640 px popover piste |
| `08-clavier-focus-palette-1280x720.png` | `#h` | Focus palette |
| `09-gain-pan-clavier-focus-1280x720.png` | `#i` | Focus gain |
| `10-saisie-numerique-pan-1280x720.png` | `#j` | Saisie panoramique |
| `11-640-saisie-gain-2-lignes-640x720.png` | `#g5` | 640 px saisie gain |
| `12-ajout-menu-ouvert-1280x720.png` | `#k` | Menu Ajouter |
| `16-ajout-menu-ouvert-640x720.png` | `#g6` | Menu Ajouter 640 |
| `22-egaliseur-popover-ouvert-1280x720.png` | `#m` | Égaliseur |
| `24-640-egaliseur-popover-ouvert-640x720.png` | `#g8` | Égaliseur 640 |
| `26-automation-popover-1280x720.png` | `#n` | Automation popover |
| `27-640-automation-popover-640x720.png` | `#g9` | Automation popover 640 |
| `28-separer-avis-licence-ouvert-1280x720.png` | `#o` | Avis séparation |
| `30-640-separer-avis-licence-ouvert-640x720.png` | `#g10` | Avis séparation 640 |
| `33-en-outil-split-1280x720.png` | `#b` (EN) | Split EN |

Hashes manquants côté captures : `#d`, `#g`, `#g1`, `#g7`, `#l`, et scènes 04/07/13–15/17–21/23/25/29/31–32.

## Décisions Loïc consignées (F)

1. Gain/pan toujours visibles ; Muet/Solo réduits — **tranché**.
2. EQ en popover ; panneau latéral écarté ; automation suit popover — **tranché**.
3. Ajout de piste par menu (piste vide incluse) ; tiroir écarté — **tranché**.
4. Effets par piste, onglets popover — **tranché**.
5. Assistant / Copilote : fusion hors épique, un accès provisoire — **tranché**.
6. Unité **ms** — **tranché** (2026-09-30).
7. Silhouette = maquette (timeline dominante, V/C/F/M, un Réglages) — **validé 2026-10-01**.

## 640 px — règle de repli

À ≤ 900 px de largeur de fenêtre, les contrôles secondaires rejoignent « Réglages du mix » (seuil media query produit [L] ; validation Pascal ouverte).

## Critères A–G — honesty check

| Critère | État |
|---------|------|
| A Couverture 33 captures + tests HTML | **Incomplet** |
| B Tableau fonctions | **Complet** (ce pack) |
| C Mesures contraste/cibles HTML | **Incomplet** (HTML absent) |
| D 640 px + phrase repli | **Partiel** (captures présentes ; HTML absent) |
| E i18n libellés produit | **Partiel** (clés produit documentées ; pack HTML / relecture Gabriel absents) |
| F Décisions Loïc | **Consignées** |
| G a11y maquette HTML | **Incomplet** |

→ **#224 reste ouvert** tant que le HTML et les captures manquantes ne sont pas versionnés / validés.
