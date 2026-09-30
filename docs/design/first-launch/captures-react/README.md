# Captures React — premier lancement (#199, #202)

Application React réelle (Vite, `<App/>` + `FirstLaunchScreen`), viewports **1280×640**, **1280×720** et **1280×768**.

## Régénérer

```bash
pnpm exec tsx docs/design/first-launch/captures-react/capture.mts
pnpm exec tsx docs/design/first-launch/captures-react/capture-queue-label.mts
```

## Preuves

| Fichier | Contrôle |
|---------|----------|
| `first-launch-gpu-fold-1280x720.png` | Case HTDemucs + bouton Télécharger dans le viewport (sans scroll) |
| `first-launch-gpu-fold-1280x640.png` | Bouton Télécharger (et case HTDemucs) dans le viewport |
| `first-launch-demucs-link-focus-1280x720.png` | Lien `Demucs #327` : anneau **2 px cyan** (`--accent-cyan`) |
| `first-launch-queue-label-1280x720.png` | (#202) YuE2 en cours + suivants « En file d’attente — Démarre après … » ; pas de « En attente » nu |
| `first-launch-grid-focus-1280x{640,720,768}.png` | Région récap (premier arrêt Tab) : anneau **2 px cyan** |
| `first-launch-interrupted-1280x{640,720,768}.png` | Téléchargement interrompu (`#c`) : texte d’erreur non masqué par la pastille |

`metrics.json` : pli / focus Demucs. `queue-label-metrics.json` : libellés file (#202).

## Non testé

WebKitGTK, lecteur d’écran, runtime Tauri natif.
