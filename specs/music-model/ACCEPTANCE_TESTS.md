# Critères d'acceptation et validation

**Version :** 0.1 — protocole proposé, 1er octobre 2026.<br>
**Statut :** aucun résultat du nouveau modèle n'a encore été mesuré.

Les invariants techniques ci-dessous sont des exigences. Les seuils de qualité musicale sont des **cibles initiales à calibrer sur validation**, puis à figer avant le test final. Ils ne sont pas des performances annoncées.

## 1. Preuves attendues

Chaque campagne conserve requête, sources, modèle/runtime, seeds, artefacts, mesures et jugement d'écoute. Les conclusions distinguent :

- Vérification de fichiers : formats lisibles, durées, pistes, exports et empreintes.
- Vérification musicale/audio : notes, paroles, tempo, isolation, raccords et invariants.
- Écoute humaine : qualité, fidélité et utilité du changement demandé.
- Validation applicative : import, manipulation, comparaison et export dans Song Maker installé.

La réussite d'une compilation, d'un validateur JSON ou d'un test d'export ne prouve pas la qualité du chant ni le comportement du modèle.

## 2. Invariants techniques bloquants

| ID | Exigence | Méthode et seuil |
|---|---|---|
| T01 | Toutes les sorties demandées existent et sont lisibles | Décodage audio, lecture MIDI, parsing MusicXML et ouverture PDF ; 100 % des artefacts |
| T02 | Pistes synchronisées | Même fréquence, origine temporelle et nombre de samples ; délai de codec compensé et documenté |
| T03 | Durée stricte | Nombre d'échantillons exactement égal à la durée normalisée ; fin musicale également évaluée |
| T04 | Mix reproductible depuis les pistes | Refaire la recette float32 ; erreur absolue maximale ≤ 1e−6 sur référence normalisée, avec mêmes règles numériques |
| T05 | MIDI / MusicXML concordants | Mêmes identités de notes, pistes et hauteurs via la table d'export ; positions notées normalisées à ≤ 1 tick, écarts de performance reproduits et pertes documentées |
| T06 | Événements fournis et verrouillés conservés | Comparer la forme musicale canonique, identifiants et contrôleurs supportés ; aucune modification |
| T07 | PCM protégé en inpainting conservé | Comparaison échantillon par échantillon avec le parent normalisé : erreur maximale = 0 hors masque |
| T08 | Filiation et provenance complètes | Révisions, sources, masques demandés/effectifs, seeds, transformations et hash de chaque artefact |
| T09 | Pas de changement implicite pour tenir en mémoire | Erreur explicite ou profil demandé par le client ; durée/pistes inchangées |
| T10 | Échec / annulation sans corruption | Source intacte, aucun remplacement de prise, aucun manifeste final annonçant des artefacts invalides |
| T11 | Sorties sélectionnées sans effet sur la composition | Même génération avec mix seul puis mix+stems+score+MIDI en environnement fixé ; composition et audio identiques |
| T12 | Zéro ambiguïté sur les capacités | Mode/checkpoint/format incompatible refusé avant génération ; statut `unverified` ne valide pas une contrainte stricte |

T07 est mesuré **avant export avec perte de précision**. Pour WAV/FLAC 24 bits, comparer les échantillons protégés à une exportation de la source avec les mêmes règles de quantification. Aucun nouveau dither indépendant n'est appliqué aux zones protégées. La conservation exacte ne s'applique pas à un réencodage MP3.

T04 porte sur le mix de référence et sa recette. Un master non linéaire est testé par reproduction de ses effets ; la somme brute des stems n'est pas utilisée comme référence de ce master. Après quantification d'export, les tolérances tiennent compte de la profondeur de bits déclarée.

## 3. Mesures de qualité proposées

