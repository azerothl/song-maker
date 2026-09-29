# Captures React — boutons primaires

Captures **application React réelle** (Vite + mock Tauri), pas de maquette HTML.  
**Ne couvre pas toute l’application** — uniquement les scénarios listés.

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Écrit ici les PNG 1280×720 (état courant + `*-focus-*`), `metrics.json`, et met à jour `../contrastes.md`.

## Focus clavier (#193)

Pour chaque scénario, l’état **focus** est obtenu par :

1. souris hors du bouton ;
2. piège focusable + **Tab** (pas `page.focus()` seul) ;
3. vérification `element.matches(":focus-visible")` + outline non nul ;
4. capture `*-focus-1280x720.png` avec l’anneau visible.

`metrics.json` enregistre `focusProof` (anneau, offset, curseur) et `focusMethod: keyboard-tab-mouse-away-focus-visible`.

La mesure **désactivé** force `disabled` uniquement pour lire les styles calculés — ce n’est pas une preuve d’interaction.

## Fichiers

| Fichier | Écran | Bouton |
|---------|-------|--------|
| `bibliotheque-primary-1280x720.png` (+ focus) | Bibliothèque | Nouveau morceau |
| `creer-primary-1280x720.png` (+ focus) | Créer | Générer |
| `production-armer-primary-1280x720.png` (+ focus) | Production — enregistrement | Armer |
| `production-exporter-primary-1280x720.png` (+ focus) | Production — actions | Exporter |
| `production-mesurer-primary-1280x720.png` (+ focus) | Production — outils | Mesurer le mix rendu |
| `production-zip-primary-1280x720.png` (+ focus) | Production — outils | Créer l’archive ZIP |
| `reglages-lora-primary-1280x720.png` (+ focus) | Réglages — LoRA | Télécharger vers le cache |
| `confirmation-*-primary-1280x720.png` (+ focus) | Dialogues de confirmation | RegenerationGate, InvariantPanel, RemoteGenerateConfirm, SeparationRecommendDialog, UpdateNotice |
| `metrics.json` | Mesures DOM des 4 états + preuves focus | — |

## Non vérifiés

| Élément | Raison |
|---------|--------|
| Autres usages `btn primary` (voir inventaire #186) | Pas capturés un par un dans cette livraison |
| `scoreTabBench` / `scoreTabBenchApp` | Banc interne de perf, hors parcours produit |
| WebKitGTK | Mesures Chromium (Playwright / Chrome canal), pas le runtime Tauri natif |
| Lecteur d’écran | Hors périmètre contraste (pas de parcours NVDA/Orca) |
| `forced-colors` | Non traité (#193) |

La classe `.btn.primary` est globale (`src/App.css`) : les ratios mesurés s’appliquent aux autres écrans qui réutilisent le même token, **sans** prétendre avoir capturé toute l’app.
