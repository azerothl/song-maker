# Captures React — dialogues séparation / export (#187 / #191)

Captures **réelles** (Vite + mock Tauri), viewport **1280×720**.

## Génération

```bash
pnpm exec tsx docs/design/separation-export-a11y/captures-react/capture.mts
```

## Scènes (`#hash`)

| Fichier | Critère |
| --- | --- |
| `sep-header-1280x720.png` | Titre visible (haut du dialogue) |
| `sep-footer-1280x720.png` | Pied + « Lancer la séparation » atteignables |
| `sep-download-1280x720.png` | Télécharger + raison `aria-describedby` visibles |
| `sep-exclusions-1280x720.png` | Résumé exclusions en tête |
| `sep-revert-1280x720.png` | « Revenir à la recommandation » |
| `sep-run-blocked-1280x720.png` | I7 — run `aria-disabled` + raison |
| `export-drawer-12-1280x720.png` | **B1** — 12 pistes, ancre tiroir, pied visible |
| `export-drawer-12-after-export-1280x720.png` | **B1** — après export réussi |
| `export-stems-none-selected-1280x720.png` | **Exporter** bloqué (0 piste cochée) + raison + `aria-describedby` |
| `regen-gate-blocked-1280x720.png` | **Capturer et générer** bloqué (RegenerationGate) + raison |

Métriques : `metrics.json` — champs `*Reach.reachable` (DOM : `getBoundingClientRect`, non recouvert, `elementFromPoint` au centre). Contraste I1 mesuré sur `sep-header` (`contrast.*`, calculé à partir des couleurs CSS).

Tests comportement : `src/dev/anchoredPopinFooter.behavior.test.ts` (Playwright).
