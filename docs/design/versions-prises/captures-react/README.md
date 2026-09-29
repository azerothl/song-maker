# Captures React — onglet Versions (app réelle)

Captures **1280×720** de l’interface React (Vite + composants `src/`), avec **mock Tauri** (`tauri-mock.ts`) et fixtures ~13 prises (issue #133).

## Lancer les captures

```bash
# depuis la racine du dépôt
node docs/design/versions-prises/captures-react/capture-screenshots.mjs
```

Le script démarre Vite sur le harness (`main.tsx` → `App` + `SongScreen`, onglet Versions), puis Playwright enregistre :

| Fichier | Contenu |
|---------|---------|
| `versions-react-default-1280x720.png` | Vue par défaut |
| `versions-react-defilement-hier-1280x720.png` | Liste défilée sur « Hier » + séparation |
| `versions-react-details-ouvert-1280x720.png` | Détails ouverts (Prise 11) |
| `versions-react-details-renomme-1280x720.png` | Détails ouverts (Essai plus lumineux / Prise 10, nom par défaut) |
| `versions-react-renommer-1280x720.png` | Renommage actif (Essai plus lumineux) |

## Fixtures

- 13 générations dont **gen-013** et **gen-007** interrompues
- **gen-004** / **gen-010** renommées
- **sep-001** (hier) et **sep-002** (re-séparation aujourd’hui)
