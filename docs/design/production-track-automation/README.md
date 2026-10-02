# Automation sous chaque piste

La bascule du popover de piste / l’onglet **Automation** ouvre une courbe Volume/Panoramique sous cette piste. Ajout à la position de lecture ou à un temps saisi, clic sur la courbe, déplacement par glisser, champs numériques et flèches clavier. Temps en **ms**. Courbe vide permise : message `production.auto.empty` (`role="status"`). Les mouvements clavier annoncent le point focalisé (`aria-live`).

## a11y livré (suite #229)

- Message courbe vide
- Annonces clavier (valeur du point après ↑↓←→)
- Onglet Automation → déplie la courbe sous la piste (ferme le popover)

## Non testé

- **Écoute native** (stems réels / cuisson audio dans Tauri) — non testé
- Lecteur d’écran réel, glisser tactile, campagne de mutations exhaustive
- Fenêtre Tauri hors Chromium harness

Validation observée : `productionTrackAutomation.behavior.test.ts` (FR 1280 / EN 640). Captures React démo dans `captures/`.

Refs #229.
