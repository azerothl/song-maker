# Captures React — dialogues séparation / export (#187)

Captures **réelles** (Vite + mock Tauri), viewport **1280×720**.

## Génération

```bash
pnpm exec tsx docs/design/separation-export-a11y/captures-react/capture.mts
```

Scènes (`#hash`) :

| Fichier | Point |
| --- | --- |
| `separation-1280x720.png` | Pied fixe + download `aria-disabled` + exclusions |
| `export-mix-1280x720.png` | Pied fixe + label / `aria-live` format |
| `export-stems-1280x720.png` | Pied fixe export pistes + raison si bloqué |

Métriques : `metrics.json` (footer visible, cibles ≥ 44 px, attributs a11y).
