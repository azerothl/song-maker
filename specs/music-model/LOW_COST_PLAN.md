# Dataset et entraînement avec un budget inférieur à 500 €

**Date de vérification :** 1er octobre 2026.<br>
**Contraintes confirmées :** moins de 500 € pour la première campagne, hors développement ; conserver la possibilité d'un usage commercial ; instrumental et chant dans la cible V1.

**Décision du pilote :** diffusion partagée avec 2 à 4 petits adaptateurs spécialisés, routage explicite et stable par rôle ; MoE complet uniquement après gain mesuré à coût comparable.

## 1. Recommandation

Construire un **corpus instrumental original, aligné et régénérable**, réutiliser un modèle musical préentraîné pour le chant et la qualité acoustique, puis entraîner les adaptations nécessaires sur des extraits courts. Réserver le calcul loué aux expériences qui dépassent la mémoire locale.

**Enveloppe proposée : 470 € maximum pour une première campagne.** Elle finance la préparation d'un corpus conséquent et une preuve d'adaptation. Le succès du modèle complet décrit dans [MODEL_SPEC.md](MODEL_SPEC.md), avec huit pistes, chant, contrôle MIDI et édition locale sur quatre minutes, ne peut pas être garanti dans cette seule enveloppe.

Le premier entraînement porte sur des composants réutilisés, une base et un codec initialement gelés, **2 à 4 petits adaptateurs spécialisés** et les nouveaux conditionnements nécessaires. Il compare ces adaptateurs à un adaptateur unique sur la même base. Un entraînement complet de milliards de paramètres depuis zéro ne tient pas dans ce plan. Les étapes instrumentales et vocales sont menées dès le pilote ; la portée de la V1 reste celle du dossier existant.

## 2. Ressources locales vérifiées

- GPU détectée : **NVIDIA GeForce RTX 4080 SUPER, 16 376 MiB**, soit une carte de la classe 16 Go.
- Espace libre observé sur `E:` : **environ 22,1 Go décimaux**. Il ne permet pas de stocker le corpus audio complet.

Utiliser le poste pour le développement, la validation, l'annotation assistée, le prétraitement par petits lots et les essais d'adaptation compatibles. Le tutoriel LoRA officiel d'ACE-Step indique 16 Go comme minimum et recommande davantage pour les morceaux longs ; la compatibilité des nouveaux blocs multipistes reste à mesurer. [Tutoriel officiel](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/LoRA_Training_Tutorial.md).

## 3. Corpus instrumental : compositions originales → sorties alignées

### 3.1 Production proposée

Créer un générateur symbolique de compositions avec motifs, accords, sections, instrumentation et performance. Il peut combiner règles musicales, propositions d'un modèle de texte et corrections humaines ; les propositions doivent passer les validateurs avant rendu.

Produire MIDI, MusicXML et événements JSON depuis la même composition, puis rendre **chaque instrument séparément** et construire le mix à partir des pistes. Les notes, instruments, positions, changements de tempo et recettes d'effets sont ainsi connus à la source.