| Dimension | Cible initiale | Protocole |
|---|---|---|
| Notes instrumentales imposées | Note F1 ≥ 0,90 sur corpus propre et annoté | Hauteur exacte, début ±50 ms, fin ±100 ms ; par instrument puis moyenne macro, méthode indépendante |
| Tempo imposé | Écart relatif médian ≤ 1 % | Analyse du tempo et des attaques ; traiter explicitement les erreurs de facteur 2 et vérifier le rythme local |
| Notes vocales | ≥ 90 % des centres de notes à ±50 cents | F0 sur portions voisées stables ; vibrato, transitions et annotations incertaines traités séparément |
| Paroles FR/EN | WER ≤ 15 % par langue, comme cible de corpus annoté | Normalisation annoncée, alignement/ASR puis contrôle humain ; pas de substitution d'ASR à l'écoute |
| Instrument demandé | ≥ 95 % des cas reconnus comme la partie attendue | Écoute aveugle du stem seul ; auditeurs et analyse d'instrument séparés du générateur |
| Raccord d'inpainting | ≥ 90 % de cas sans clic/coupure jugée gênante | Écoute A/B aux deux frontières, analyse de discontinuités et d'énergie haute fréquence |
| Fidélité de cover | Notes/rythmes de la mélodie aux seuils ci-dessus et paroles conservées | Comparaison en coordonnées transposées/tempo transformé, contrôle des sections/accords verrouillés |
| Variante | Modification ciblée perceptible dans ≥ 80 % des cas | Même source, niveaux de force ordonnés ; invariants vérifiés séparément |
| Qualité générale | Moyenne ≥ 3,5/5 sur qualité et cohérence | Écoute aveugle, instrumental et chant, FR/EN séparés, résultats avec dispersion |
| Pistes exploitables | Aucun instrument essentiel seulement dans « autres » | Écoute de chaque stem et contrôle de la liste des parties ; niveau de fuite instrumentale consigné |
| Longue durée | Structure demandée présente et sans dérive invalidante | Écoute complète à 120/240 s : répétitions, paroles, tessiture, timbre, tonalité et tempo |

Les notes de batterie utilisent un protocole d'attaque/classe de percussion séparé. Pour le sustain de piano et les articulations, compléter les fins de notes par une mesure adaptée ; un offset n'a pas le même sens acoustique pour tous les instruments.

Une sortie peut conserver parfaitement les notes MIDI et les jouer mal dans l'audio : T06 et la fidélité instrumentale/vocale mesurent deux aspects différents. De même, un fichier de 240 s qui contient 60 s de silence final satisfait sa longueur mais échoue sur sa réalisation musicale.

Des métriques perceptuelles globales ou texte/audio peuvent compléter le rapport. Elles ne décident pas seules de la conformité aux paroles, aux notes ou à une retouche. L'isolation entre pistes doit être évaluée avec un jeu annoté et une écoute par instrument ; un score global de mix ne suffit pas.

## 4. Jeu d'évaluation

Prévoir au moins 24 scénarios équilibrés, dont les cas ci-dessous, avec trois seeds d'échantillonnage par scénario pour les comparaisons de recherche. Utiliser au moins dix auditeurs, dont des musiciens, dans une affectation équilibrée avec au moins cinq jugements par extrait ; ne pas imposer à tous l'écoute de tout le corpus.

L'écoute A/B randomise les noms et l'ordre, harmonise le niveau de présentation sans modifier les artefacts et utilise des consignes identiques. Réserver des séances pour stems isolés et chansons complètes. Les extraits de contrôle et la fatigue d'écoute sont documentés.

Le test final inclut compositions et voix absentes de l'entraînement, sources simples et complexes, passages disjoints, silences et difficultés de timing. Les cas hors capacités déclarées vérifient le refus, pas la qualité musicale.

## 5. Scénarios obligatoires

