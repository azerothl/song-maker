# Captures — application React (onglet Créer)

Ces images sont des **captures de l’interface réelle** (composants React, `App.css`, coquille sidebar + onglets), pas de la maquette statique `../index.html`.

## Comment les régénérer

1. Depuis la racine du dépôt : `pnpm exec tsx scripts/capture-create-react.mts`
2. Le script démarre Vite en mode capture (`VITE_CAPTURE=1`, page `create-capture.html`) avec un **mock Tauri** minimal (`src/dev/tauriInvokeMock.ts`) pour afficher `SongScreen` / `CreateWorkspace` sans backend Rust.
3. Les PNG et le rapport de visibilité sont écrits ici.

## Fichiers

| Fichier | Viewport |
|---------|----------|
| `creer-react-1280x720.png` | 1280×720 |
| `creer-react-1600x900.png` | 1600×900 |
| `creer-react-800x700-une-colonne.png` | 800×700 (grille une colonne) |
| `REPORT.md` | Mesures Style / Paroles / Générer à 1280×720 (généré par le script) |

## Données affichées

Formulaire vide (titre « Projet capture », champs style et paroles vides) — **pas** les valeurs d’exemple de la maquette Alphonse.

Réf. issue : #131.
