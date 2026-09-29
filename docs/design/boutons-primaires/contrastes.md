# Contrastes — boutons primaires (#186)

Généré le 2026-09-29T22:06:21.585Z.

Mesures DOM : `getComputedStyle` (couleur du texte, opacity) + résolution des arrêts du dégradé (`--accent` / `--accent-2`, ou `color-mix` désactivé) via sonde, compositées sur `--bg0`. Seuil WCAG 2.2 AA texte : **4,5:1**.

## Synthèse

| Écran | Bouton | Min (tous états) | AA |
|-------|--------|------------------|----|
| Bibliothèque | Nouveau morceau | 6.47:1 | OK |
| Créer | Générer | 6.47:1 | OK |

## Bibliothèque — `.panel.library .btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | AA |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | accent | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | accent-2 | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | accent | #c4a8ff | 8.72:1 | OK |
| hover | #151827 | 1 | accent-2 | #a78bfa | 6.47:1 | OK |
| focus | #151827 | 1 | accent | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | accent-2 | #a78bfa | 6.47:1 | OK |
| disabled | #151827 | 1 | disabled-top | #dac9ff | 11.56:1 | OK |
| disabled | #151827 | 1 | disabled-bottom | #c8b7fc | 9.76:1 | OK |

## Créer — `.song-create-generate-btn`

| État | Texte | Opacité | Arrêt | Fond | Ratio | AA |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | accent | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | accent-2 | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | accent | #c4a8ff | 8.72:1 | OK |
| hover | #151827 | 1 | accent-2 | #a78bfa | 6.47:1 | OK |
| focus | #151827 | 1 | accent | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | accent-2 | #a78bfa | 6.47:1 | OK |
| disabled | #151827 | 1 | disabled-top | #dac9ff | 11.56:1 | OK |
| disabled | #151827 | 1 | disabled-bottom | #c8b7fc | 9.76:1 | OK |

## Captures

- [`bibliotheque-primary-1280x720.png`](captures-react/bibliotheque-primary-1280x720.png)
- [`creer-primary-1280x720.png`](captures-react/creer-primary-1280x720.png)

