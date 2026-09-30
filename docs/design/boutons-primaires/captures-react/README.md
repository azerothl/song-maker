# Captures React — boutons primaires

Application React réelle (Vite + mock Tauri). Inventaire : [`../inventaire.md`](../inventaire.md) (**13** vérifiés / **1** partiel / **21** non vérifiés).

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

## Méthode

- Focus : Tab + souris hors cible ; pixels **cyan** requis dans le **clip bouton** (±**14** px ; ±**22** px en focus pour l’anneau).
- Distinction normal / survol / focus : hash sur le clip bouton (y compris scénarios viewport).
- Publication manuelle (`manualReviewAlphonse`) : Bibliothèque **10,0–11,7:1**, dégradé `#131f31` → `#192c43`, **712 px** (cyan ≠ PNG normal, passe 2) et **730 px** (tous les cyan du clip bouton, passe 3) ; Créer **13,65:1** sur `#0c0d18` ; Armer/Exporter **12,68:1** ; Mesurer/ZIP/LoRA/Invariant **13,58:1** sur `#0c0e18` ; gate bloqué **3,51:1** (742 px) et ΔE00 **25,44 / 22,68** vs `#151827`.
- Créer : clip bouton ; anneau rogné visible sur `creer-primary-focus-*`.
- `metrics.json` : mesures DOM dans `screens` ; `manualReviewAlphonse` = publication revue Alphonse (`source` explicite).
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
