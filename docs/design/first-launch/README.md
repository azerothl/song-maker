# Maquette du premier lancement

Maquette de l'écran de premier lancement de Song Maker.

- Issue #116 : contrat de données Rust pour l'assistant
- Issue #117 : écran React d'après la maquette

## États

| État | Description | Aperçu |
|------|-------------|--------|
| **A** | GPU détecté (Metal sur macOS) | `etat-a-gpu-detecte.png` |
| **B** | Sans GPU (Linux / Windows uniquement) | `etat-b-sans-gpu.png` |
| **C** | Téléchargement interrompu, avec reprise | `etat-c-telechargement-interrompu.png` |
| **D** | Fiche de justification des choix de design | `fiche-d-rationale-design.png` |

## Contenu

- `index.html` : affiche tous les états empilés sur une seule page, avec les ancres `#a`, `#b`, `#c` et `#d`. À ouvrir directement dans un navigateur.
- `etat-a-gpu-detecte.png`, `etat-b-sans-gpu.png`, `etat-c-telechargement-interrompu.png` : captures de chaque état.
- `fiche-d-rationale-design.png` : fiche de justification du design.
- `contrastes.md` : rapport d'audit de contraste WCAG (mesures avant/après correction).
- `captures-react/` : captures React réelles + métriques pli / focus Demucs (#199).

## Notes importantes

- **Tous les chiffres sont des valeurs d'EXEMPLE** (VRAM, tailles de poids, débits, durées, etc.). Ils ne sont pas issus de mesures réelles.
- **Les ratios de contraste AA sont désormais MESURÉS** (voir `contrastes.md` : 0 échec après 2 changements de couleur : `--line2` #7A6EA1, `--purple-btn` #805CDF, survol `--purple-btn-h` #6A3FD9). Ce ne sont plus une intention de design.
- **Cibles tactiles** : 44 px minimum pour les boutons, la case de licence et « Détails techniques » (zone cliquable).
- **macOS avec Metal** utilise l'état A, avec le libellé « Apple Metal détecté ».
- L'état B (sans GPU) ne concerne que Linux et Windows.
