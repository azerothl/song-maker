# Captures React — onglet Production (densité v2)

Captures **réelles** de l’application (harness Vite `production-capture.html`, mock Tauri), viewport **1280×720**.

## Génération

```bash
pnpm exec tsx docs/design/production-densite/captures-react/capture.mts
```

Écrit les PNG et `metrics.json` (mesures `getBoundingClientRect` via `window.__productionCaptureMetrics`, pas sur les pixels de la capture).

## Scénarios

| Fichier | Hash |
|---|---|
| `production-react-6pistes-auto-1280x720.png` | `#6,auto,expanded` |
| `production-react-6pistes-confortable-1280x720.png` | `#6,confortable,expanded` |
| `production-react-6pistes-compact-1280x720.png` | `#6,compact,expanded` |
| `production-react-16pistes-auto-1280x720.png` | `#16,auto,expanded` |
| `production-react-16pistes-confortable-1280x720.png` | `#16,confortable,expanded` |
| `production-react-16pistes-compact-1280x720.png` | `#16,compact,expanded` |
| `production-react-compact-1280x720.png` | `#12,compact,expanded` |
| `production-react-confortable-1280x720.png` | `#12,confortable,expanded` |
