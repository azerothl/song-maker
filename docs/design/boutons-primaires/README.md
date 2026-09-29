# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issue #186).

## Problème

1. Texte blanc sur le dégradé `--accent` → `--accent-2` (~2,0–2,7:1) — corrigé dans #189 (`#151827`).
2. État **désactivé trop clair** (dégradé lavé encore « primaire ») et **pas de survol net** — cette livraison.

## Correction

- Texte sombre `#151827` sur le dégradé actif (inchangé).
- **Survol** : dégradé légèrement plus lumineux (`.btn.primary:hover:not(:disabled)`).
- **Focus-visible** : anneau cyan explicite.
- **Désactivé** : fond éteint (`--bg2` / `--bg0`), texte `--muted`, bordure `--line`, `opacity: 1` — lisiblement inactif, contraste ≥ 4,5:1.

Aucun changement de mise en page.

## Contenu

- `contrastes.md` : mesures DOM (normal / survol / focus / désactivé) par écran capturé.
- `captures-react/` : PNG 1280×720 React réels + script de régénération + liste des **non vérifiés**.
