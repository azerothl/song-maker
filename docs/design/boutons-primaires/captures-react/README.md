# Captures React — boutons primaires

Captures **application React réelle** (Vite + mock Tauri), pas de maquette HTML.  
**Ne couvre pas toute l’application** — voir [`inventaire.md`](../inventaire.md).

## Régénérer

```bash
pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
```

Écrit les PNG 1280×720 (`*-primary-{normal|hover|focus|disabled}-*`), `metrics.json`, et met à jour `../contrastes.md`.

## Focus clavier

Pour chaque scénario :

1. souris hors du bouton ;
2. piège focusable + **Tab** (pas `page.focus()` seul) ;
3. `element.matches(":focus-visible")` + outline non nul ;
4. contraste de l’anneau mesuré contre le **fond** derrière l’outline (pas la face du bouton).

Vérification : les PNG `normal`, `hover` et `focus` ont des empreintes distinctes (échec du script si identiques).

## Désactivé

| Scénario | Preuve désactivé |
|----------|------------------|
| Créer — Générer | `busy` harnais (`__captureSetGenerateBusy`) |
| Exporter déclencheur / popin | `busy` harnais (`__productionCaptureSetBusy`) |
| Autres captures listées | `disabled` injecté pour lecture de styles (pas interaction réelle) |

Texte désactivé mesuré : **`#848ba0`** (~**4,73:1** sur face **`#1c2034`**).

## Fichiers par scénario

| Préfixe | Écran |
|---------|-------|
| `bibliotheque-primary-*` | Bibliothèque — Nouveau |
| `creer-primary-*` | Créer — Générer |
| `production-armer-primary-*` | Production — Armer |
| `production-exporter-primary-*` | Production — Exporter (déclencheur) |
| `production-export-popin-primary-*` | Production — Exporter (popin) |
| `production-mesurer-primary-*` | Mesurer le mix rendu |
| `production-zip-primary-*` | Créer l’archive ZIP |
| `reglages-lora-primary-*` | Réglages LoRA |
| `confirmation-*-primary-*` | Dialogues de confirmation |
| `regeneration-gate-blocked-primary-*` | RegenerationGate bloqué (`aria-disabled`) |

## Non vérifiés

Voir [`inventaire.md`](../inventaire.md) (18 usages non couverts, désactivés réels en majorité non prouvés).

| Élément | Raison |
|---------|--------|
| `scoreTabBench` | Banc interne |
| WebKitGTK | Chromium / Playwright uniquement |
| Lecteur d’écran | Hors périmètre contraste |
| `forced-colors` | Non traité (décision produit) |
