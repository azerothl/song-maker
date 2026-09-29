# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issue #186).

## Problème

Texte blanc sur le dégradé `--accent` (`#c4a8ff`) → `--accent-2` (`#a78bfa`) : ~2,0–2,7:1 (exigence WCAG 2.2 AA : 4,5:1).

## Correction

Texte sombre `#151827` sur le dégradé inchangé (identité visuelle claire). État désactivé (#193) : dégradé lavé inchangé, libellé `#4d5468` (~4,7:1 sur le fond lavé), bordure `var(--line)` en **tirets** (signe non chromatique vs secondaire actif), `opacity: 1` et `cursor: not-allowed`.

## Contenu

- `contrastes.md` : mesures DOM (normal / survol / focus / désactivé).
- `captures-react/` : captures 1280×720 de l’app React réelle + script de régénération.
