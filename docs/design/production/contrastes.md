# Contrastes WCAG — stems Production (#159)

Mesures **réelles** : harness `production-capture.html` (`#16,auto,expanded,midplay`), Chromium 1280×720.
Pastille = `getComputedStyle(.production-mix-strip)` ; pixels canvas = barre pleine à gauche (lue) / droite (à venir) du curseur.
Groupe replié : `#16,auto,collapsed,midplay` — capture `production-stem-colors-collapsed-midplay-1280x720.png`.

## Source unique (après)

| Rôle | Hex (`TRACK_ROLE_COLORS` = pastille = `--track-wave`) |
|---|---|
| vocals | `#ff8fb1` |
| drums | `#5ed8c9` |
| bass | `#7fe0a1` |
| guitar | `#b79cff` |
| piano | `#ffd76a` |
| other | `#9ee06a` |

## Partie à venir @ 65 % — mesure DOM (pixels canvas)

Fond canvas (`.waveform-frame`) : **#171320**. Seuil **3:1**.

| Stem (plus sombres d’abord, DOM) | Pixel à venir | Ratio sur fond |
|---|---|---|
| guitar | `#7f6cb1` | **4.07:1** |
| vocals | `#ae647e` | **4.28:1** |
| drums | `#45938e` | **5.06:1** |
| bass | `#5a9974` | **5.43:1** |
| other | `#6f9950` | **5.52:1** |
| piano | `#ae9350` | **6.16:1** |

## Écart partie lue / à venir — mesure DOM (≥ 1,3:1)

| Stem | Pixel lue | Pixel à venir | Ratio |
|---|---|---|---|
| guitar | `#d2c2ff` | `#7f6cb1` | **2.76:1** |
| vocals | `#ffc2d4` | `#ae647e` | **2.83:1** |
| drums | `#87e2d7` | `#45938e` | **2.39:1** |
| bass | `#a3efbe` | `#5a9974` | **2.51:1** |
| other | `#b9ef8e` | `#6f9950` | **2.49:1** |
| piano | `#ffe59d` | `#ae9350` | **2.39:1** |

## Calcul théorique (65 % sur `--bg0`, non DOM)

| Stem | Composite calculé | Ratio | Écart lue/à venir |
|---|---|---|---|
| guitar | `#7b6aae` | 4.14:1 | 2.86:1 |
| vocals | `#aa627b` | 4.34:1 | 2.94:1 |
| drums | `#41918b` | 5.17:1 | 2.46:1 |
| bass | `#579771` | 5.56:1 | 2.58:1 |
| other | `#6b974d` | 5.64:1 | 2.57:1 |
| piano | `#aa914d` | 6.29:1 | 2.47:1 |

## Groupe Rythmique replié (mesure DOM)

Rôle échantillon : **drums** (`rythmique`). À venir **5.06:1** ; écart lue/à venir **2.39:1** ; pastille = waveform : **oui**.

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
