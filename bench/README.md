# Bench — ouverture onglet Partition

## Lancer

```bash
pnpm bench:score-tab
```

Prérequis : Chromium Playwright (`pnpm exec playwright install chromium` une fois).

La sortie JSON est écrite dans `bench/score-tab-last.json` (gitignoré) et affichée sur stdout. Ne pas committer les JSON de bench.

## Scénario

1. Partition de référence (`src/bench/referenceScoreDocument.ts`) : ~1 200 notes, export ABC ~1 300 lignes, timeline étirée (piano-roll large).
2. Chromium headless charge `score-tab-bench.html`, qui monte `ScorePanel` comme à l’ouverture de l’onglet Partition.
3. Mesures :
   - **Long Tasks** (`PerformanceObserver`, seuil navigateur 50 ms)
   - **ouverture → portée visible** : jusqu’à la présence du SVG abcjs (référence + partition longue ~8×)
   - **bascule portée → piano roll** : clic `#score-view-piano` après rendu portée ; temps jusqu’à grille focusable + nombre de boutons `.piano-note` dans le DOM
   - Micro-bancs : `abcjs.renderAbc` avec / sans `responsive: "resize"`, reflow SVG forcé, montage `PianoRoll` (reflow grille), rafales `resize` post-ouverture

## Interprétation (profil attributif)

| Phase | Cause |
| --- | --- |
| `attente rendu portée (abcjs useEffect)` | `abcjs.renderAbc` synchrone sur tout l’ABC exporté |
| `reflow SVG` | Mise en page du SVG (~10⁴ nœuds, hauteur ~10⁵ px pour la référence) |
| `rafales resize après montage` | `responsive: "resize"` + `viewportHorizontal` enregistrent la portée dans `resizeDivs` ; chaque `resize` fenêtre ajuste la largeur et force une mise en page coûteuse |

Le rendu piano-roll en onglet caché n’est plus monté à l’ouverture (voir correctif dans `ScorePanel`).
