# Maquette — barre latérale repliable (Song Maker)

Maquette statique **non publiée** : rien n’est commité ni poussé sur GitHub. Application cible : Song Maker (Tauri + React, interface en français, thème violet sombre).

## Fichiers
- `index.html` : maquette autonome (HTML + CSS, un peu de JS). **Le repli fonctionne** : bouton en haut de la barre, raccourci `Ctrl+B` (`⌘+B` sur macOS), et repli automatique en redimensionnant la fenêtre sous 1100 px.
- `render.py` : rendus Playwright/Chromium (même approche que `../songmaker-mockup-creer/render.py`, repli sur `/usr/bin/google-chrome` si Chromium Playwright est absent). Affiche aussi des contrôles : largeur de la barre, `aria-expanded`, nom accessible, cibles ≥ 44 px, mémorisation après rechargement. Lancer : `python3 render.py` (Playwright + Pillow requis).
- PNG :
  - `sidebar-deplie-1280x720.png` : barre dépliée (220 px), bouton « Réduire le menu » + `Ctrl+B`.
  - `sidebar-replie-1280x720.png` : barre repliée (56 px), icônes seules.
  - `sidebar-replie-tooltip-1280x720.png` : repliée, info-bulle sur « Bibliothèque ».
  - `sidebar-auto-1024x700.png` : repli automatique à 1024 px avec l’annotation « Replié automatiquement : fenêtre étroite ».
  - `sidebar-focus-toggle.png` : `:focus-visible` sur le bouton de bascule (déplié à gauche, replié avec info-bulle « Développer le menu » à droite).

## Valeurs d’exemple
Le GPU (« NVIDIA RTX 4070 ») et le nom de projet (« test 3 ») sont des **exemples** : pastille jaune « exemple » dans la barre dépliée, mention « (exemple) » dans les info-bulles et les noms accessibles, badge « Maquette · valeurs d’exemple » en en-tête. Le panneau « Notes de conception » et l’encart « Replié automatiquement : fenêtre étroite » sont des **annotations de design**, pas de l’UI de l’app.

## Décisions de design
- **Tokens repris** de `songmaker-mockup-creer` : `--line2 #7A6EA1` (bordure du bouton de bascule, de l’item actif, séparateurs de contrôles), `--purple-btn #805CDF` (logo, liseré de l’item actif), `--purple-btn-h #6A3FD9` (état appuyé du bouton de bascule), Fraunces (marque) et Inter (interface), fond sombre à halos violets, anneau de focus `--focus #FFD76A`.
- **Largeurs** : déplié `220px` (`--sb-open`), replié `56px` (`--sb-closed` = 44 px de cible + 2 × ~5 px de marge). Le contenu principal récupère toute la largeur libérée (flex).
- **Bouton de bascule en haut** de la barre (juste sous la marque) : emplacement stable dans les deux états, donc pas de « saut » de la cible. Icône double chevron (« ‹‹ » déplié, « ›› » replié) ; le libellé et l’indication `Ctrl+B` sont affichés en texte quand la barre est dépliée.
- **Libellés** : dépliée « Réduire le menu », repliée « Développer le menu » (le nom accessible change avec l’état).
- **Repliée** : icônes seules (SVG en trait, 20 px, `currentColor`), item actif (« Nouveau ») gardant fond + bordure `--line2` + liseré `--purple-btn` pour ne pas dépendre de la seule couleur du texte. Infos du bas (GPU, projet) réduites à une icône avec info-bulle.
- **Transition** : `--sb-dur: 180ms` (plage demandée 150–200 ms), courbe `cubic-bezier(.2,0,0,1)`, sur `width` et `padding` ; les libellés s’estompent en 120 ms. Pas de transition au premier affichage (classe `no-anim` retirée après deux frames). Les info-bulles sont masquées pendant l’animation.
- **`prefers-reduced-motion: reduce`** : `transition: none !important; animation: none !important` sur tous les éléments (bloc CSS en fin de feuille). Le repli est alors instantané (vérifié : 56 px après 50 ms, `transition-duration: 0s`).
- **Info-bulles** : uniquement quand la barre est repliée ; affichées au survol **et** au focus clavier (`:has(:focus-visible)`), fermables avec `Échap`, et le pointeur peut passer de l’élément à l’info-bulle sans qu’elle disparaisse (pont invisible) — critères WCAG 1.4.13. Contenu : nom de l’item ; « Développer le menu Ctrl+B » pour la bascule ; « GPU : … (exemple) » et « Projet : … (exemple) ».

