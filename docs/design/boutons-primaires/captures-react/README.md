# Captures React — boutons primaires

Captures **application React réelle** (Vite + mock Tauri), pas de maquette HTML.

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Écrit ici les PNG 1280×720, `metrics.json`, et met à jour `../contrastes.md`.

## Fichiers

| Fichier | Écran | Viewport |
|---------|-------|----------|
| `bibliotheque-primary-1280x720.png` | Bibliothèque (bouton Nouveau) | 1280×720 |
| `creer-primary-1280x720.png` | Créer (bouton Générer) | 1280×720 |
| `metrics.json` | Mesures DOM des 4 états | — |

La classe `.btn.primary` est globale (`src/App.css`) : les ratios mesurés s’appliquent aux autres écrans / dialogues qui réutilisent le même token.
