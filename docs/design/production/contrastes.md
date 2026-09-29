# Contrastes WCAG — stems Production (#159)

Mesures **réelles** : harness `production-capture.html` (`#16,auto,expanded,midplay`), Chromium 1280×720.
Pastille = `getComputedStyle(.production-mix-strip)` ; waveform = `var(--track-wave)` + pixels canvas.

## Source unique (après)

| Rôle | Hex (`TRACK_ROLE_COLORS` = pastille = `--track-wave`) |
|---|---|
| vocals | `#ff8fb1` |
| drums | `#5ed8c9` |
| bass | `#7fe0a1` |
| guitar | `#b79cff` |
| piano | `#ffd76a` |
| other | `#9ee06a` |

## Partie à venir @ 65 % sur fond réel

Fond `--bg0` / canvas : **#0c0e18**. Seuil **3:1**.

| Stem (plus sombres d’abord) | Composite | Ratio DOM/théorie |
|---|---|---|
| guitar | `#7b6aae` | **11.21:1** |
| vocals | `#aa627b` | **12.10:1** |
| drums | `#41918b` | **12.07:1** |
| bass | `#579771` | **13.60:1** |
| other | `#6b974d` | **13.33:1** |
| piano | `#aa914d` | **14.53:1** |

## Écart partie lue / à venir (≥ 1,3:1)

| Stem | Ratio |
|---|---|
| guitar | **2.76:1** |
| vocals | **2.83:1** |
| drums | **2.39:1** |
| bass | **2.53:1** |
| other | **2.51:1** |
| piano | **2.41:1** |

## Avant #159 (opacité 48 %, bases héritées)

| Stem | Ratio @ 48 % |
|---|---|
| bass | 2.48:1 |
| piano | 2.48:1 |
| vocals | 2.99:1 |
| guitar | 3.01:1 |
| other | 3.01:1 |
| drums | 3.86:1 |

Régénération : `pnpm exec tsx docs/design/production/captures-react/measure-stem-colors.mts`
