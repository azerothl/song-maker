# Captures React — défilement sous-onglets Production (#203)

Harness : Vite + `production-capture.html`, Chromium (channel `chrome` si dispo), PNG réels.

## Génération

```bash
CAPTURE_PHASE=after pnpm exec tsx docs/design/production-subtab-scroll/captures-react/capture.mts
```

Viewports : **1280×720** et **1280×768**. Hashs : `#confortable-12` (Mix), `#view-tools-12`, `#view-clips-16`.

## Fichiers `after/`

| Fichier | Vue |
| --- | --- |
| `mix-1280x720-after.png` | Mix actif — pas de fuite Outils/Clips |
| `tools-*` | Outils — rack atteignable |
| `clips-*` | Clips — bande haute 200 px + timeline |

`metrics-after.json` inclut `hiddenPanelsLeaking` (doit rester `false`).

## data-testid (PR #204)

- `production-tools-scroll`, `production-clips-scroll`, `production-clips-panel`
- `clip-timeline-lanes`, `phase3-fx-rack`

Tests : `src/dev/productionSubtabScroll.behavior.test.ts`.
