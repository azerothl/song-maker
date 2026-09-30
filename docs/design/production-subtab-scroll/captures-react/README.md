# Captures React — défilement sous-onglets Production (#203)

Harness : Vite + `production-capture.html`, Chromium (channel `chrome` si dispo), PNG réels.

## Variance machine / police

Les captures PNG et les métriques DOM **dépendent de la machine, du moteur Chromium et des polices installées**. Ne pas promettre un rendu pixel-exact : d’une machine à l’autre, on a observé **2,3 % à 9,4 %** de pixels différents sur les mêmes scènes. Les seuils de tests tolèrent ±2 px sur les hauteurs de zone Mix ; les `clientHeight` / empreintes SHA dans `metrics-after.json` sont des mesures d’un run donné, pas une référence universelle.

L’heure d’enregistrement Mix est figée à **« 08:02 »** dans le harness (`productionCaptureMain.tsx`) pour stabiliser le chrome texte des captures Mix.

## Génération

```bash
CAPTURE_PHASE=after pnpm exec tsx docs/design/production-subtab-scroll/captures-react/capture.mts
```

Viewports : **1280×720**, **1280×768**, **1280×640**. Hashs : `#confortable-12` (Mix), `#view-tools-12` (Outils), `#view-clips-16` (Clips).

Le harness régénère **9** PNG `after/` (mix + tools + clips × 3 hauteurs) et réécrit `metrics-after.json`.

## Fichiers `after/` (présents dans le dépôt)

| Fichier | Vue |
| --- | --- |
| `mix-1280x720-after.png` | Mix actif — panneaux Clips/Outils masqués |
| `mix-1280x768-after.png` | Mix, 768 px de hauteur |
| `mix-1280x640-after.png` | Mix, 640 px de hauteur |
| `tools-1280x720-after.png` | Outils — rack d'effets atteignable |
| `tools-1280x768-after.png` | Outils, 768 px |
| `tools-1280x640-after.png` | Outils, 640 px |
| `clips-1280x720-after.png` | Clips — bande haute 200 px + timeline |
| `clips-1280x768-after.png` | Clips, 768 px |
| `clips-1280x640-after.png` | Clips, 640 px |

`metrics-after.json` : métriques mesurées par `capture.mts` (`hiddenPanelsLeaking` doit rester `false` sur chaque scène).

Référence Alphonse (revue #204, machine de mesure) — Outils `clientHeight` **419 / 467 / 339** (720 / 768 / 640) ; timeline Clips `lanesClientHeightPx` **210 / 258 / 130** ; **4** pistes 44 px entières visibles à 768. Un run local peut différer de ±2 px (voir variance ci-dessus).

## data-testid (PR #204)

- `production-tools-scroll`, `production-clips-scroll`, `production-clips-panel`
- `clip-timeline-lanes`, `phase3-fx-rack`

Tests : `src/dev/productionSubtabScroll.behavior.test.ts`.
