# Maquette — onglet « Versions » (issue #133)

Maquette statique, **rien n’est commité ni poussé**, aucune écriture GitHub.

## Fichiers
- `index.html` : maquette autonome (HTML + CSS + JS léger : « Revenir à cette version » avec annulation, Détails, renommage en ligne, lien « à partir de la prise N » qui fait défiler jusqu’à la prise).
- `render.py` : rendu Playwright/Chromium (même approche que `../songmaker-mockup-creer/render.py`) ; contrôle le nombre de prises, le défilement et la hauteur des cibles.
- `versions-1280x720.png` : vue par défaut (13 prises, la liste défile, 1280×720).
- `versions-defilement-hier.png` : liste défilée sur la section « Hier », avec l’événement « Pistes séparées » et une génération interrompue.
- `versions-details-ouvert.png` : une ligne avec « Détails » ouvert (gen-011, graine, score-v3, mix-v2).
- `versions-renommer.png` : une ligne avec le champ de renommage actif.

## Valeurs d’exemple
Les 13 prises, dates/heures, styles, graines, identifiants : **exemples** (pastille jaune « exemple » dans le titre de liste + badge « Maquette · valeurs d’exemple » en en-tête).

## Problème de départ (13 prises, capture réelle)
Identifiants bruts `gen-001…gen-013`, graines, libellés techniques « full » / « melody · interrupted », « parent » / « racine », arbre à deux branches depuis gen-011, texte d’aide sur les dossiers immuables : rien de cela ne répond à « quelle version veux-je réécouter ? ».

## Décisions de design
- **Une « prise »** regroupe génération + partition + mix. Trois pastilles « ✓ Musique / ✓ Partition / ✓ Mix » (ou « – » si absent) disent ce qu’elle contient.
- **Nom par défaut « Prise N »**, avec date en clair (« aujourd’hui 14:22 », « hier 15:10 ») et **résumé de style court** (genre · BPM · détail). **Renommable** : crayon (44 px) → champ en ligne + Enregistrer / Annuler ; Entrée valide, Échap annule, le focus revient au crayon.
- **Chronologie, plus récent en haut**, titres de jour collants (Aujourd’hui / Hier, puis date complète au-delà). Remplace l’arbre : plus de branches à lire.
- **Filiation en mots** : « à partir de la prise 2 » est un **lien** souligné qui mène à la prise d’origine (remplace « parent » / « racine »).
- **Événements** : dans la prise (liste sous les pastilles : « Mix modifié », « Partition mise à jour ») ou **entre deux prises** (ligne en pointillé : « Pistes séparées », « Pistes séparées à nouveau »). La position d’une ligne d’événement dans la chronologie est celle de son heure.
- **Génération interrompue** en mots : « Génération interrompue, non utilisable » + icône « ! » + bordure pointillée, bouton **Relancer** à la place d’Écouter / Revenir. Plus de « melody · interrupted » visible.
- **Actions par ligne** : « Écouter » (secondaire) et « Revenir à cette version » (primaire). La version active porte « **✓ Version active** » (icône + texte + bordure épaisse + pastille pleine dans la ligne de temps) au lieu du bouton. « Revenir » est réversible : message « Rien n’a été supprimé » + bouton **Annuler**.
- **« Détails » replié** sur chaque ligne : identifiants techniques (gen-011, graine, score-v3, mix-v2, état interne) + « Copier » pour le support. Invisible par défaut.
- **Après une re-séparation** : l’événement « Pistes séparées à nouveau » propose **« Revenir à la séparation précédente »**.
- **Texte d’aide** unique et court en tête (« Revenir à une version ne supprime rien ») ; le discours sur les dossiers immuables disparaît.
- 1280×720 : 2 prises visibles sans défiler, en-tête de liste + titre de jour collants ; la liste (≈ 2470 px) défile.

## Accessibilité
- **Contrastes AA (calculés)** : texte `#F3F0FA` sur carte ≥ 13:1 ; secondaire `#BDB6CF` sur `#221E2C` 8,3:1 ; lien `#C9B6FF` 9,0:1 ; blanc sur `#805CDF` 4,65:1 ; titre de jour `#5ED8C9` sur `#141218` 10,7:1 ; avertissement `#FFE2B8` sur carte 13:1 ; bordure des boutons secondaires `#7A6EA1` sur `#141218` 4,05:1.
- **Pas de couleur seule** : active = icône ✓ + texte + bordure épaisse ; interrompue = « ! » + texte + pointillé ; pastilles de contenu = ✓ / – + texte (et « présent/absent » pour lecteur d’écran).
- **Cibles 44 px** : tous les boutons (Écouter, Revenir, Relancer, Détails, crayon, Enregistrer) mesurés ≥ 44 px par `render.py`.
- **Focus visible** : anneau jaune 3 px partout (le bouton « Détails » et le champ de renommage sont montrés en focus).
- **Sémantique** : liste ordonnée `ol` par jour sous un `h2`, chaque prise = `article` nommé par son titre ; `aria-expanded`/`aria-controls` sur Détails ; boutons avec libellé complet (« Renommer Prise 12 », « Revenir à cette version : Prise 11 ») ; confirmations en `role="status"`. Ordre de tabulation = ordre visuel, aucun `tabindex` positif.
- `prefers-reduced-motion` respecté.

## Test d’acceptation
> Une personne qui n’a jamais vu l’application trouve, **sans aide et en moins d’une minute**, « la version d’hier avant la séparation ».

- **Consigne donnée** : « Retrouvez la version d’hier, celle d’avant que les pistes soient séparées, et réécoutez-la. » Aucun autre indice, pas de démo.
- **Réponse attendue** : sous le titre « Hier », la ligne de séparation « Pistes séparées · hier 16:20 » (dans les données d’exemple) ; la prise **juste en dessous** = **Prise 8 (hier 15:10)**. Le participant clique « Écouter » (réussite de lecture) puis éventuellement « Revenir à cette version ».
- **Critères** : (1) trouvé en < 60 s ; (2) sans poser de question ni ouvrir « Détails » ; (3) sans confondre avec la Prise 9 (au-dessus de l’événement) ; (4) n’utilise jamais un identifiant « gen-… ».
- **Protocole** : 5 personnes, chronométrage, note des hésitations (où clique-t-on d’abord ? lit-on les titres de jour ?). Échec si ≥ 2 personnes sur 5 dépassent 60 s ou ouvrent « Détails » : revoir la place/libellé de l’événement de séparation.

## Points ouverts / inventés
- Contenu de chaque prise, noms d’événements sur la ligne de temps (position par heure) : inventés d’après le brief.
- « Essai plus lumineux » et « Version démo » = exemples de prises déjà renommées.
- L’événement « Pistes séparées » est global (pas rattaché à une prise) : à valider côté données.
- Sous 900 px de large : non maquetté (actions à passer sous le texte).
- Suppression / archivage d’une prise : hors périmètre.
