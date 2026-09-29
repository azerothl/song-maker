# Captures React — contraste boutons primaires (#186)

Captures **1280×720** de composants React réels (`App.css`, harness Vite + mock Tauri).  
**Ce dossier ne couvre pas l’application entière** : seulement les scénarios listés ci‑dessous + mesures DOM associées.

## Génération

```bash
pnpm exec tsx docs/design/primary-button-contrast/captures-react/capture.mts
```

Produit les PNG `primary-btn-*-1280x720.png` et `metrics.json` (contraste via `getComputedStyle` : couleur du texte + stops `rgb()` du dégradé ou `background-color`).

## Scénarios capturés

| ID | Écran / composant | Harness |
|----|-------------------|---------|
| `bibliotheque` | Bibliothèque | `sidebar-capture.html` |
| `creer` | Onglet Créer | `create-capture.html` |
| `score` | Onglet Score | `create-capture.html` + onglet Score |
| `production-*` | Production (mix, clips, outils, enregistrement) | `production-capture.html` + hash |
| `reglages-*` | Réglages (séparation, distant, hôte) | `settings-capture.html` |
| `confirmation-regeneration-gate` | `RegenerationGate` (phase choix niveau) | `confirm-dialogs-capture.html` — baseline score **mockée** |
| `confirmation-invariant-panel` | `InvariantPanel` | idem — baseline **pré-capturée** en mémoire |
| `confirmation-remote-generate` | `RemoteGenerateConfirm` | idem — prefs + payload **mockés** |
| `confirmation-separation-recommend` | `SeparationRecommendDialog` | idem — `get_phase3_status` **mocké** |
| `confirmation-update-notice` | `UpdateNotice` | idem — type `Update` **mocké** (sans updater Tauri) |

Dialogues de confirmation : `src/dev/confirmDialogsCaptureMain.tsx` (composants `src/`, pas de maquette HTML statique).

## Non vérifié (captures / contraste DOM)

| Élément | Raison |
|---------|--------|
| `src/bench/scoreTabBenchApp.tsx` | Banc de perf interne, hors parcours produit (reporté à plus tard). |
| Modales non montées sans harness dédié | Ex. `RegenerationGate` phases « conserver » / violations seules — autres états couverts indirectement par le même composant en capture « pick level » ; pas de parcours backend complet pour rouvrir chaque modale dans l’app entière. |
| Runtime Tauri natif | Mesures Chromium (Playwright), pas WebKitGTK. |
| Lecteur d’écran | Non testé (contraste uniquement). |

## Usages `btn primary` dans `src/` (36)

Voir tableau dans les commits / issue #186 — tous les composants ne possèdent pas un scénario de capture dédié ; les écrans principaux et les **cinq** dialogues de confirmation ci‑dessus sont prioritaires pour cette PR.

Rapport contraste : [`../contrastes.md`](../contrastes.md).
