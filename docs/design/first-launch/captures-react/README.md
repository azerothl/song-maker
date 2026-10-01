# Captures React — premier lancement (#199, #202)

Application React réelle (Vite `VITE_CAPTURE=1`, `<App/>` + `FirstLaunchScreen`), viewports **1280×640**, **1280×720** et **1280×768**.

## SHA git (méthode anti-circulaire)

- **`CAPTURES_BASE.txt`** : SHA enregistré au **lancement** des scripts de capture (`git rev-parse HEAD` à ce moment-là). C’est le **commit parent** des PNG si les captures sont commitées juste après l’exécution (même principe que #218).
- **`download-states-metrics.json` → `captureBaseSha`** : même valeur pour `#202`.
- **`metricsSha256`** : empreinte du JSON **sans** ce champ (recalculable localement).
- **Tête de branche PR** : SHA complet annoncé dans la description de la PR (pas dans les JSON commités, pour éviter une boucle SHA ↔ métriques).

## Régénérer

```bash
pnpm exec tsx docs/design/first-launch/captures-react/capture.mts
pnpm exec tsx docs/design/first-launch/captures-react/capture-queue-label.mts
pnpm exec tsx docs/design/first-launch/captures-react/capture-download-states.mts
```

Tous les scripts lancent Vite avec **`VITE_CAPTURE=1`** (mock Tauri, pas de bannière `TypeError … invoke`).

## Preuves (#202 — téléchargement)

| Fichier | Contrôle |
|---------|----------|
| `first-launch-download-active-{fr,en}-1280x720.png` | Compteur « · N sur M » / « · N of M » |
| `first-launch-download-queue-{fr,en}-1280x720.png` | File (bordure pointillée) |
| `first-launch-download-failure-{fr,en}-1280x720.png` | **Échec** / **Failed** + icône + **Réessayer** (≥ 36 px) |
| `first-launch-download-resume-{fr,en}-1280x720.png` | **À reprendre** / **To resume** + estimation i18n |
| `first-launch-download-license-blocked-fr-1280x720.png` | **Licence requise** (bordure double ≠ file) |
| `first-launch-queue-label-1280x720.png` | Vue complète file + compteur (FR) |

| Métriques | SHA-256 du JSON (hors champ `metricsSha256`) |
|-----------|-----------------------------------------------|
| `download-states-metrics.json` | `01f54a3475595de19e2aa9fd96b06aea11aa81a9bd9476f02e92d8988faae3d6` (recalculable, voir `captureBaseSha`) |

Fixtures : `#download`, `#c`, `#reprise`, `#blocked-license`.

## Autres preuves (#199)

| Fichier | Contrôle |
|---------|----------|
| `first-launch-gpu-fold-1280x720.png` | HTDemucs + Télécharger au-dessus du pli |
| `first-launch-interrupted-1280x720.png` | Interrompu — errbox non masquée |
| `metrics.json` | pli / focus Demucs (`metricsSha256` interne) |

## Non testé

WebKitGTK, lecteur d’écran matériel, runtime Tauri natif.
