# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issues #186 / #193).

## Problème

1. Texte blanc sur le dégradé `--accent` → `--accent-2` (~2,0–2,7:1) — corrigé dans #189 (`#151827`).
2. État **désactivé trop clair** et **pas de survol net** — #192.
3. Suite Alphonse (#193) : désactivé confondu avec le secondaire actif (ΔE ~1,5) ; preuves focus sans vrai `:focus-visible`.

## Correction (#193)

- Texte sombre `#151827` sur le dégradé actif (inchangé).
- **Survol** : dégradé légèrement plus lumineux (`prefers-reduced-motion` respecté).
- **Focus** : anneau cyan via la règle globale `button:focus-visible` (pas de doublon `.btn.primary:focus-visible`).
- **Désactivé** : texte `#848ba0` (~4,7:1), fond `#1c2034`, **bordure en tirets** — distinct du `.btn` secondaire.
- **`forced-colors`** : `GrayText` sur primaire désactivé (`App.css`) ; pas de validation manuelle High Contrast.

## Contenu

- `contrastes.md` : mesures DOM + preuves focus clavier.
- `captures-react/` : PNG 1280×720 + `metrics.json` + script de régénération.
- [`../primary-button-contrast/inventaire.md`](../primary-button-contrast/inventaire.md) : 35 usages recensés.
