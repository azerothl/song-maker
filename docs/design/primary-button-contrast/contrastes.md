# Contraste — états interactifs `.btn.primary` (#186)

Ref **#189** : texte `#151827` sur dégradé actif (déjà sur `main`).

Cette PR ajoute :

- **Survol** : dégradé légèrement plus lumineux (pas seulement la bordure `.btn:hover`).
- **Focus-visible** : anneau cyan explicite sur `.btn.primary`.
- **Désactivé** : fond éteint (`--bg2` / `--line`), texte atténué, `cursor: not-allowed`, `opacity: 1`.

## Mesure

`captures-react/metrics.json` — pour chaque scénario et état : `getComputedStyle().color`, stops ou `background-color`, ratio retenu (`effectiveContrast`).

Seuil visé : **4,5:1**. Si un état est légèrement en dessous, la valeur exacte et la raison sont notées dans `metrics.json` (commentaire commit / PR).

## Limites

Voir `captures-react/README.md` (non vérifiés).
