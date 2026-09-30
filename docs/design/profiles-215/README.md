# Profils — barre repliée (#215)

**Base de rebase** : `f83c10af8343d0655a53bd2b83404724a3f5e11c` (`main`, #216 + #205/#206/#208).  
Captures PNG et `captures/apres/metrics.json` régénérés après ce rebase (`VITE_CAPTURE=1`, `profiles-app-capture.html`).

**SHA256 `metrics.json`** : voir `captures/apres/metrics.sha256` (généré avec les PNG du même run).

## B1 — barre dépliée, menu ouvert (1280×720, 3 profils)

| Version | `menuHeight` (px) | libellés tronqués |
|---------|------------------:|:-----------------:|
| `main` (f83c10a, réf. relecture) | 401,7 | non |
| PR avant correctif B1 (d2a8518) | 281,7 | oui |
| PR après correctif (métriques ci-dessous) | 401,72 | non |

## Popover barre repliée (mesuré)

Voir `captures/apres/metrics.json` → `popover` (1280 / 1024 / 640 px).  
Résumé : `width` 288, `gapTriggerToPopoverPx` 8, pas de chevauchement bouton/barre, `menuZIndex` 40, `sidebarZIndex` 30.

## 6 profils, barre repliée (640 px haut)

`metrics.json` → `sixProfilesViewport` : popover dans le viewport (`popoverWithinViewport: true`).

## Comportement (mesuré)

`src/dev/profileSelectorCollapsed.behavior.test.ts` sur le vrai `<App/>` (25 exécutions consécutives sans échec).

## Réserves mineures (non traitées)

- Popover 12 profils : bas hors viewport si `max-height: calc(100dvh - 16px)` avec `top` aligné bouton (max produit = 6).
- Clic extérieur sur un champ : focus rendu au bouton profil (spec #215), pas au champ cliqué.
- Pas de capture simultanée popover + dialogue modal.
- Clé `profiles.selector.menuTitle` inutilisée (remplacée par `menuKicker`).
- Critère « défilement Bibliothèque » retiré (#215) : faux positif dans le harnais ; `.main { min-height: 0 }` conservé sans preuve dédiée.

## a11y

`profileDialogA11y.ts` : version `main` (#216), sans réécriture locale.
