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
| `sep-header-1280x720.png` | Contraste I1 sur fond effectif (`__effectiveBgRgb` + composition alpha) | **mesuré** (calcul exact) |
| `sep-header-1280x768.png` / `sep-header-1280x640.png` | Recouvrement popin « Séparer » / déclencheur `sepRecommendAnchorOverlapPx` **0** ; notice HTDemucs ≥ **14 px** | **mesuré** |
| `sep-recommended-visible-1280x720.png` | Fiche reco complète sans défilement (`spotlightReach`, `scrollTop≈0`) | **mesuré** |
| `sep-focus-vocals-1280x768.png` | Cas **Voix** — fiche compacte entière (`spotlightReach`, `spotlightFooterClearancePx ≥ 0`) | **mesuré** |
| `sep-focus-vocals-1280x720.png` | Cas **Voix** @720 — compacte, pied visible (`spotlightFooterClearancePx ≥ 0`) | **mesuré** |
| `sep-selection-cachee-1280x720.png` | « Autres modèles » fermé — bandeau nomme le modèle + **Revenir à la recommandation**, pas de fiche spotlight | **mesuré** |
| `export-drawer-b1-12-1280x768.png` | **B1** — « Pistes séparées » + 12 cases avant le pied | **mesuré** |

### I6 — ProductionWorkspace réel (`production-capture.html`)

**Barre mix** : **~32 px** en prod (décision Pascal pour 44 px). **Tiroir** : Séparer / Exporter / Importer / Enregistrer **44 px** (`i6-production-metrics.json`). Une **nouvelle page** Playwright par scène (évite le hash 6/16 stale).

| Scène | scrollHeight zone pistes (mesuré) |
| --- | --- |
| 6 pistes, tiroir ouvert | ~478 |
| 16 pistes, tiroir ouvert | ~774 |

Recouvrement popin export / bouton Exporter (6 pistes, tiroir ouvert, Exporter 44 px) : `exportPopinOverlapPx` **0** dans `i6-production-metrics.json` (popin `max-height` ~473 px).

À l’ouverture du dialogue séparation, `setFocus("mix")` réinitialise le focus reco (comportement #196).

### Contraste I1 (`sep-header-1280x720`)

Chaque ratio est lié à **une** méthode. L’écart entre « calcul exact » et « pixel » vient de l’**arrondi des canaux RGB** dans `__effectiveBgRgb` avant le ratio WCAG (fond composé `color(srgb … / α)`).

| Élément | Calcul exact (`capture.mts`) | Arrondi affiché | Pixel (échantillon DOM) |
| --- | --- | --- | --- |
| badge licence | 10,4737 | 10,47 | 10,52 |
| date | 5,8974 | 5,90 | 5,92 |
| pastille `.sep-unmeasured-icon` | 9,5548 | 9,55 | 9,58 |
| ✕ exclusion | 8,7437 | 8,74 | 8,79 |

| Méthode | Rôle |
| --- | --- |
| **Calcul exact** | `visibility.browser.ts` — `__effectiveBgRgb` + `__contrastRatioRgb` |
| **Pixel** | même pipeline sur couleurs arrondies à l’entier (rejeu local, non commité comme vérité unique) |
| **PR / revue** | PNG + `metrics.json` (`contrast.*`) |

Tolérance script : ±0,15 sur les valeurs « calcul exact » ci-dessus.

`metrics.json` : les `rect.*` des mesures de visibilité sont arrondis à **2 décimales** à l’écriture (reproductibilité CI / polices). Les contrastes restent en pleine précision.

### PNG captures (29 fichiers, 29 empreintes distinctes)

Chaque PNG a une empreinte SHA-256 distincte (29/29). Une clé `metrics.json` par scène/viewport.

### Tolérance `metrics.json` (regen-gate et badges)

- `capture.mts` attend `document.fonts.ready` et, pour `sep-header`, que `popin.top ≥ anchor.bottom` avant mesure.
- Écarts acceptables entre régénérations sur **positions** (`unmeasuredBadgeReach.rect.right`, `regen-gate-blocked`, etc.) : **±1 px** sur `rect.*` et **±0,01** sur les flottants arrondis, tant que les contrastes `contrast.*` restent identiques au centième.
- Les tests commités comparent les invariants (overlap ≤ 0,51 px, `footerReach.reachable`, contrastes ≥ 4,5) plutôt qu’une égalité bit-à-bit du JSON.
- `data-testid="sep-recommend-trigger"` : déjà documenté dans les harness / mesures d’overlap.

## Non testé

Tauri natif, WebKitGTK, lecteur d’écran, téléchargement réel des modèles, onglets Créer / Partition / Versions.
