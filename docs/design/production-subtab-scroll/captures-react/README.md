# Captures React — défilement sous-onglets Production (#203)

> Archive du fonctionnement antérieur à la page commune (#258, 01/10/2026). Les PNG et chiffres ci-dessous décrivent les anciens sous-onglets ; ils ne décrivent plus l’interface actuelle. Les anciennes valeurs de hauteur ne sont plus un contrat du produit. Le script historique ne doit pas être utilisé pour publier des preuves de la page commune.

Les preuves actuelles sont dans [`production-common-page`](../../production-common-page/README.md) et [`production-editing`](../../production-editing/README.md). Les tests `productionSubtabScroll.behavior.test.ts` couvrent la page commune, PageDown depuis un bouton, la sortie de la timeline par Tab, les réglages avancés repliables et l’absence de débordement horizontal à 1280 et 640 px. L’heure du harnais reste fixée à 08:02. Les mesures dépendent de la machine et des polices ; aucune comparaison pixel-exacte n’est annoncée.

Harness : Vite + `production-capture.html`, Chromium (channel `chrome` si dispo), PNG réels.

## Variance machine / police

Les captures PNG et les métriques DOM **dépendent de la machine, du moteur Chromium et des polices installées**. Ne pas promettre un rendu pixel-exact. La plage observée **2,24 %–9,36 %** de pixels différents (même scènes) n’est valable que pour **Chrome stable** (channel `chrome`) ; Playwright Chromium bundlé ou une autre version peut diverger davantage. Les seuils de tests tolèrent ±2 px sur les hauteurs de zone Mix ; les `clientHeight` / empreintes SHA dans `metrics-after.json` sont des mesures d’un run donné, pas une référence universelle.

L’heure d’enregistrement Mix est figée à **« 08:02 »** dans le harness (`productionCaptureMain.tsx`) pour stabiliser le chrome texte des captures Mix.

## Génération

```bash
CAPTURE_PHASE=after pnpm exec tsx docs/design/production-subtab-scroll/captures-react/capture.mts
```

Viewports : **1280×720**, **1280×768**, **1280×640**. Hashs : `#confortable-12` (Mix), `#view-tools-12` (Outils), `#view-clips-16` (Clips).

Le harness régénère **9** PNG `after/` (mix + tools + clips × 3 hauteurs) et réécrit `metrics-after.json`.

## Fichiers `after/` (présents dans le dépôt)

| Fichier | Vue |
| --- | --- |
| `mix-1280x720-after.png` | Mix actif — panneaux Clips/Outils masqués |
| `mix-1280x768-after.png` | Mix, 768 px de hauteur |
| `mix-1280x640-after.png` | Mix, 640 px de hauteur |
| `tools-1280x720-after.png` | Outils — rack d'effets atteignable |
| `tools-1280x768-after.png` | Outils, 768 px |
| `tools-1280x640-after.png` | Outils, 640 px |
| `clips-1280x720-after.png` | Clips — bande haute 200 px + timeline |
| `clips-1280x768-after.png` | Clips, 768 px |
| `clips-1280x640-after.png` | Clips, 640 px |

`metrics-after.json` : métriques mesurées par `capture.mts` (`hiddenPanelsLeaking` doit rester `false` sur chaque scène).

Référence Alphonse (revue #204 / suivi #208) — Outils `clientHeight` **417 / 465 / 337** (720 / 768 / 640) ; timeline Clips `lanesClientHeightPx` **210 / 258 / 130** ; **3** pistes 44 px entières visibles à 768 (pas 4). Un run local peut différer de ±2 px (voir variance ci-dessus ; plage 2,24–9,36 % = Chrome stable seulement).

## data-testid (PR #204)

- `production-tools-scroll`, `production-clips-scroll`, `production-clips-panel`
- `clip-timeline-lanes`, `phase3-fx-rack`

Tests : `src/dev/productionSubtabScroll.behavior.test.ts`.
