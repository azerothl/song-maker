# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issue #186).

## Problème

Texte blanc sur le dégradé `--accent` (`#c4a8ff`) → `--accent-2` (`#a78bfa`) : ~2,0–2,7:1 (exigence WCAG 2.2 AA : 4,5:1).

## Correction

Texte sombre `#151827` sur le dégradé inchangé (identité visuelle claire). État désactivé : même teinte, dégradé légèrement lavé (`color-mix` vers blanc) et `opacity: 1` pour que le contraste reste ≥ 4,5:1 après peinture (l’`opacity: 0,45` générique de `.btn:disabled` tombait sous le seuil).

## Contenu

- `contrastes.md` : mesures DOM (normal / survol / focus / désactivé).
- `captures-react/` : captures 1280×720 de l’app React réelle + script de régénération.
