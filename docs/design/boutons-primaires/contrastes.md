# Contrastes — boutons primaires (#186)

Généré le 2026-10-01T09:11:53.816Z — commit des captures : `222f18f3c61526c6006686c1728ba9a7cdbb567a`.

Mesures DOM : `getComputedStyle` (dégradé / fond plat, `color(srgb …/α)` résolu) composé sur `--bg0`.
- États actifs : seuil WCAG 2.2 AA **4.5:1**.
- Désactivé : texte **#848ba0** (~**5,36:1** sur **#12151f**), seuil lisibilité **3:1**.
- Focus : Tab + souris hors bouton ; contraste anneau mesuré contre le **fond** derrière l’outline (pas la face du bouton).
- Aucune nouvelle revue manuelle : les résultats de cette exécution sont les mesures DOM dans `screens`. Les valeurs historiques ne sont pas réattribuées aux nouvelles captures.

## Synthèse

| Écran | Bouton | Min actif | OK | Focus `:focus-visible` |
|-------|--------|-----------|----|------------------------|
| Bibliothèque | Nouveau morceau | 6.47:1 | OK | oui |
| Créer | Générer | 6.47:1 | OK | oui |
| Production — Armer | Armer | 6.47:1 | OK | oui |
| Production — Exporter (déclencheur) | Exporter | 6.47:1 | OK | oui |
| Production — Exporter (popin) | Exporter | 6.47:1 | OK | oui |
| Production — Exporter (popin, 0 piste) | Exporter | 6.47:1 | OK | oui |
| Production — Mesurer le mix rendu | Mesurer le mix rendu | 6.47:1 | OK | oui |
| Production — Créer l'archive ZIP | Créer l’archive ZIP | 6.47:1 | OK | oui |
| Réglages — LoRA | Télécharger vers le cache | 6.47:1 | OK | oui |
| Confirmation — RegenerationGate (actif) | Capturer et générer | 6.47:1 | OK | oui |
| RegenerationGate — primaire bloqué | Capturer et générer | 5.36:1 | FAIL (harnais) | oui |
| Confirmation — InvariantPanel | Vérifier | 6.47:1 | OK | oui |
| Confirmation — RemoteGenerateConfirm | Consentir et envoyer | 6.47:1 | OK | oui |
| Confirmation — SeparationRecommendDialog | Lancer la séparation | 6.47:1 | OK | oui |
| Confirmation — UpdateNotice | Mettre à jour | 6.47:1 | OK | oui |

## Bibliothèque — `.panel.library .btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #1c1934, contraste anneau/fond min–max **10.05–13.58:1**.

### Captures

- [`bibliotheque-primary-normal-clip.png`](captures-react/bibliotheque-primary-normal-clip.png)
- [`bibliotheque-primary-hover-clip.png`](captures-react/bibliotheque-primary-hover-clip.png)
- [`bibliotheque-primary-focus-clip.png`](captures-react/bibliotheque-primary-focus-clip.png)

## Créer — `.song-create-generate-btn`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #111221, contraste anneau/fond **13.58:1**.

### Captures

- [`creer-primary-normal-clip.png`](captures-react/creer-primary-normal-clip.png)
- [`creer-primary-hover-clip.png`](captures-react/creer-primary-hover-clip.png)
- [`creer-primary-focus-clip.png`](captures-react/creer-primary-focus-clip.png)
- [`creer-primary-disabled-clip.png`](captures-react/creer-primary-disabled-clip.png)

## Production — Armer — `.record-panel button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #1c1934, contraste anneau/fond min–max **10.05–13.58:1**.

### Captures

- [`production-armer-primary-normal-clip.png`](captures-react/production-armer-primary-normal-clip.png)
- [`production-armer-primary-hover-clip.png`](captures-react/production-armer-primary-hover-clip.png)
- [`production-armer-primary-focus-clip.png`](captures-react/production-armer-primary-focus-clip.png)
- [`production-armer-primary-disabled-clip.png`](captures-react/production-armer-primary-disabled-clip.png)

## Production — Exporter (déclencheur) — `.production-mix-toolbar-actions [data-capture-export-trigger]`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #10111f, contraste anneau/fond **13.58:1**.

### Captures

- [`production-exporter-primary-normal-clip.png`](captures-react/production-exporter-primary-normal-clip.png)
- [`production-exporter-primary-hover-clip.png`](captures-react/production-exporter-primary-hover-clip.png)
- [`production-exporter-primary-focus-clip.png`](captures-react/production-exporter-primary-focus-clip.png)
- [`production-exporter-primary-disabled-clip.png`](captures-react/production-exporter-primary-disabled-clip.png)
- [`production-exporter-bar-focus-i3-clip.png`](captures-react/production-exporter-bar-focus-i3-clip.png)

## Production — Exporter (popin) — `.export-dialog-actions-end .btn.primary`

