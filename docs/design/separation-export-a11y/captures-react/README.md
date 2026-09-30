# Captures React — dialogues séparation / export (#187 / #191 / #196)

Captures **réelles** (Vite + mock Tauri). Viewport par défaut **1280×720** ; B1 Alphonse aussi **1280×768** et **1280×900**.

## Génération

```bash
pnpm exec tsx docs/design/separation-export-a11y/captures-react/capture.mts
pnpm exec tsx docs/design/separation-export-a11y/captures-react/measure-i6-production.mts
pnpm exec tsx docs/design/separation-export-a11y/captures-react/b1-regression-old-popin.mts
```

## Scènes séparation/export (`#hash`)

Les PNG et clés `metrics.json` sont nommés `{hash}-{largeur}x{hauteur}.png`.

| Fichier (exemple) | Critère | Preuve |
| --- | --- | --- |
| `sep-header-1280x720.png` | Contraste I1 sur fond effectif (`__effectiveBgRgb` + composition alpha, sans arrondir le fond avant le ratio) | **mesuré** |
| `sep-recommended-visible-1280x720.png` | Fiche reco complète visible sans défilement (`spotlightReach` sur `[data-testid^=sep-quality-card-]`, `scrollTop≈0`) | **mesuré** |
| `sep-selection-cachee-1280x720.png` | Choix manuel visible si « Autres modèles » fermé (`sep-manual-pick-visible`) | **mesuré** |
| `sep-download-1280x720.png` | Liens source ≥ 44 px (`sourceLinkHeights`) | **mesuré** |
| `export-drawer-b1-12-1280x768.png` | **B1 Alphonse** — ancre y≈219, bascule « Pistes séparées » + 12 cases **avant** le pied | **mesuré** |
| `export-drawer-b1-12-1280x900.png` | **B1** — 12 pistes, viewport haut | **mesuré** |
| `export-drawer-top-*` | B1 complémentaire (ancre haut) | **mesuré** |
| `regen-gate-blocked-1280x720.png` | État forcé RegenerationGate | **non testé** in-app |

### I6 — ProductionWorkspace réel (`production-capture.html`)

**Barre mix** (Assistant, Copilote, Séparer, Exporter) : **reste ~32 px** en CSS prod (densité validée 28–32 px ; **décision Pascal** pour 44 px). Issue #196 **non fermée** sur ce point.

| Fichier | Contenu |
| --- | --- |
| `i6-production-6-auto-actions-open-1280x720.png` | 6 pistes, tiroir actions ouvert — hauteurs barre + zone pistes + tiroir |
| `i6-production-16-auto-actions-open-1280x720.png` | 16 pistes, même mesures |
| `i6-production-6-auto-mix-toolbar-44-1280x720.png` | **Variante documentaire** uniquement (`#mix-toolbar-44`, classe harness `production-capture-mix-toolbar-44`, **pas** le défaut prod) |

Métriques : `i6-production-metrics.json` (`mixToolbarBarPx`, `mixTracksScrollPx`, `drawerImportRecordHeightsPx`, `mixToolbarBtnHeightsPx`).

### Contraste I1 (`sep-header-1280x720`)

| Élément | Sélecteur / méthode | Attendu (recalcul #196) |
| --- | --- | --- |
| badge licence | `.sep-license-badge` · fond effectif | ~10,43 |
| date | `.sep-license-date` · fond effectif | ~5,87 |
| pastille reco | `.sep-unmeasured-icon` (dans la fiche spotlight) · fond effectif | ~9,58 |
| ✕ exclusion | `.sep-exclusion-x` · fond effectif | ~8,76 |

| Méthode | Usage |
| --- | --- |
| **PR / revue** | captures PNG + `metrics.json` |
| **Calcul exact** | `visibility.browser.ts` (`__effectiveBgRgb`, composition `color(srgb … / α)`) |
| **Pixel** | non utilisé pour I1 (fond composé DOM) |

Tolérance script `capture.mts` : ±0,15 sur les quatre ratios ci-dessus.

Tests comportement : `src/dev/anchoredPopinFooter.behavior.test.ts` (Playwright). Régression B1 legacy : `B1-regression-old-anchored-popin.txt` (échec **pied hors viewport**, pas calage `top ≥ 112`).

## Non testé

WebKitGTK, lecteur d’écran, téléchargement réel, ffmpeg, Vercel preview (quota CI).
