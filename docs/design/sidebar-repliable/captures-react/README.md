# Captures React — barre latérale repliable

Captures **réelles** (`sidebar-capture.html`, mock Tauri), mesures `getBoundingClientRect` + styles calculés dans `metrics.json`.

## Génération

```bash
pnpm exec tsx docs/design/sidebar-repliable/captures-react/capture.mts
```

## Contraste survol

Voir `../contrastes.md` : ratio documenté par constantes maquette, ou lu dans le DOM (`hoverContrast.source`) sur le scénario survol / infobulle.

## Fichiers

| PNG | Scénario |
|-----|----------|
| `sidebar-react-deplie-1280x720.png` | `#expanded` |
| `sidebar-react-replie-1280x720.png` | `#collapsed` |
| `sidebar-react-replie-tooltip-1280x720.png` | replié + survol Bibliothèque (infobulle visible après délai CSS) |
| `sidebar-react-replie-tooltip-avant-echap-1280x720.png` | infobulle visible avant Échap (WCAG 1.4.13) |
| `sidebar-react-replie-tooltip-apres-echap-1280x720.png` | après Échap : `tip-off`, infobulle masquée |
| `sidebar-react-focus-toggle-1280x720.png` | focus clavier sur la bascule |
| `sidebar-react-auto-1024x700.png` | `#auto` viewport 1024×700 |

### `metrics.json`

- `hoverContrast` : ratio, couleurs, `source` (`dom` ou `constants`).
- `tooltip` (scénarios survol / Échap avant) : taille, position, `gapToTriggerPx`, contraste texte/fond de l’infobulle.
- `checks.tooltipVisible` : `true` lorsque l’infobulle est réellement affichée (opacité ≥ 0,95, boîte non nulle).
