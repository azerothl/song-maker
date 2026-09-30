# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (Refs **#186** — ne ferme pas le ticket ; **#193** tokens).

## SHA

- **HEAD PR** : voir le commit de tête de la branche `cursor/primary-btn-i2-i3-ca11` (dernier commit de cette PR).
- **Captures** : `captures-react/metrics.json` → `captureGitSha` = commit enregistré au lancement de `capture.mts` (méthode anti-circularité).

## Inventaire

[`inventaire.md`](inventaire.md) — **39** usages produit + **1** harnais. Tableau **écran × bouton × état** avec **[M]** mesuré / **[C]** calculé / **[—]** non testé.

**15** scénarios Playwright (dont popin Exporter `aria-disabled` 0 piste et gate bloqué). **17** usages restent sans capture dédiée (Créer avancé, enregistrement, Confirmer mix/copilote, MIDI, partition, clips, dialogues profils, etc.).

## Preuves

- [`captures-react/`](captures-react/) — PNG (`-clip.png` ou `-1280x720.png`) + `metrics.json` + `capture.mts`
- [`contrastes.md`](contrastes.md) — synthèse régénérée
- Tests : `src/lib/primaryButtonContrast.test.ts` (désactivé **5,36:1**, I3 deux tons, règles CSS)

Texte désactivé : **`#848ba0`** sur **`#12151f`** → **`disabledTextRatioOnFace`** dans `metrics.json` (actuellement **5,36**).

## I2 / I3

- **I2** — `:disabled` + `aria-disabled="true"` : même rendu sombre à tirets (≥ 4,5:1).
- **I3** — Anneau inset barre mix avec liseré **#151827** ; popins Assistant/Copilote **non** ciblés (sélecteur `>`).

## Non testé / #212

WebKitGTK, lecteur d’écran, `forced-colors`, rognages d’anneau hors barre mix.
