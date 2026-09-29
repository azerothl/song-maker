# Contraste boutons primaires — inventaire (#193)

- [`inventaire.md`](inventaire.md) : les 35 usages `btn primary`, regroupés par écran.
- Mesures et captures : [`../boutons-primaires/`](../boutons-primaires/).

## `forced-colors`

État désactivé du primaire : `GrayText` + bordure `GrayText` dans `@media (forced-colors: active)` (`src/App.css`). Pas de revalidation manuelle sous Windows High Contrast dans cette PR.

## Focus

Anneau global `:where(button, …):focus-visible` dans `App.css` (l.82–85). Aucune règle `.btn.primary:focus-visible` redondante dans le dépôt (vérifié avant suppression).