Technologies candidates : moteur symbolique Python, moteur de rendu SFZ `sfizz_render`, banques **VCSL** et **VSCO 2 Community Edition**. Les deux banques sont annoncées sous CC0 ; sfizz fournit un client de rendu MIDI hors ligne. Les mappings SFZ et la couverture exacte des instruments devront être inventoriés : tous les fichiers de samples ne sont pas des instruments prêts à rendre. [VCSL](https://github.com/sgossner/VCSL), [VSCO 2 CE](https://github.com/sgossner/VSCO-2-CE), [documentation sfizz](https://www.sfz.tools/sfizz/development/build/).

Utiliser des compositions et paroles originales. Le registre conserve les sources, licences, versions des banques, programmes, seeds et paramètres de rendu. Les éventuels synthétiseurs et banques supplémentaires sont admis après vérification de leurs conditions.

### 3.2 Taille visée

| Unité | Cible de montée en charge, après pilote |
|---|---:|
| Compositions indépendantes | 10 000 |
| Durée moyenne | 90 secondes |
| Musique avant variantes de rendu | 250 heures |
| Rendus/arrangements par composition | 4 |
| Total de chronologie audio rendue | 1 000 heures |
| Segments complets non recouvrants de 20 s | 160 000 avant filtrage et réservation des splits |

Les quatre versions peuvent changer instrumentation, performance ou rendu tout en conservant des invariants. **1 000 heures de rendus correspondent ici à 250 heures de compositions indépendantes.** Les heures de pistes ne sont pas additionnées aux heures de morceaux pour gonfler le volume. Chaque morceau de 90 s fournit quatre segments complets de 20 s et une chute de 10 s ; les segments ne traversent pas les frontières entre œuvres.

Le premier pilote ne produit que **500 compositions**, soit 12,5 h avant variantes et 50 h avec quatre rendus. Vérifier sa diversité, son utilité et sa qualité avant de passer à 10 000 compositions. Le volume final est une cible, pas un dataset déjà généré ni une estimation de temps garantie.

### 3.3 Ce qui rend le corpus robuste

- Plusieurs familles de styles, structures, densités, métriques, tempi et tonalités ; suivi des répartitions réelles.
- Motifs construits puis développés, harmonies cohérentes, phrases et fins musicales ; filtrage des mélodies absurdes et répétitions involontaires.
- Instrumentation variable, deux instances d'un même instrument, solos, silence, pédale, liaisons, anacrouses et notes tenues.
- Variations de vélocité, microtiming et articulations ; les rendus parfaitement quantifiés ne constituent pas tout le corpus.
- Au moins plusieurs banques ou moteurs réellement distincts par famille lorsqu'ils sont disponibles ; déplacer la hauteur d'un unique son n'offre pas une grande diversité de timbre.
- Captions françaises/anglaises générées depuis les propriétés connues, puis reformulées ; leurs assertions restent contrôlées par les métadonnées.
- Exemples de covers et variantes issus de **la même composition**, avec transformations tracées.
- Masques d'inpainting créés à l'entraînement : régions temporelles, pistes entières, zones disjointes et frontières difficiles.
- Validation et test fondés aussi sur des compositions humaines inédites et des timbres absents de l'entraînement.

Former les groupes de composition **avant** les splits, par exemple 90 % train / 5 % validation / 5 % test. Tous les rendus, arrangements apparentés, crops et augmentations restent dans le même groupe. Le découpage augmente le nombre de tâches, pas le nombre d'œuvres indépendantes.

## 4. Chant : trois sources complémentaires

### 4.1 Préentraînement et augmentation synthétique

Point de départ recommandé à évaluer : **ACE-Step 1.5, checkpoint base 2B**. Sa fiche annonce MIT et des sorties utilisables commercialement ; sa matrice inclut les tâches de génération, cover, repaint, extract et ajout de parties. Le choix du base est motivé par les tâches disponibles, sans affirmer qu'il réalise déjà les entrées MIDI et tous les exports des specs. [Fiche officielle des poids](https://huggingface.co/ACE-Step/acestep-v15-base).

Réutiliser ses capacités vocales et acoustiques plutôt que réapprendre le chant depuis rien. Pour les augmentations, commencer avec des paroles originales FR/EN et des passages de 20–30 s ; objectif initial **20–50 h de chant synthétique retenu après filtrage**, avec styles et descriptions de voix variés.

Les notes et phonèmes d'un chant généré ne sont pas connus exactement parce qu'on a donné une consigne. Les annoter avec des méthodes indépendantes, mesurer les erreurs et conserver `pseudo_label` et confiance. Une piste extraite d'un mix est `separated_estimate` ; elle n'est pas une piste native ni une vérité terrain isolée.

**Ne jamais associer comme vérité terrain le MIDI d'une composition à un chant généré qui ne l'a pas respecté.** Les exemples faiblement annotés activent seulement les objectifs correspondant à leurs annotations fiables. Les auto-captions du générateur ne suffisent pas à prouver tempo, tonalité ou paroles réalisées.

Cette augmentation apporte de la couverture mais reproduit aussi les limites du modèle source. Elle ne remplace pas un test réel ; sa proportion et son poids dans l'entraînement doivent être ablatés.

### 4.2 Petit corpus vocal réel disponible

**VocalSet** fournit 10,1 h de chant monophonique de vingt interprètes, principalement techniques et vocalises sur voyelles. Les métadonnées officielles Zenodo indiquent CC BY 4.0, qui permet des usages commerciaux sous ses conditions, dont l'attribution. Ce corpus aide sur timbre, F0 et techniques vocales ; il ne fournit pas un grand corpus de paroles françaises et anglaises. [VocalSet 1.2](https://zenodo.org/records/1442513), [métadonnées de licence](https://zenodo.org/api/records/1442513), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Les archives réorganisées par chanteur, technique et voyelle ne représentent pas trois fois plus d'enregistrements uniques. Les dédupliquer à l'ingestion.

### 4.3 Prises originales de la communauté

Objectif de collecte : **1–2 h de paroles réellement chantées**, FR/EN, sur les compositions originales, avec piste vocale isolée et accompagnement connu. Par exemple, douze volontaires apportant chacun dix minutes retenues donnent deux heures ; leur disponibilité et la qualité utilisable restent à confirmer.

Prévoir plusieurs tessitures et interprétations, notes/phrases annotées et autorisations explicites correspondant à l'entraînement, à la conservation des données et aux publications prévues. Réserver chanteurs et œuvres distincts pour validation/test. Une petite partie entièrement vérifiée est plus utile à la décision qu'un vaste test pseudo-annoté.

La réserve de 100 € du budget couvre de petits frais de collecte ou de matériel ; **elle n'est pas un devis pour des heures professionnelles de studio**. Avec aucun contributeur ni autre donnée réelle adéquate, la qualité de paroles chantées restera une limite du pilote.

### 4.4 Sources à écarter de cette campagne commerciale

**GTSinger** est sous CC BY-NC-SA 4.0 : ne pas l'inclure dans cette campagne destinée à conserver la possibilité commerciale sans accord distinct. Il reste une référence technique, comme dans la spec initiale. [Licence officielle](https://github.com/AaronZ345/GTSinger/blob/main/dataset_license.md).

YuE2 et SheetSage2 sont identifiés comme non commerciaux dans le dossier produit actuel ; ils ne constituent pas le point de départ recommandé ici. Les corpus, codecs ou poids supplémentaires sont évalués indépendamment du fait que leur code soit libre.

**NSynth**, option secondaire, propose 305 979 notes isolées sous CC BY 4.0 : utile à la reconnaissance de hauteur/timbre et à certains tests de codec. Il ne remplace pas des arrangements ni des chansons. Ne pas le télécharger en totalité avant d'avoir démontré son utilité. [Source officielle](https://magenta.tensorflow.org/datasets/nsynth).

## 5. Éviter le coût du stockage massif

Un corpus de 1 000 h, huit pistes stéréo et un mix, à 48 kHz PCM 24 bits, représente **9,33 To de données audio brutes**, hors métadonnées. Le float32 de travail consomme davantage. La compression effective dépend des sons.

Conserver de manière durable :

1. Compositions JSON/MIDI/MusicXML, textes, groupes de split et recettes de rendu.
2. Banques de sons et versions nécessaires à la reproduction.
3. Corpus humain, quelques rendus de référence et cas de validation.
4. Caches de latents/tokens utiles à la campagne, avec versions du codec et empreintes.

Rendre les autres pistes par petits lots reproductibles, encoder puis gérer le cache avec un plafond de volume. La taille des latents dépend du codec et se mesure sur le pilote : **500 Go est une enveloppe de cache proposée, pas une taille démontrée pour tout le dataset**. Si elle ne suffit pas, utiliser un cache tournant et inclure la recomputation dans le budget.

Comparer rendement CPU, délai d'encodage et attente GPU. Un worker GPU loué qui passe son temps à attendre le rendu n'est pas une solution économique. Les formats d'apprentissage et éventuelles conversions de fréquence sont documentés ; garder des originaux/rendus de référence à la qualité exigée pour les tests.

Le corpus peut être livré comme un catalogue de compositions et une recette de matérialisation à la demande. Annoncer séparément heures matérialisées, heures régénérables et heures effectivement parcourues pendant l'entraînement.

## 6. Calcul loué : comparaison vérifiée

Tarifs affichés par les fournisseurs le 1er octobre 2026, en dollars US ; disponibilité, taxes, stockage et transfert peuvent modifier la facture.

| Solution | Tarif affiché | Usage recommandé |
|---|---:|---|
| [Hugging Face Jobs CPU Upgrade](https://huggingface.co/docs/hub/jobs-pricing) | 8 vCPU, 32 Go RAM, 50 Go temporaires : 0,03 $/h | Rendu SFZ par petits lots et préparation des métadonnées |
| [Runpod A40](https://www.runpod.io/pricing) | 48 Go : 0,49 $/h | Essais d'adaptation avec besoin de mémoire modéré |
| [Runpod A100](https://www.runpod.io/pricing) | 80 Go : 1,59 $/h | Expériences plus lourdes et contrôle de la mémoire |
| [Hugging Face Jobs A100](https://huggingface.co/docs/hub/jobs-pricing) | 80 Go : 2,50 $/h | Alternative avec stockage temporaire inclus plus important |
| [Vast.ai](https://docs.vast.ai/guides/instances/pricing) | Place de marché, pas de tarif fixe | À retenir uniquement après comparaison réelle calcul + stockage + transfert |

La location est choisie d'après **coût par mise à jour utile**, pas seulement coût par heure. A40 peut être moins chère à l'heure et plus lente au total. Profiler 200 mises à jour après échauffement, même batch effectif et mêmes objectifs ; comparer temps, VRAM et coût.

Hugging Face Jobs est actuellement accessible avec un solde de crédits positif, sans abonnement PRO imposé par cette condition d'accès. Prévoir le rechargement dans le poste de calcul ; aucun abonnement supplémentaire n'est compté ici. [Conditions de facturation](https://huggingface.co/docs/hub/jobs-pricing).

Prévoir checkpoints et reprise, durée maximale par job, téléchargement des résultats et arrêt des instances entre campagnes. Les machines en arrêt peuvent conserver des frais de stockage ; vérifier les modalités du fournisseur choisi.

## 7. Budget plafonné proposé

| Poste | Plafond réservé |
|---|---:|
| Rendu CPU et préparation | 20 € |
| GPU loués | 220 € |
| Stockage temporaire / cache | 50 € |
| Collecte vocale, petits frais / matériel | 100 € |
| Électricité locale | 20 € |
| Transferts, change, relances et imprévus | 60 € |
| **Total réservé** | **470 €** |

Illustration de calcul, **pas une durée d'entraînement suffisante prouvée** : 100 h d'A40 + 80 h d'A100 coûtent 176,20 $ aux tarifs ci-dessus. Au taux de référence BCE du 1er octobre 2026, **1 € = 1,1298 $**, et avec une hypothèse de TVA de 20 % si applicable, cela représente environ **187,15 €**. Le plafond GPU de 220 € conserve une marge. [Taux BCE](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html), [flux officiel vérifié](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml).

À titre d'enveloppe de rendu, 500 h CPU à 0,03 $/h donnent 15 $ ; le débit réel devra établir combien d'heures musicales peuvent être produites. Un cache Runpod standard de 500 Go pendant un mois est affiché à 35 $, avant taxes. [Tarif CPU](https://huggingface.co/docs/hub/jobs-pricing), [stockage Runpod](https://www.runpod.io/pricing).

Ces plafonds ne sont pas des autorisations de dépense ni des réservations de machines. Ils excluent le temps de développement, d'annotation et de coordination des contributeurs. L'électricité dépend du tarif réel du poste ; le poste de 20 € est une provision, pas une consommation déjà mesurée.

Le rendu à grande échelle est débloqué après contrôle du débit et de la qualité du pilote. Le calcul GPU payant est engagé par petits lots et interrompu quand un jalon ne progresse pas. Le dataset entier n'a pas besoin d'être parcouru pour valider une première expérience ; le rapport indique la quantité réellement utilisée.

Les essais d'adaptateur unique, de deux puis de quatre adaptateurs partagent le plafond GPU de 220 € ; ce montant n'est pas attribué à chaque variante. Conserver une réserve d'évaluation, profiler d'abord, puis essayer quatre adaptateurs seulement si le solde et les données le permettent. La conception vise 2–4 ; le budget ne garantit pas que toutes les variantes seront entièrement entraînées.

## 8. Réductions possibles sans les compter d'avance

- **Modal Starter** annonce 30 $ de crédits de calcul par mois et jusqu'à 1 TiB inclus pour les volumes. Intéressant pour préparer des petits lots ou garder un cache ; vérifier les limites et les frais effectifs avant de dépasser les inclusions. Les crédits ne se déduisent pas d'une facture Runpod. [Tarification officielle](https://modal.com/pricing).
- **AMD Developer Cloud** peut accorder 25 h MI300X aux développeurs acceptés, avec expiration dix jours après attribution et frais distincts possibles. Il faut un workload compatible ROCm préparé avant la demande ; le gain doit dépasser le temps de portage. [Conditions officielles](https://www.amd.com/en/developer/resources/cloud-access.html).
- **EuroHPC AI Factories** propose des accès gratuits sous critères d'éligibilité. Le volet industriel vise notamment PME/startups ; un projet individuel ou associatif ne doit pas être supposé automatiquement éligible. Pour une extension de recherche, envisager un partenaire éligible et un dossier basé sur le pilote. [Modes d'accès officiels](https://www.eurohpc-ju.europa.eu/ai-factories/ai-factories-access-modes_en).

Le budget reste autonome : aucune gratuité conditionnelle n'est comptée comme déjà obtenue.

## 9. Ordre de travail et décision d'entraînement

| Étape | Action | Condition de passage |
|---|---|---|
| 1 — baseline locale | Essayer le checkpoint retenu sur FR/EN, instrumentaux, cover/repaint, extraits courts | Résultats réels, temps et VRAM enregistrés ; licences et dépendances fixées |
| 2 — données pilotes | 500 compositions, quatre versions, premières prises vocales et synthétiques | Notes/rendus alignés, corpus musicalement utile, splits sans fuite |
| 3 — adaptation courte | Base/codec gelés ; adaptateur unique puis 2–4 spécialisés ; routage explicite, planificateur et conditionnements ciblés | Comparaison sous budget commun ; gain mesuré, notes et chant préservés |
| 4 — extension de capacité | Prototype de conditions symboliques et pistes, régions masquées | Fidélité aux notes, isolation et conservation vérifiées sur 20–30 s |
| 5 — montée en charge | Étendre progressivement jusqu'au catalogue de 10 000 compositions | Débit/coût/cache démontrés ; courbe de validation justifiant davantage de données |
| 6 — suite du modèle | Longue durée, huit pistes et intégration desktop | Financement complémentaire ou accès de calcul obtenu si nécessaire |

La base partagée garde le plan musical/vocal et les interactions entre pistes. Sélectionner au maximum un adaptateur spécialisé par unité disponible, avec chemin commun pour les rôles non couverts, et garder cette sélection stable pendant les étapes de génération. Le cas d'un checkpoint limité au mix est déclaré ; ce routage ne produit pas à lui seul des pistes natives.

Le routage appris puis le MoE complet sont des expériences conditionnelles après le pilote, selon [TRAINING_PLAN.md §7.1](TRAINING_PLAN.md#71-pilote-à-adaptateurs-et-décision-moe). Une augmentation de capacité ne garantit pas une économie de mémoire ou de calcul : compter tous les poids résidents, les paramètres actifs, la préparation et l'évaluation. Aucun budget supplémentaire ni entraînement MoE complet n'est implicitement ajouté à l'enveloppe de 470 €.

Une adaptation LoRA/LoKr convient à certaines dimensions d'un modèle existant ; elle n'ajoute pas automatiquement une entrée MIDI, une génération native de huit instruments ni une sortie MusicXML fidèle. Ces extensions demandent les blocs et expériences décrits dans [TRAINING_PLAN.md](TRAINING_PLAN.md).

Pour une nouvelle entrée symbolique, commencer par un encodeur de notes et des adaptateurs de conditionnement, puis évaluer l'adhérence dans l'audio. Pour les pistes, comparer les tâches de parties disponibles sur le checkpoint à un nouveau générateur multipiste. Aucune de ces extensions n'est déclarée acquise par ce dossier de coût.

Le pilote doit valider **du chant et de l'instrumental**. Sa réussite correspond à une base exploitable pour poursuivre le modèle, avec un corpus traçable et des premières améliorations mesurées ; elle ne vaut pas validation de la V1 complète.

## 10. Livrables de la première campagne

Catalogue musical original, moteur de génération/rendu, registre de licences, manifeste de corpus, corpus pilote matérialisé, recettes du corpus étendu, cache mesuré, protocole vocal, checkpoints/adaptateurs et politique de routage, comparaison à l'adaptateur unique, décision motivée sur le MoE, métriques indépendantes et bilan de dépenses.

Indiquer ce qui est déjà matérialisé, ce qui est une recette reproductible, ce qui est synthétique, ce qui est humain et ce qui est seulement pseudo-annoté. Ces catégories rendent la robustesse et le coût du dataset vérifiables.
