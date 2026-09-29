# Captures React — états bouton primaire (#186)

Complète **#189** (texte sombre sur dégradé) : survol, focus-visible, désactivé lisible mais éteint.

**Ne couvre pas toute l’application.** Trois scénarios × quatre états (normal, survol, focus, désactivé), PNG **1280×720** + `metrics.json` (contraste DOM par état).

## Génération

```bash
pnpm exec tsx docs/design/primary-button-contrast/captures-react/capture.mts
```

| Scénario | Harness | Bouton mesuré |
|----------|---------|---------------|
| `creer` | `create-capture.html` | `.song-create-generate-btn` |
| `production-exporter` | `production-capture.html` | Exporter (popin) |
| `confirmation-regeneration-gate` | `confirm-dialogs-capture.html` | `RegenerationGate` (baseline mockée) |

Fichiers : `primary-btn-<scénario>-<état>-1280x720.png`.

## Non vérifiés

| Élément | Raison |
|---------|--------|
| « Armer » | Pas de scénario harness dédié dans cette PR |
| « Mesurer le mix rendu » | Idem |
| « Créer l'archive ZIP » | Idem |
| `scoreTabBenchApp` | Banc interne |
| WebKitGTK | Mesures Chromium (Playwright) |
| Lecteur d’écran | Contraste uniquement |

Dialogues / bandeaux liés à **#191** (raison d’action désactivée) : hors périmètre.

Rapport : [`../contrastes.md`](../contrastes.md).
