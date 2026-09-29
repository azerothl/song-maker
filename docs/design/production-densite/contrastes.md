# Contrastes WCAG 2.2 — stems Production (pastille + waveform)

Issue : [#159](https://github.com/azerothl/song-maker/issues/159).  
App réelle : harness Vite `production-capture.html` (`#12,confortable,midplay`), Chromium headless, viewport **1280×720**.  
Date : 29/09/2026.

## Méthode

- Couleurs lues avec **`getComputedStyle`** sur l’app React (pas sur la maquette) :
  - pastille : `.production-mix-strip` → `backgroundColor` ;
  - waveform : sonde `background: var(--track-wave)` dans la ligne `.production-mix-row[data-role]` ;
  - fond : `--bg0` sur `:root` → **`#0c0e18`**.
- Partie à venir composite = couleur stem × **opacité 0,65** sur `#0c0e18` (formule alpha-over).
- Partie lue = couleur stem éclaircie de **18 %** vers le blanc (plein opaque, sans halo).
- Ratio = luminance relative WCAG 2.x ; seuil UI non-texte **3:1** (1.4.11).
- Script : `docs/design/production-densite/captures-react/measure-stem-colors.mts` → `stem-colors-metrics.json`.

## Source unique

| Rôle | Token CSS | Hex (pastille = `--track-wave`) |
|---|---|---|
| vocals | `--stem-vocals` | `#ff8fb1` |
| drums | `--stem-drums` | `#5ed8c9` |
| bass | `--stem-bass` | `#7fe0a1` |
| guitar | `--stem-guitar` | `#b79cff` |
| piano | `--stem-piano` | `#ffd76a` |
| other | `--stem-other` | `#9ee06a` |

Miroir TypeScript : `src/lib/trackRoleColors.ts` (`TRACK_ROLE_COLORS`).  
Vérifié : pour les 6 rôles, **pastille === `--track-wave` === hex attendu**.

## Partie à venir (≥ 3:1 sur `#0C0E18`)

| Stem | Couleur | Composite @ 65 % | Ratio | Seuil | Verdict |
|---|---|---|---|---|---|
| vocals | `#ff8fb1` | `#aa627b` | **4,34:1** | 3:1 | OK |
| drums | `#5ed8c9` | `#41918b` | **5,17:1** | 3:1 | OK |
| bass | `#7fe0a1` | `#579771` | **5,56:1** | 3:1 | OK |
| guitar | `#b79cff` | `#7b6aae` | **4,14:1** | 3:1 | OK |
| piano | `#ffd76a` | `#aa914d` | **6,29:1** | 3:1 | OK |
| other | `#9ee06a` | `#6b974d` | **5,64:1** | 3:1 | OK |

Plus faible : guitare **4,14:1** (toujours ≥ 3:1). À l’ancienne opacité ~45 %, guitare passait sous 3:1 (~2,59:1).

## Partie lue (éclaircissement modéré, opaque)

| Stem | Couleur lue | Ratio / `#0c0e18` | Verdict |
|---|---|---|---|
| vocals | `#ffa3bf` | 10,30:1 | OK |
| drums | `#7bdfd3` | 12,22:1 | OK |
| bass | `#96e6b2` | 13,06:1 | OK |
| guitar | `#c4aeff` | 9,94:1 | OK |
| piano | `#ffde85` | 14,69:1 | OK |
| other | `#afe685` | 13,26:1 | OK |

Pas de halo / glow canvas : remplissage plein uniquement.

## Curseur de lecture

Contour `#1a1424` (4 px) + trait `#ffffff` (2 px) — ne dépend pas de la couleur du stem.  
(Aligné avec le transport #157 / relecture Alphonse.)

## Captures 1280×720 (relecture Alphonse)

| Fichier | Scénario |
|---|---|
| [`captures-react/production-stem-colors-midplay-1280x720.png`](captures-react/production-stem-colors-midplay-1280x720.png) | 12 pistes, confortable, playhead ~45 % |
| [`captures-react/production-stem-colors-compact-midplay-1280x720.png`](captures-react/production-stem-colors-compact-midplay-1280x720.png) | 12 pistes, compact, midplay |
| [`captures-react/production-stem-colors-6pistes-midplay-1280x720.png`](captures-react/production-stem-colors-6pistes-midplay-1280x720.png) | 6 pistes, confortable, midplay |

## Note fond waveform

Le cadre `.waveform-frame` reste `#171320` (champ piste). Contrôles manuels à 65 % sur ce fond : tous les stems restent ≥ 4,07:1. Le critère #159 porte sur **`#0C0E18`** (`--bg0`).

## Régénération

```bash
pnpm exec tsx docs/design/production-densite/captures-react/measure-stem-colors.mts
```
