# Captures React — premier lancement (#199, #202)

Application React réelle (Vite, écran `FirstLaunchScreen`), viewport **1280×720** et **1280×640**.

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

`metrics.json` : pli / focus Demucs. `queue-label-metrics.json` : libellés file (#202).

## Non testé

WebKitGTK, lecteur d’écran, runtime Tauri natif.
