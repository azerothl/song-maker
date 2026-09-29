# Captures React — boutons primaires

Captures **application React réelle** (Vite + mock Tauri), pas de maquette HTML.  
**Ne couvre pas toute l’application** — voir [`../../primary-button-contrast/inventaire.md`](../../primary-button-contrast/inventaire.md).

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Écrit les PNG 1280×720, `metrics.json`, et met à jour `../contrastes.md`.

Chromium Playwright embarqué si présent, sinon repli sur le canal `chrome` du système.

## Focus clavier (#193)

État **focus** : souris hors cible → **Tab** jusqu’au bouton → `:focus-visible` réel (pas `page.focus()` seul).  
`metrics.json` : outline, offset, couleur, curseur.

État **désactivé** : état applicatif réel (`busy` capture, pistes export vides, harnais RegenerationGate) — pas de `btn.disabled = true` forcé dans `capture.mts`.

## Fichiers (extrait)

| Motif | Écran |
|-------|--------|
| `creer-primary-*` | Créer — Générer |
| `production-export-trigger-*` | Production — Exporter (déclencheur) |
| `production-export-popin-primary-disabled-*` | Popin export — primaire désactivé |
| `regeneration-gate-*` | RegenerationGate |

## Non vérifiés

WebKitGTK, lecteur d’écran, curseur OS réel, Armer / Mesurer le mix / ZIP (détail dans l’inventaire).

La classe `.btn.primary` est globale (`src/App.css`) : les ratios mesurés sur ces scénarios s’appliquent au token partagé, sans capture de chaque occurrence.
