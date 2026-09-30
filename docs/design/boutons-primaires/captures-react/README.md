# Captures React — boutons primaires

Application React réelle (Vite + mock Tauri). Inventaire : [`../inventaire.md`](../inventaire.md) (**13** vérifiés / **1** partiel / **21** non vérifiés).

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

## Méthode

- Focus : Tab + souris hors cible ; pixels **cyan** requis dans la zone bouton (clip ±14 px).
- Distinction normal / survol / focus : hash sur la **zone bouton**, pas la page entière.
- Anneau : contraste min–max contre le fond **derrière** l’outline (`elementFromPoint`).
- Créer : clip colonne `.song-create-generate` (largeur réelle).
- Exporter I3 : `production-exporter-bar-focus-i3-1280x720.png` (viewport, barre actions).

## Désactivé dans les captures

| Type | Scénarios |
|------|-----------|
| **réel** | Créer (`busy`), Exporter déclencheur + popin (`busy`) |
| **forcé** | `btn.disabled = true` (10 scénarios) |
| **n/a** | Bibliothèque (pas de `disabled` au source) |
| **harnais** | `regeneration-gate-blocked` — inatteignable (`SongScreen.tsx:339`) |

## Non testé

WebKitGTK, lecteur d’écran, `forced-colors`, `aria-disabled` popin Exporter (0 piste).
