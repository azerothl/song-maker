# Bench — ouverture onglet Partition

## Lancer

```bash
pnpm bench:score-tab
```

Prérequis : Chromium Playwright (`pnpm exec playwright install chromium` une fois).

La sortie JSON est écrite dans `bench/score-tab-last.json` et affichée sur stdout.

## Scénario

1. Partition de référence (`src/bench/referenceScoreDocument.ts`) : ~1 200 notes, export ABC ~1 300 lignes, timeline étirée (piano-roll large).
2. Chromium headless charge `score-tab-bench.html`, qui monte `ScorePanel` comme à l’ouverture de l’onglet Partition.
3. Mesures :
   - **Long Tasks** (`PerformanceObserver`, seuil navigateur 50 ms)
   - **ouverture → portée visible** : jusqu’à la présence du SVG abcjs (référence + partition longue ~8×)
   - Micro-bancs : `abcjs.renderAbc` avec / sans `responsive: "resize"`, reflow SVG forcé, rafales `resize` post-ouverture

## Interprétation (profil attributif)

| Phase | Cause |
| --- | --- |
| `attente rendu portée (abcjs useEffect)` | `abcjs.renderAbc` synchrone sur tout l’ABC exporté |
| `reflow SVG` | Mise en page du SVG (~10⁴ nœuds, hauteur ~10⁵ px pour la référence) |
| `rafales resize après montage` | `responsive: "resize"` + `viewportHorizontal` enregistrent la portée dans `resizeDivs` ; chaque `resize` fenêtre ajuste la largeur et force une mise en page coûteuse |

Le rendu piano-roll en onglet caché n’est plus monté à l’ouverture (voir correctif dans `ScorePanel`).

## Bench — waveforms en lecture (#232)

```bash
pnpm bench:waveform-playback
```

Chromium headless, harness `waveform-playback-bench.html` : pour 12 et 16 pistes, 120 frames RAF, compare le chemin **legacy** (2× boucle `peaks` + `setState` React) au chemin **optimisé** (bus `emitPlaybackPosition` + calques `drawImage`).

Sorties :

- `bench/waveform-playback-last.json` — rapport complet
- `bench/waveform-playback-before.json` — baseline legacy (figée au premier run)
- `bench/waveform-playback-after.json` — dernier run optimisé
