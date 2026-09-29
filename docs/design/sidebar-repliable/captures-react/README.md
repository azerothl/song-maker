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
| `sidebar-react-replie-icon-center-avant-1280x720.png` | replié, régression gap (#161) |
| `sidebar-react-replie-icon-center-apres-1280x720.png` | replié, icônes centrées (28 px ±1) |
| `sidebar-react-replie-tooltip-1280x720.png` | replié + survol Bibliothèque |
| `sidebar-react-replie-tooltip-avant-echap-1280x720.png` | infobulle avant Échap |
| `sidebar-react-replie-tooltip-apres-echap-1280x720.png` | après Échap |
| `sidebar-react-replie-tip-pointer-avant-1280x720.png` | replié sans survol, avant #165 (infobulles captaient la souris) |
| `sidebar-react-replie-tip-pointer-apres-1280x720.png` | replié sans survol, après #165 |
| `sidebar-react-replie-library-click-1280x720.png` | replié + clic titre Bibliothèque |
| `sidebar-react-focus-toggle-1280x720.png` | focus bascule |
| `sidebar-react-auto-1024x700.png` | `#auto` viewport 1024×700 |

### `metrics.json`

- `collapsedIconCenters` : centre horizontal de chaque icône (SVG / `brand-mark`) vs centre colonne 56 px.
- `checks.iconCenterById` : un booléen par icône ; `collapsedIconsCentered` si toutes à **28 px ±1**.
- `deplie_1280_ref` / `deplie_1280` : largeurs dépliées inchangées après correctif.
- `replie_icon_center_avant_1280` / `replie_icon_center_apres_1280` : avant / après centrage.
- `tip_pointer_avant_1280` / `tip_pointer_apres_1280` : `elementFromPoint` au centre de chaque zone d’infobulle (#165).
- `tooltip_after_leave_1280`, `tooltip_bridge_1280`, `tooltip_focus_escape_1280`, `library_click_after_collapse_1280` : scénarios WCAG / Bibliothèque.
