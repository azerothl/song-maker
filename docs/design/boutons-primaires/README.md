# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issues #186 / #193).

## Problème

1. Texte blanc sur le dégradé accent (~2,0–2,7:1) — corrigé dans #189 (`#151827`).
2. État **désactivé** et **survol** — #192 / #193.
3. Preuves focus clavier et inventaire par usage — #186 (cette livraison).

## Correction CSS (#193, sur `main`)

- Texte actif `#151827` sur dégradé accent.
- **Survol** : dégradé plus lumineux (mesuré distinct du normal).
- **Focus** : anneau cyan via `button:focus-visible` global.
- **Désactivé** : texte `#848ba0` (**4,73:1** sur `#1c2034`), fond éteint, bordure en tirets.
- `forced-colors` : **non traité**.

## Contenu

- [`inventaire.md`](inventaire.md) — 35 usages, statut vérifié / non vérifié.
- [`contrastes.md`](contrastes.md) — synthèse DOM régénérée par le script.
- [`captures-react/`](captures-react/) — PNG + `metrics.json` + `capture.mts`.

## Points signalés (sans correctif dans la PR preuves)

- **I2** — Popin : ΔE00 face désactivé / ghost ~1,51 ; bordure tirets ~1,6:1 sur le fond (cible ~3:1).
- **I3** — Anneau focus parfois rogné (Exporter barre / bas popin) — voir captures `*-focus-*`.
