# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issues #186 / #193).

## Problème

1. Texte blanc sur le dégradé `--accent` → `--accent-2` (~2,0–2,7:1) — corrigé dans #189 (`#151827`).
2. État **désactivé trop clair** et **pas de survol net** — #192.
3. Suite Alphonse (#193) : désactivé confondu avec le secondaire actif (ΔE ~1,5) ; preuves focus sans vrai `:focus-visible`.

## Correction (#193)

- Texte sombre `#151827` sur le dégradé actif (inchangé).
- **Survol** : dégradé légèrement plus lumineux.
- **Focus** : anneau cyan via la règle globale `button:focus-visible` (pas de doublon `.btn.primary:focus-visible`).
- **Désactivé** : texte `#848ba0` (~4,7:1), fond éteint, **bordure en tirets** (signe non chromatique) — distinct du `.btn` secondaire.
- Transitions courtes sous `prefers-reduced-motion: reduce`.
- `forced-colors` : **non traité**.

Aucun changement de mise en page.

## Contenu

- `contrastes.md` : mesures DOM (normal / survol / focus / désactivé) + preuves focus clavier.
- `captures-react/` : PNG 1280×720 React réels (état courant + `*-focus-*` avec anneau) + script de régénération + liste des **non vérifiés**.