Mesure script — ΔE00 face primaire / secondaire actif : **7.66** ; ΔE00 bordure : **21.68** ; bordure tirets / fond page : **4.12:1** ; bordure / fond popin : **3.27:1**.

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #20243a, contraste anneau/fond **10.79:1**.

### Captures

- [`production-export-popin-primary-normal-1280x720.png`](captures-react/production-export-popin-primary-normal-1280x720.png)
- [`production-export-popin-primary-hover-1280x720.png`](captures-react/production-export-popin-primary-hover-1280x720.png)
- [`production-export-popin-primary-focus-1280x720.png`](captures-react/production-export-popin-primary-focus-1280x720.png)
- [`production-export-popin-primary-disabled-1280x720.png`](captures-react/production-export-popin-primary-disabled-1280x720.png)

## Production — Exporter (popin, 0 piste) — `.export-dialog-actions-end .btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #20243a, contraste anneau/fond **10.79:1**.

### Captures

- [`production-export-popin-aria-primary-normal-clip.png`](captures-react/production-export-popin-aria-primary-normal-clip.png)
- [`production-export-popin-aria-primary-hover-clip.png`](captures-react/production-export-popin-aria-primary-hover-clip.png)
- [`production-export-popin-aria-primary-focus-clip.png`](captures-react/production-export-popin-aria-primary-focus-clip.png)
- [`production-export-popin-aria-primary-disabled-clip.png`](captures-react/production-export-popin-aria-primary-disabled-clip.png)

## Production — Mesurer le mix rendu — `.phase3-actions button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #1c1934, contraste anneau/fond min–max **10.05–13.58:1**.

### Captures

- [`production-mesurer-primary-normal-1280x720.png`](captures-react/production-mesurer-primary-normal-1280x720.png)
- [`production-mesurer-primary-hover-1280x720.png`](captures-react/production-mesurer-primary-hover-1280x720.png)
- [`production-mesurer-primary-focus-1280x720.png`](captures-react/production-mesurer-primary-focus-1280x720.png)
- [`production-mesurer-primary-disabled-1280x720.png`](captures-react/production-mesurer-primary-disabled-1280x720.png)

## Production — Créer l'archive ZIP — `.export-wizard button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #1c1934, contraste anneau/fond min–max **10.05–13.58:1**.

### Captures

- [`production-zip-primary-normal-1280x720.png`](captures-react/production-zip-primary-normal-1280x720.png)
- [`production-zip-primary-hover-1280x720.png`](captures-react/production-zip-primary-hover-1280x720.png)
- [`production-zip-primary-focus-1280x720.png`](captures-react/production-zip-primary-focus-1280x720.png)
- [`production-zip-primary-disabled-1280x720.png`](captures-react/production-zip-primary-disabled-1280x720.png)

## Réglages — LoRA — `.phase3-lora-list button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #1c1934, contraste anneau/fond min–max **10.05–13.58:1**.

### Captures

- [`reglages-lora-primary-normal-1280x720.png`](captures-react/reglages-lora-primary-normal-1280x720.png)
- [`reglages-lora-primary-hover-1280x720.png`](captures-react/reglages-lora-primary-hover-1280x720.png)
- [`reglages-lora-primary-focus-1280x720.png`](captures-react/reglages-lora-primary-focus-1280x720.png)
- [`reglages-lora-primary-disabled-1280x720.png`](captures-react/reglages-lora-primary-disabled-1280x720.png)

## Confirmation — RegenerationGate (actif) — `.regeneration-gate button.btn.primary, .modal.regeneration-gate .btn-row .btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #151827, contraste anneau/fond **12.44:1**.

### Captures

- [`confirmation-regeneration-gate-primary-normal-1280x720.png`](captures-react/confirmation-regeneration-gate-primary-normal-1280x720.png)
- [`confirmation-regeneration-gate-primary-hover-1280x720.png`](captures-react/confirmation-regeneration-gate-primary-hover-1280x720.png)
- [`confirmation-regeneration-gate-primary-focus-1280x720.png`](captures-react/confirmation-regeneration-gate-primary-focus-1280x720.png)
- [`confirmation-regeneration-gate-primary-disabled-1280x720.png`](captures-react/confirmation-regeneration-gate-primary-disabled-1280x720.png)

## RegenerationGate — primaire bloqué — `.modal.regeneration-gate .btn-row .btn.primary`

> État inatteignable dans l’app réelle : `SongScreen.tsx:339` ouvre le gate seulement si `scoreDocument && isRegen` ; ce harnais force `beforeDocument={null}`.

