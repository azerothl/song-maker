# Contrastes — boutons primaires (#186, #193)

Généré le 2026-09-29T23:44:38.252Z.

Mesures DOM : `getComputedStyle` + ΔE00 (face/bordure) pour primaire désactivé vs secondaire actif dans les popins. Focus : Tab clavier, souris hors cible, `:focus-visible` réel.

Seuil WCAG 2.2 AA texte actif : **4,5:1** ; libellé désactivé : **≥ 3:1** (cible ~4,7:1).

## Synthèse

| Écran | Bouton | Min (états actifs) | AA | Focus visible |
|-------|--------|--------------------|----|---------------|
| Créer | Générer | 6.47:1 | OK | oui |
| Production — Exporter (déclencheur) | Exporter | 6.47:1 | OK | oui |
| Production — Exporter (popin, primaire désactivé) | Exporter | 6.18:1 | OK | non |
| RegenerationGate | Capturer et générer | 6.18:1 | OK | non |

## Créer — `.song-create-generate-btn`

| État | Texte | Opacité | Curseur | Arrêt | Fond | Ratio | AA |
|------|-------|---------|---------|-------|------|-------|----|
| normal | #151827 | 1 | pointer | accent | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | pointer | accent-2 | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | pointer | accent | #c4a8ff | 8.72:1 | OK |
| hover | #151827 | 1 | pointer | accent-2 | #a78bfa | 6.47:1 | OK |
| focus | #151827 | 1 | pointer | accent | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | pointer | accent-2 | #a78bfa | 6.47:1 | OK |

Focus : `:focus-visible`=true, outline=2px rgb(94, 236, 248) offset 2px, contraste anneau≈1.43:1.

| disabled | #848ba0 | 1 | not-allowed | disabled-flat | #000000 | 6.18:1 | OK |

### Captures

- [`creer-primary-normal-1280x720.png`](captures-react/creer-primary-normal-1280x720.png)
- [`creer-primary-hover-1280x720.png`](captures-react/creer-primary-hover-1280x720.png)
- [`creer-primary-focus-1280x720.png`](captures-react/creer-primary-focus-1280x720.png)
- [`creer-primary-disabled-1280x720.png`](captures-react/creer-primary-disabled-1280x720.png)

## Production — Exporter (déclencheur) — `.song-actions-export .btn.primary`

| État | Texte | Opacité | Curseur | Arrêt | Fond | Ratio | AA |
|------|-------|---------|---------|-------|------|-------|----|
| normal | #151827 | 1 | pointer | accent | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | pointer | accent-2 | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | pointer | accent | #c4a8ff | 8.72:1 | OK |
| hover | #151827 | 1 | pointer | accent-2 | #a78bfa | 6.47:1 | OK |
| focus | #151827 | 1 | pointer | accent | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | pointer | accent-2 | #a78bfa | 6.47:1 | OK |

Focus : `:focus-visible`=true, outline=2px rgb(94, 236, 248) offset 2px, contraste anneau≈1.43:1.

| disabled | #848ba0 | 1 | not-allowed | disabled-flat | #000000 | 6.18:1 | OK |

### Captures

- [`production-export-trigger-normal-1280x720.png`](captures-react/production-export-trigger-normal-1280x720.png)
- [`production-export-trigger-hover-1280x720.png`](captures-react/production-export-trigger-hover-1280x720.png)
- [`production-export-trigger-focus-1280x720.png`](captures-react/production-export-trigger-focus-1280x720.png)
- [`production-export-trigger-disabled-1280x720.png`](captures-react/production-export-trigger-disabled-1280x720.png)

## Production — Exporter (popin, primaire désactivé) — `.export-dialog-popin .btn-row .btn.primary`

ΔE00 face primaire désactivé / secondaire actif : **15.08** ; bordures identiques : non.

| État | Texte | Opacité | Curseur | Arrêt | Fond | Ratio | AA |
|------|-------|---------|---------|-------|------|-------|----|
| normal | #848ba0 | 1 | not-allowed | disabled-flat | #000000 | 6.18:1 | OK |

### Captures

- [`production-export-popin-primary-disabled-normal-1280x720.png`](captures-react/production-export-popin-primary-disabled-normal-1280x720.png)

## RegenerationGate — `.modal.regeneration-gate .btn-row .btn.primary`

ΔE00 face primaire désactivé / secondaire actif : **15.08** ; bordures identiques : non.

| État | Texte | Opacité | Curseur | Arrêt | Fond | Ratio | AA |
|------|-------|---------|---------|-------|------|-------|----|
| normal | #848ba0 | 1 | not-allowed | disabled-flat | #000000 | 6.18:1 | OK |

### Captures

- [`regeneration-gate-primary-disabled-normal-1280x720.png`](captures-react/regeneration-gate-primary-disabled-normal-1280x720.png)
- [`regeneration-gate-cancel-focus-1280x720.png`](captures-react/regeneration-gate-cancel-focus-1280x720.png)
