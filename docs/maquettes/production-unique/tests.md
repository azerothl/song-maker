# Tests — couverture des scénarios maquette par les tests produit

Ce document mappe les scènes PNG (hashes `index.html#…`) vers les tests comportementaux **existants** sur `origin/main`.  
Les **85 contrôles de comportement** de la maquette HTML (`tests.md` maquette) **ne sont pas rejouables** ici : HTML hors dépôt.

Légende : **[L]** fichier test sur main · **[M]** scène PNG · **[S]** couverture partielle.

| Scène / hash | Comportement maquette | Tests produit [L] | Couverture |
|--------------|----------------------|-------------------|------------|
| `#a` vue par défaut | Timeline + zones Tempo/Marqueurs + gain/pan | `productionSubtabScroll.behavior.test.ts`, `productionCaptureMetrics.test.ts`, `productionIssue230.test.ts` | Partielle [S] |
| `#b` / `#b-en` Découper / Split | Outil découpe + libellé EN Split | `arrangementInteractions.behavior.test.ts`, `productionIssue226.test.ts` (i18n Split) | Partielle [S] |
| `#c` popover piste | Réglages de la piste | `productionIssue226.test.ts`, captures tools-226 | Partielle [S] |
| `#e` automation dépliée | Courbe sous piste | `productionTrackAutomation.behavior.test.ts` | Oui (FR/EN) |
| `#f` Réglages du mix | Popover mix | `productionMixSettings.behavior.test.ts`, `productionMixSettings*.test.ts` | Oui |
| `#g2`–`#g10` 640 px | Repli, popovers, EQ, séparation | tests ci-dessus en viewport 640 (automation EN 640) | Partielle [S] |
| `#h`–`#j` focus / saisie | Focus cyan, gain/pan clavier | `productionMixA11y.test.ts`, `arrangementInteractions.behavior.test.ts` | Partielle [S] |
| `#k` / `#g6` menu Ajouter | Menu ouvert | `productionIssue226.test.ts` (piste vide / menu) | Partielle [S] |
| `#m` / `#g8` égaliseur | Popover EQ | `productionIssue226.test.ts` | Partielle [S] |
| `#n` / `#g9` automation popover | Onglet Automation → courbe | `productionTrackAutomation.behavior.test.ts` (onglet ouvre courbe) | Oui |
| `#o` / `#g10` avis séparation | Licence / lancer | `sepExportA11yCaptureMetrics.test.ts`, `anchoredPopinFooter.behavior.test.ts` | Connexe #196 [S] |

## Suites `src/dev/*production*.test.ts` (inventaire)

| Fichier | Rôle |
|---------|------|
| `productionTrackAutomation.behavior.test.ts` | #229 courbe, clavier, bornes, restore |
| `productionMixSettings.behavior.test.ts` | #225 réglages mix |
| `productionSubtabScroll.behavior.test.ts` | sticky règle/tempo/marqueurs, popins |
| `productionCaptureMetrics.test.ts` | métriques captures React |
| `productionCaptureHash.test.ts` | empreintes captures |
| `arrangementInteractions.behavior.test.ts` | tempo/marqueurs clavier & flags |

## Non testé (déclaré)

- Pack HTML maquette : 0 exécution des 85 contrôles [M]
- Lecteurs d’écran, tactile réel, WebView2/WebKitGTK, thème clair, zoom 200 %
- Écoute audio native Tauri pour automation / tempo

## Verdict critère A « tests.md : 0 échec »

**Non acquis** pour la maquette HTML. Côté produit, les suites listées passent sur CI App (réf. livraisons #259/#263/#292/#294) — distinct du critère A maquette.
