# Captures React — dialogues séparation / export (#187 / #191 / #196)

Captures **réelles** (Vite + mock Tauri). Viewport par défaut **1280×720** ; B1 Alphonse aussi **1280×768** et **1280×900**.

## Génération

```bash
pnpm exec tsx docs/design/separation-export-a11y/captures-react/capture.mts
pnpm exec tsx docs/design/separation-export-a11y/captures-react/b1-regression-old-popin.mts
```

## Scènes (`#hash`)

Les PNG et clés `metrics.json` sont nommés `{hash}-{largeur}x{hauteur}.png`.

| Fichier (exemple) | Critère | Preuve |
| --- | --- | --- |
| `sep-header-1280x720.png` | Contraste I1 sur fond effectif (`__effectiveBg` avec `color(srgb … / α)`) | **mesuré** |
| `sep-recommended-visible-1280x720.png` | Modèle recommandé visible sans défilement (`spotlightReach`, `scrollTop≈0`) | **mesuré** |
| `sep-i6-commands-1280x720.png` | Commandes hors dialogue ≥ 44 px (`i6OutsideBtnHeights`) | **mesuré** |
| `sep-download-1280x720.png` | Liens source ≥ 44 px (`sourceLinkHeights`) | **mesuré** |
| `export-drawer-b1-12-1280x768.png` | **B1 Alphonse** — ancre y≈219, bascule « Pistes séparées » après ouverture | **mesuré** |
| `export-drawer-b1-12-1280x900.png` | **B1** — 12 pistes, viewport haut | **mesuré** |
| `export-drawer-top-*` | B1 complémentaire (ancre haut) | **mesuré** |
| `regen-gate-blocked-1280x720.png` | État forcé RegenerationGate | **non testé** in-app |

### Contraste I1 attendu (`sep-header-1280x720`, recalcul #196)

| Élément | Ratio attendu | Source |
| --- | --- | --- |
| badge licence | ~10,47 | **mesuré** `contrast.badge` |
| date | ~5,90 | **mesuré** `contrast.readDate` |
| pastille (`sep-license-icon`) | ~9,55 | **mesuré** `contrast.licenseIcon` |
| ✕ exclusion | ~8,74 | **mesuré** `contrast.exclusionX` |

Si les mesures divergent de ±0,15, le script `capture.mts` émet un avertissement.

Tests comportement : `src/dev/anchoredPopinFooter.behavior.test.ts` (Playwright). Régression B1 legacy : `B1-regression-old-anchored-popin.txt` (échec **pied hors viewport**, pas calage `top ≥ 112`).

## Non testé

WebKitGTK, lecteur d’écran, téléchargement réel, ffmpeg, Vercel preview (quota CI).
