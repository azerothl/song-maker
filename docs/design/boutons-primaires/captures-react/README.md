# Captures React — boutons primaires

Captures **application React réelle** (Vite + mock Tauri), pas de maquette HTML.

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Écrit les PNG 1280×720, `metrics.json`, et met à jour `../contrastes.md`.

Chromium Playwright embarqué si présent, sinon repli sur le canal `chrome` du système.

## Fichiers (extrait)

| Motif | Écran |
|-------|--------|
| `creer-primary-*` | Créer — Générer (normal / survol / focus Tab / désactivé via `busy` capture) |
| `production-export-trigger-*` | Production — bouton Exporter |
| `production-export-popin-primary-disabled-*` | Popin export — primaire désactivé (pistes non cochées) |
| `regeneration-gate-*` | RegenerationGate — primaire désactivé + focus Annuler |
| `metrics.json` | Contraste DOM, ΔE00 popin, focus (`outline`, offset, curseur) |

Inventaire des 35 usages : [`../../primary-button-contrast/inventaire.md`](../../primary-button-contrast/inventaire.md).