Mesure script — ΔE00 face primaire / secondaire actif : **7.66** ; ΔE00 bordure : **21.68** ; bordure tirets / fond page : **4.12:1** ; bordure / fond popin : **3.77:1**.

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #848ba0 | top | #12151f | 5.36:1 | OK |
| normal | #848ba0 | bottom | #12151f | 5.36:1 | OK |
| hover | #848ba0 | top | #12151f | 5.36:1 | OK |
| hover | #848ba0 | bottom | #12151f | 5.36:1 | OK |
| focus | #848ba0 | top | #12151f | 5.36:1 | OK |
| focus | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #151827, contraste anneau/fond **12.6:1**.

### Captures

- [`regeneration-gate-blocked-primary-normal-clip.png`](captures-react/regeneration-gate-blocked-primary-normal-clip.png)
- [`regeneration-gate-blocked-primary-hover-clip.png`](captures-react/regeneration-gate-blocked-primary-hover-clip.png)
- [`regeneration-gate-blocked-primary-focus-clip.png`](captures-react/regeneration-gate-blocked-primary-focus-clip.png)

## Confirmation — InvariantPanel — `.invariant-panel button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #1c1934, contraste anneau/fond min–max **10.05–13.58:1**.

### Captures

- [`confirmation-invariant-panel-primary-normal-1280x720.png`](captures-react/confirmation-invariant-panel-primary-normal-1280x720.png)
- [`confirmation-invariant-panel-primary-hover-1280x720.png`](captures-react/confirmation-invariant-panel-primary-hover-1280x720.png)
- [`confirmation-invariant-panel-primary-focus-1280x720.png`](captures-react/confirmation-invariant-panel-primary-focus-1280x720.png)
- [`confirmation-invariant-panel-primary-disabled-1280x720.png`](captures-react/confirmation-invariant-panel-primary-disabled-1280x720.png)

## Confirmation — RemoteGenerateConfirm — `.remote-generate-confirm button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #05060b, contraste anneau/fond **14.3:1**.

### Captures

- [`confirmation-remote-generate-primary-normal-1280x720.png`](captures-react/confirmation-remote-generate-primary-normal-1280x720.png)
- [`confirmation-remote-generate-primary-hover-1280x720.png`](captures-react/confirmation-remote-generate-primary-hover-1280x720.png)
- [`confirmation-remote-generate-primary-focus-1280x720.png`](captures-react/confirmation-remote-generate-primary-focus-1280x720.png)
- [`confirmation-remote-generate-primary-disabled-1280x720.png`](captures-react/confirmation-remote-generate-primary-disabled-1280x720.png)

## Confirmation — SeparationRecommendDialog — `.separation-recommend-popin button.btn.primary, button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #20243a, contraste anneau/fond **10.79:1**.

### Captures

- [`confirmation-separation-recommend-primary-normal-1280x720.png`](captures-react/confirmation-separation-recommend-primary-normal-1280x720.png)
- [`confirmation-separation-recommend-primary-hover-1280x720.png`](captures-react/confirmation-separation-recommend-primary-hover-1280x720.png)
- [`confirmation-separation-recommend-primary-focus-1280x720.png`](captures-react/confirmation-separation-recommend-primary-focus-1280x720.png)
- [`confirmation-separation-recommend-primary-disabled-1280x720.png`](captures-react/confirmation-separation-recommend-primary-disabled-1280x720.png)

## Confirmation — UpdateNotice — `.update-notice button.btn.primary`

| État | Texte | Arrêt | Fond | Ratio | OK |
|------|-------|-------|------|-------|----|
| normal | #151827 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | top | #12151f | 5.36:1 | OK |
| disabled | #848ba0 | bottom | #12151f | 5.36:1 | OK |

Mesure script (DOM) : `:focus-visible`=true, outline 2px solid rgb(94, 236, 248), fond anneau #18202f, contraste anneau/fond **11.53:1**.

### Captures

- [`confirmation-update-notice-primary-normal-1280x720.png`](captures-react/confirmation-update-notice-primary-normal-1280x720.png)
- [`confirmation-update-notice-primary-hover-1280x720.png`](captures-react/confirmation-update-notice-primary-hover-1280x720.png)
- [`confirmation-update-notice-primary-focus-1280x720.png`](captures-react/confirmation-update-notice-primary-focus-1280x720.png)
- [`confirmation-update-notice-primary-disabled-1280x720.png`](captures-react/confirmation-update-notice-primary-disabled-1280x720.png)

## Non vérifiés

Voir `inventaire.md` (**39** usages produit + **1** harnais) — seuls les scénarios capturés ci-dessus sont vérifiés écran par écran.

| Élément | Raison |
|---------|--------|
| `scoreTabBench` | Banc interne, hors parcours produit |
| WebKitGTK | Chromium / Playwright uniquement |
| Lecteur d’écran | Hors périmètre contraste |
| `forced-colors` | Non traité (#212) |
| Rognages anneau Créer / Mesurer | Préexistants (#212) |
| Garde cyan négative | Couvert par garde pixels + tests `primaryButtonContrast` |

