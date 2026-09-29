# Contrastes — boutons primaires (#186 / #193)

Généré le 2026-09-29T23:38:01.643Z.

Mesures DOM : `getComputedStyle` (couleur du texte, opacity, `background-image` / `background-color`) compositées sur `--bg0`.
- États actifs (normal / survol / focus) : seuil WCAG 2.2 AA texte **4.5:1**.
- État désactivé : seuil lisibilité **3:1** (cible ~4,7:1, texte `#848ba0`) — distinct du secondaire actif.
- Focus : Tab clavier + souris hors bouton ; preuve `:focus-visible` (anneau) dans `metrics.json`.

## Synthèse

| Écran | Bouton | Min (tous états) | OK |
|-------|--------|------------------|----|
| Bibliothèque | Nouveau morceau | 4.73:1 | OK |
| Créer | Générer | 4.73:1 | OK |
| Production — Armer | Armer | 4.73:1 | OK |
| Production — Exporter | Exporter | 4.73:1 | OK |
| Production — Mesurer le mix rendu | Mesurer le mix rendu | 4.73:1 | OK |
| Production — Créer l'archive ZIP | Créer l’archive ZIP | 4.73:1 | OK |
| Réglages — LoRA (primaire visible) | Télécharger vers le cache | 4.73:1 | OK |
| Confirmation — RegenerationGate | Capturer et générer | 4.73:1 | OK |
| Confirmation — InvariantPanel | Vérifier | 4.73:1 | OK |
| Confirmation — RemoteGenerateConfirm | Consentir et envoyer | 4.73:1 | OK |
| Confirmation — SeparationRecommendDialog | Lancer la séparation | 4.73:1 | OK |
| Confirmation — UpdateNotice | Mettre à jour | 4.73:1 | OK |

## Bibliothèque — `.panel.library .btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Créer — `.song-create-generate-btn`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Production — Armer — `.record-panel button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Production — Exporter — `.song-actions-export button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Production — Mesurer le mix rendu — `.phase3-actions button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Production — Créer l'archive ZIP — `.export-wizard button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Réglages — LoRA (primaire visible) — `.phase3-lora-list button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Confirmation — RegenerationGate — `.regeneration-gate button.btn.primary, button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Confirmation — InvariantPanel — `.invariant-panel button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Confirmation — RemoteGenerateConfirm — `.remote-generate-confirm button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Confirmation — SeparationRecommendDialog — `.separation-recommend-popin button.btn.primary, button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Confirmation — UpdateNotice — `.update-notice button.btn.primary`

| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |
|------|-------|---------|-------|------|-------|----|
| normal | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| normal | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| hover | #151827 | 1 | top | #d2bdff | 10.46:1 | OK |
| hover | #151827 | 1 | bottom | #b094fc | 7.12:1 | OK |
| focus | #151827 | 1 | top | #c4a8ff | 8.72:1 | OK |
| focus | #151827 | 1 | bottom | #a78bfa | 6.47:1 | OK |
| disabled | #848ba0 | 1 | top | #1c2034 | 4.73:1 | OK |
| disabled | #848ba0 | 1 | bottom | #1c2034 | 4.73:1 | OK |

Preuve focus clavier : `:focus-visible`=true, outline `2px solid`, offset `2px`, souris hors bouton.

## Captures

- [`bibliotheque-primary-1280x720.png`](captures-react/bibliotheque-primary-1280x720.png)
- [`bibliotheque-primary-focus-1280x720.png`](captures-react/bibliotheque-primary-focus-1280x720.png) (focus-visible)
- [`creer-primary-1280x720.png`](captures-react/creer-primary-1280x720.png)
- [`creer-primary-focus-1280x720.png`](captures-react/creer-primary-focus-1280x720.png) (focus-visible)
- [`production-armer-primary-1280x720.png`](captures-react/production-armer-primary-1280x720.png)
- [`production-armer-primary-focus-1280x720.png`](captures-react/production-armer-primary-focus-1280x720.png) (focus-visible)
- [`production-exporter-primary-1280x720.png`](captures-react/production-exporter-primary-1280x720.png)
- [`production-exporter-primary-focus-1280x720.png`](captures-react/production-exporter-primary-focus-1280x720.png) (focus-visible)
- [`production-mesurer-primary-1280x720.png`](captures-react/production-mesurer-primary-1280x720.png)
- [`production-mesurer-primary-focus-1280x720.png`](captures-react/production-mesurer-primary-focus-1280x720.png) (focus-visible)
- [`production-zip-primary-1280x720.png`](captures-react/production-zip-primary-1280x720.png)
- [`production-zip-primary-focus-1280x720.png`](captures-react/production-zip-primary-focus-1280x720.png) (focus-visible)
- [`reglages-lora-primary-1280x720.png`](captures-react/reglages-lora-primary-1280x720.png)
- [`reglages-lora-primary-focus-1280x720.png`](captures-react/reglages-lora-primary-focus-1280x720.png) (focus-visible)
- [`confirmation-regeneration-gate-primary-1280x720.png`](captures-react/confirmation-regeneration-gate-primary-1280x720.png)
- [`confirmation-regeneration-gate-primary-focus-1280x720.png`](captures-react/confirmation-regeneration-gate-primary-focus-1280x720.png) (focus-visible)
- [`confirmation-invariant-panel-primary-1280x720.png`](captures-react/confirmation-invariant-panel-primary-1280x720.png)
- [`confirmation-invariant-panel-primary-focus-1280x720.png`](captures-react/confirmation-invariant-panel-primary-focus-1280x720.png) (focus-visible)
- [`confirmation-remote-generate-primary-1280x720.png`](captures-react/confirmation-remote-generate-primary-1280x720.png)
- [`confirmation-remote-generate-primary-focus-1280x720.png`](captures-react/confirmation-remote-generate-primary-focus-1280x720.png) (focus-visible)
- [`confirmation-separation-recommend-primary-1280x720.png`](captures-react/confirmation-separation-recommend-primary-1280x720.png)
- [`confirmation-separation-recommend-primary-focus-1280x720.png`](captures-react/confirmation-separation-recommend-primary-focus-1280x720.png) (focus-visible)
- [`confirmation-update-notice-primary-1280x720.png`](captures-react/confirmation-update-notice-primary-1280x720.png)
- [`confirmation-update-notice-primary-focus-1280x720.png`](captures-react/confirmation-update-notice-primary-focus-1280x720.png) (focus-visible)

## Non vérifiés

| Élément | Raison |
|---------|--------|
| Inventaire complet des 35 usages | Voir commentaire #186 — seuls les scénarios listés sont capturés. |
| `scoreTabBench` / `scoreTabBenchApp` | Banc interne de perf, hors parcours produit. |
| WebKitGTK | Mesures Chromium (Playwright), pas le runtime Tauri natif. |
| Lecteur d’écran | Hors périmètre contraste (pas de parcours NVDA/Orca). |
| `forced-colors` | Non traité (#193). |

Cette livraison **ne couvre pas toute l’application** : uniquement les scénarios listés ci-dessus.

