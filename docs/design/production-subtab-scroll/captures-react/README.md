# Captures React — défilement sous-onglets Production (#203)

Harness : Vite + `production-capture.html`, Chromium (channel `chrome` si dispo), PNG réels.

## Génération

```bash
CAPTURE_PHASE=after pnpm exec tsx docs/design/production-subtab-scroll/captures-react/capture.mts
```

Viewports : **1280×720**, **1280×768**, **1280×640**. Hashs : `#confortable-12` (Mix), `#view-tools-12` (Outils), `#view-clips-16` (Clips).

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

## data-testid (PR #204)

- `production-tools-scroll`, `production-clips-scroll`, `production-clips-panel`
- `clip-timeline-lanes`, `phase3-fx-rack`

Tests : `src/dev/productionSubtabScroll.behavior.test.ts`.