| ID | Scénario | Preuve spécifique |
|---|---|---|
| S01 | Texte seul → instrumental de 30 s | Pas de paroles hallucinées ; mix, instruments et événements cohérents |
| S02 | Texte + paroles françaises → chanson | Chaque phrase demandée, voix principale isolée, notes et syllabes alignées |
| S03 | Texte + paroles anglaises → chanson | Mesures séparées de S02 ; pas de moyenne cachant une langue faible |
| S04 | MIDI multipiste verrouillé → audio | Notes/tempo conservés, bonne instrumentation et respect des notes dans l'audio |
| S05 | MusicXML avec paroles, liaisons et anacrouse → chanson | Syllabes non décalées, notation et performance cohérentes |
| S06 | Voix audio isolée → accompagnement | Voix PCM identique, parties rythmiquement/harmoniquement adaptées |
| S07 | Mix audio → cover avec partition confirmée | Mélodie/paroles/sections inchangées, style/instruments modifiés |
| S08 | Cover transposée et tempo modifié | Transformations exactement annoncées, fidélité évaluée après transformation |
| S09 | Mix audio sans partition → cover estimée | Confiance/couverture visibles ; strict refuse si analyse insuffisante |
| S10 | Inpainting de deux mesures de piano | Batterie, basse, voix et PCM hors région identiques |
| S11 | Inpainting d'une phrase chantée | Nouvelles paroles seulement dans la région permise, raccord vocal cohérent |
| S12 | Remplacement d'une piste entière de guitare | Autres pistes intactes ; nouvelle guitare identifiable, score/MIDI actualisés |
| S13 | Régions disjointes sur deux pistes | Union de masques respectée, aucune régénération intermédiaire implicite |
| S14 | Note tenue / réverbération traversant la frontière | Respect des queues protégées ou erreur explicite de conflit |
| S15 | Plusieurs variantes d'une basse, mélodie protégée | Différences audibles de basse, invariants vérifiés, filiation stable |
| S16 | Variante de force 0 | Source normalisée renvoyée, pas de changement ni nouveau bruit |
| S17 | Continuation d'un refrain | Motif/timbre reconnus, source intacte, raccord dans région autorisée |
| S18 | MIDI et audio décalés ou contradictoires | Diagnostic `ambiguous_alignment` / `constraint_conflict` |
| S19 | Retouche d'un instrument depuis un mix, protection stricte des autres | Refus si les sources ne permettent pas la garantie d'isolation |
| S20 | Huit pistes, deux guitares distinctes, chœurs | Identifiants/parties indépendants, pas de fusion non annoncée |
| S21 | 240 s, 220 BPM, chant | Durée persistée et mesurée, tempo réalisé vérifié, structure et fin musicale complètes |
| S22 | Partition seule puis MIDI seul | Pas de synthèse audio inutile ; événements/export cohérents |
| S23 | Sorties toutes demandées, annulation puis relance | Source intacte, jobs distincts, publication atomique et idempotence vérifiée |
| S24 | Silence, début/fin et masque hors bornes | Silence contrôlé, frontières traitées, refus d'un masque invalide |

S20 utilise les huit pistes suivantes pour éviter une ambiguïté de comptage : batterie, basse, guitare A, guitare B, piano, pad, voix principale et chœurs.

## 6. Validation réelle dans Song Maker

Après validation du moteur, exécuter sur l'application desktop et le matériel déclarés :

1. Créer une chanson depuis texte/paroles et importer MIDI, MusicXML et audio dans des projets distincts.
2. Générer toutes les sorties, écouter le mix puis chaque instrument en solo ; comparer plusieurs prises.
3. Sélectionner une région de piano puis une phrase vocale, effectuer les retouches et vérifier la conservation des autres données.
4. Réaliser une cover et des variantes avec invariants visibles ; restaurer le parent et rouvrir le projet.
5. Exporter WAV/FLAC, stems, MIDI, MusicXML/PDF puis réimporter les formats éditables dans une autre session ou un logiciel compatible.
6. Vérifier la continuité de timing, les programmes/instruments, les paroles, les contrôleurs supportés et l'intégrité des prises.

Conserver capture d'écran ou vidéo du parcours, fichiers exportés, écoute accessible et rapport du matériel/runtime. Si seul le worker ou une interface de développement a été testé, le rapport le dit ; cela ne valide pas l'intégration desktop.

## 7. Décision de livraison

V1 livrable lorsque les invariants techniques passent, que les seuils musicaux figés sont atteints sur le jeu réservé et que le parcours Song Maker complet est vérifié. Les profils compacts et matériels supplémentaires ont leurs propres rapports.

Le rapport distingue `validé`, `échec`, `non vérifié` et `hors périmètre déclaré`. Un mode demandé dans la V1 ne peut pas être classé hors périmètre pour contourner un échec. Une capacité de recherche validée sur quelques extraits ne devient pas automatiquement une capacité de production.
