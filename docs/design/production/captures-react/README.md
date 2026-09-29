# Captures React — transport master Production (#157)

Captures **réelles** (harness `production-capture.html`, mock Tauri), scénario **16 pistes · densité Auto · groupe Rythmique déplié**.

## Génération

```bash
pnpm exec tsx docs/design/production/captures-react/capture.mts avant   # état de référence (branche main)
pnpm exec tsx docs/design/production/captures-react/capture.mts apres   # après correctif + assertions
pnpm exec tsx docs/design/production/captures-react/measure-playhead.mts  # curseur en lecture (milieu, 1280×720)
```

Écrit les PNG `production-transport-{avant|apres}-{1280x720|1024x700}.png` et fusionne les mesures `getBoundingClientRect` dans `metrics.json`.

## Métriques

- Taille du bouton lecture (`.mix-master-play`)
- Largeur / hauteur de la waveform globale (`.mix-master-wave .waveform-canvas`)
- Part de la largeur du bandeau occupée par la waveform
- Lignes de pistes entièrement visibles (régression #146 / #152)
