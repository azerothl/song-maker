# Captures React — onglet Production (app réelle)

Ces PNG sont des **captures de l’interface React** (composants de production du dépôt), pas de la maquette statique `../index.html`.

## Fichiers

| Fichier | Description |
|--------|-------------|
| `production-react-compact-1280x720.png` | Densité **Compact**, 12 stems, tous les groupes dépliés |
| `production-react-confortable-1280x720.png` | Densité **Confortable**, mêmes pistes |
| `production-react-rythmique-replie-1280x720.png` | Compact, groupe **Rythmique** replié (9 lignes de piste rendues) |
| `metrics.json` | Métriques Playwright (lignes entièrement visibles dans la zone défilante) |

## Méthode

1. Page Vite dédiée : `/production-capture.html` (voir `src/dev/productionCaptureMain.tsx` à la racine du dépôt).
2. Données : 12 stems IA fictifs (3 voix, 3 rythmique, 6 harmonie), formes d’onde synthétiques, pas de backend Tauri.
3. Viewport **1280×720**, Chromium via Playwright.

Régénération :

```bash
node --import tsx docs/design/production-densite/captures-react/capture.mts
```

## Mesure — pistes entièrement visibles (compact, 1280×720)

Critère issue #137 : **au moins 8** pistes entièrement visibles en hauteur compacte.

Mesure au moment de la capture (`metrics.json`, clé `compact.fullyVisibleRows`) : **9** lignes `.production-mix-row` entièrement visibles (seuil #137 : **≥ 8**). En mode **mix compact** (`production-workspace-tight`), hauteur de ligne **44 px** et en-têtes de groupe **20 px** pour tenir dans 1280×720 avec le chrome réel (onglets morceau, sous-nav Mix/Clips/Outils, tiroir actions sur une ligne, master + barre d’outils collés, pas d’en-tête de colonnes dupliqué).

Définition utilisée : une ligne `.production-mix-row` est « entièrement visible » si son rectangle est inclus dans celui de `.production-mix-scroll` (même logique que `../render.py` sur la maquette).