## Comportement (à implémenter dans l’app)
- **État mémorisé entre les lancements** : clé `songmaker.sidebar.collapsed` (`localStorage` dans la maquette ; dans Tauri, préférer le store applicatif / fichier de config, pour survivre à un changement de profil WebView). Seul le choix fait **fenêtre large** est mémorisé.
- **Repli automatique sous ~1100 px** de largeur de fenêtre (`matchMedia('(max-width:1099px)')`) : la barre passe en 56 px, sans écraser la préférence mémorisée. Si l’utilisateur **la déplie à la main** en fenêtre étroite, elle reste dépliée tant que la fenêtre reste étroite (`narrowOverride`) ; en repassant ≥ 1100 px, on revient à la préférence mémorisée.
- Une annonce `role="status"` (`aria-live="polite"`) énonce « Menu replié » / « Menu développé » après une action de l’utilisateur (pas lors du repli automatique).

## Accessibilité
- **Bouton de bascule** : `<button>` natif, `aria-expanded` (`true` déplié / `false` replié), `aria-controls="sidebar"`, `aria-keyshortcuts="Control+B"`, `aria-label` mis à jour (« Réduire le menu » / « Développer le menu »).
- **Noms accessibles** : les liens de navigation gardent leur libellé texte dans le DOM, seulement masqué visuellement quand la barre est repliée (opacité 0, largeur 0, sans `display:none`), donc nom accessible = « Bibliothèque », « Nouveau », « Paramètres » dans les deux états. Icônes `aria-hidden`. `aria-current="page"` sur l’item actif. Navigation dans `<nav aria-label="Navigation principale">`.
- **Infos GPU / projet** : `role="group"` avec `aria-label` complet (« GPU : … (exemple) »). Repliées, elles reçoivent `tabindex="0"` pour que l’info-bulle soit atteignable au clavier ; dépliées, elles ne sont pas focalisables.
- **Info-bulles** `aria-hidden` (redondantes avec les noms accessibles, évite le double énoncé) ; visibles au survol **et** au focus clavier.
- **Cibles ≥ 44 px** : bouton de bascule et items 44 px de haut ; 199 × 44 déplié, 45 × 44 replié (mesuré par `render.py`).
- **Focus visible** : anneau `--focus #FFD76A` de 3 px (`:focus-visible`) sur bouton, liens et infos ; ordre de tabulation = ordre visuel (bascule → Bibliothèque → Nouveau → Paramètres → GPU → Projet ; les deux derniers seulement repliée), aucun `tabindex` positif.
- **Raccourci** : `Ctrl+B` (et `⌘+B`) ; indiqué en texte dans le bouton déplié et dans l’info-bulle repliée, pas uniquement au survol. Il est intercepté globalement (`preventDefault`).
- **Contrastes** (rappel des tokens mesurés AA, hérités de la maquette « Créer ») : `--line2 #7A6EA1` ≥ 3:1 sur les fonds sombres pour les bordures de composants ; blanc sur `--purple-btn #805CDF` = 4,65:1 ; sur `--purple-btn-h #6A3FD9` = 6,3:1 ; texte `#F3F0FA` / `#BDB6CF` sur les fonds de barre ≥ 8:1. Non recalculés pour cette maquette : `#BDB6CF` sur `#2F2A3D` (survol) et texte jaune-sur-fond des pastilles « exemple » (`#1A1424` sur `#E9C46A`, fort contraste attendu).
- Mouvement réduit respecté (voir plus haut).

## Limites connues / points ouverts
- **Rendus** : les PNG ont été relus visuellement (recadrages agrandis compris) ; pas de recouvrement ni de texte tronqué constaté. Les polices Inter/Fraunces dépendent de leur présence sur la machine de rendu ; à défaut, repli sur Noto Sans / Georgia (les largeurs de texte peuvent varier légèrement).
- **Non testé avec un lecteur d’écran** (NVDA, VoiceOver, Orca) ; les attributs ARIA sont conformes aux usages courants mais à valider dans la WebView réelle de Tauri (WebView2 / WKWebView / WebKitGTK), dont le rendu de `:has()` peut varier sur d’anciennes versions (WebKitGTK < 2.40 : info-bulle au focus clavier à vérifier ; alternative : gestion par JS).
- `aria-controls="sidebar"` désigne la barre entière, qui contient le bouton lui-même ; acceptable, mais on peut cibler un conteneur interne (`#sidebar-content`) si l’on veut un contrôle plus strict.
- Le seuil de 1100 px est **approximatif** (« ~1100 ») et basé sur la largeur de fenêtre, pas sur le zoom ni le DPI ; à confirmer (avec la largeur minimale de fenêtre Tauri).
- Le contenu principal est un **espace réservé** : l’interaction avec l’onglet « Créer » (deux colonnes) n’est pas maquettée ; à 1024 px, sa mise en page reste à valider avec une barre dépliée à la main (220 px).
- Le nom du GPU peut être long dans la vraie app : ici tronqué avec ellipse (`text-overflow`) en mode déplié, complet dans l’info-bulle repliée ; pas de retour à la ligne prévu.
- Le choix « ⌘+B » sur macOS et le conflit possible avec d’autres raccourcis de champs de texte (ex. gras dans un éditeur de paroles) ne sont pas traités.
- Icônes dessinées pour la maquette (SVG simples) : à remplacer par la bibliothèque d’icônes de l’app.
