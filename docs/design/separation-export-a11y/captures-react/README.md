# Captures React — dialogues séparation / export (#187 / #191)

Captures **réelles** (Vite + mock Tauri). Viewport par défaut **1280×720** ; scènes B1 drawer aussi **1280×600**.

## Génération

```bash
pnpm exec tsx docs/design/separation-export-a11y/captures-react/capture.mts
```

## Scènes (`#hash`)

Les PNG et clés `metrics.json` sont nommés `{hash}-{largeur}x{hauteur}.png` (ex. `export-drawer-top-12-1280x600.png`).

| Fichier (exemple) | Critère |
| --- | --- |
| `sep-header-1280x720.png` | Titre visible ; contraste I1 (**mesuré** sur fond peint derrière l’élément) |
| `sep-unmeasured-badge-1280x720.png` | Badge « Recommandation non mesurée » au-dessus de la reco (≥ 4,5:1) |
| `sep-footer-1280x720.png` | Pied + « Lancer la séparation » atteignables |
| `sep-download-1280x720.png` | Télécharger + raison `aria-describedby` visibles |
| `sep-exclusions-1280x720.png` | Résumé exclusions en tête |
| `sep-revert-1280x720.png` | « Revenir à la recommandation » |
| `sep-run-blocked-1280x720.png` | I7 — run `aria-disabled` + raison |
| `export-drawer-top-{4,12,16}-1280x720.png` | **B1** — ancre **en haut**, pied + Exporter atteignables |
| `export-drawer-top-12-1280x600.png` | **B1** — même scène, viewport bas |
| `export-drawer-top-12-after-*` | **B1** — après export réussi (720 et 600) |
| `export-mix-tight-1280x720.png` | Barre mix dense : boutons **du popin** ≥ 44 px |
| `export-stems-none-selected-1280x720.png` | Exporter bloqué (0 piste) + raison + `aria-describedby` |
| `regen-gate-blocked-1280x720.png` | **État forcé** — non atteignable dans l’app (`SongScreen.tsx` ~339) ; mock capture pour pied + raison RegenerationGate |

Métriques : `metrics.json` — champs `*Reach.reachable` (DOM : `getBoundingClientRect`, non recouvert, `elementFromPoint` au centre). Contraste : `__contrastOnElement` (fond effectif remonté dans l’arbre).

Tests comportement : `src/dev/anchoredPopinFooter.behavior.test.ts` (Playwright). Régression B1 vs ancien `AnchoredPopin` : `B1-regression-old-anchored-popin.txt`.
