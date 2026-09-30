# Contraste des boutons primaires

Correctif d’accessibilité pour `.btn.primary` (issues #186 / #193).

## Inventaire

[`inventaire.md`](inventaire.md) — **34 usages** produit + **1 harnais** = **35 lignes** : **13 vérifiés**, **1 partiel**, **21 non vérifiés**.  
Désactivé **réel** : 3 (Créer, Exporter déclencheur, Exporter popin). Vérifiés = **9** forcés + **1** n/a + **3** réels. **31** usages sans preuve de désactivé réel (**34** − **3**).

## Preuves

- [`captures-react/`](captures-react/) — PNG + `metrics.json` + `capture.mts`
- [`contrastes.md`](contrastes.md) — synthèse régénérée

Texte désactivé mesuré : **`#848ba0`** sur **`#1c2034`** → **4,73:1**.

## Non testé

WebKitGTK, lecteur d’écran, `forced-colors`, `aria-disabled` popin Exporter (0 piste cochée).

## Signalé (I2 / I3)

Voir `inventaire.md` — bordure popin 1,60:1 (page) / 1,27:1 (fond popin) ; anneau Exporter parfois coupé.
