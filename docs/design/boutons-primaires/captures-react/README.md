# Captures React — boutons primaires

Application React réelle (Vite + mock Tauri). Inventaire : [`../inventaire.md`](../inventaire.md) (**13** vérifiés / **1** partiel / **21** non vérifiés).

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

## Méthode

- Focus : Tab + souris hors cible ; pixels **cyan** requis dans le **clip bouton** (±**14** px ; ±**22** px en focus pour l’anneau).
- Distinction normal / survol / focus : hash sur le clip bouton (y compris scénarios viewport).
- Anneau bibliothèque : **10,0–11,7:1** (712 px, fond `#0c0e18`). Gate bloqué : anneau **3,51:1** sur `#151827` (742 px).
- Créer : clip bouton ; capture volontaire anneau rogné `creer-primary-focus-ring-clipped-column-*`.
- Exporter I3 : `production-exporter-bar-focus-i3-1280x720.png` — `.production-mix-toolbar-actions [data-capture-export-trigger]`, focus Tab, cyan obligatoire.

## Désactivé dans les captures

| Type | Scénarios |
|------|-----------|
| **réel** | Créer (`busy`), Exporter déclencheur + popin (`busy`) |
| **forcé** | `btn.disabled = true` (9 scénarios) |
| **n/a** | Bibliothèque (pas de `disabled` au source) |
| **harnais** | `regeneration-gate-blocked` — inatteignable (`SongScreen.tsx:339`) |

## Non testé

WebKitGTK, lecteur d’écran, `forced-colors`, `aria-disabled` popin Exporter (0 piste).
