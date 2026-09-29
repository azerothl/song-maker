# Captures React — boutons primaires

Captures **application React réelle** (Vite + mock Tauri), pas de maquette HTML.  
**Ne couvre pas toute l’application** — uniquement les scénarios listés.

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Écrit ici les PNG 1280×720, `metrics.json`, et met à jour `../contrastes.md`.

## Fichiers

| Fichier | Écran | Bouton |
|---------|-------|--------|
| `bibliotheque-primary-1280x720.png` | Bibliothèque | Nouveau morceau |
| `creer-primary-1280x720.png` | Créer | Générer |
| `production-armer-primary-1280x720.png` | Production — enregistrement | Armer |
| `production-mesurer-primary-1280x720.png` | Production — outils | Mesurer le mix rendu |
| `production-zip-primary-1280x720.png` | Production — outils | Créer l’archive ZIP |
| `reglages-lora-primary-1280x720.png` | Réglages — LoRA | Télécharger vers le cache |
| `confirmation-*-primary-1280x720.png` | Dialogues de confirmation | RegenerationGate, InvariantPanel, RemoteGenerateConfirm, SeparationRecommendDialog, UpdateNotice |
| `metrics.json` | Mesures DOM des 4 états | — |

Chaque scénario mesure **normal / survol / focus / désactivé** via `getComputedStyle`.

## Non vérifiés

| Élément | Raison |
|---------|--------|
| `scoreTabBench` / `scoreTabBenchApp` | Banc interne de perf, hors parcours produit |
| WebKitGTK | Mesures Chromium (Playwright / Chrome canal), pas le runtime Tauri natif |
| Lecteur d’écran | Hors périmètre contraste (pas de parcours NVDA/Orca) |

La classe `.btn.primary` est globale (`src/App.css`) : les ratios mesurés s’appliquent aux autres écrans qui réutilisent le même token, **sans** prétendre avoir capturé toute l’app.
