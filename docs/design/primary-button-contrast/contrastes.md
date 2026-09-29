# Contraste WCAG — boutons `.btn.primary` (#186)

## Correction

Texte `#151827` sur le dégradé `--accent` → `--accent-2` (recommandation Alphonse). État désactivé : fond plein `--accent-2`, `opacity: 1` (évite `.btn:disabled { opacity: 0.45 }`).

## Périmètre

Les captures listées dans `captures-react/README.md` ne couvrent **pas** toute l’app (voir section « Non vérifié »).

## Mesure

| Source | Contenu |
|--------|---------|
| **Calculé (hex tokens)** | Pire cas texte `#151827` / `#c4a8ff` ≈ **8,72:1** ; `#a78bfa` ≈ **6,47:1** |
| **DOM (Chromium)** | `getComputedStyle(button).color` → `rgb(21, 24, 39)` ; stops extraits de `background-image` résolu → ratios identiques (voir `metrics.json`) |

Le script `capture.mts` mesure **normal, survol, focus, désactivé** sur le premier bouton primaire visible de chaque scénario (survol = `:hover` réel Playwright).

Exemple (Bibliothèque, Chromium) :

| État | `color` (DOM) | Fond (DOM) | Ratio retenu |
|------|---------------|------------|--------------|
| normal / survol / focus | `rgb(21, 24, 39)` | stops `rgb(196, 168, 255)` → `rgb(167, 139, 250)` | **6,47:1** (pire stop) |
| disabled | `rgb(21, 24, 39)` | `background-color` `rgb(167, 139, 250)` | **6,47:1** |

Détails complets : `captures-react/metrics.json`.

## Tests automatisés

`src/lib/primaryButtonContrast.test.ts` — tokens + parse d’un `background-image` calculé typique.

## Limites de test

- **WebKitGTK** (runtime Tauri Linux) : mesures Chromium (Playwright), pas WebKitGTK.
- **Lecteur d’écran** : non vérifié (contraste uniquement).
- **`scoreTabBenchApp`** : banc interne, non capturé.
