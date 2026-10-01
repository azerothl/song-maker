# Données, entraînement et ressources

**Version :** 0.1 — plan de recherche proposé, 1er octobre 2026.<br>
**Contrat associé :** [MODEL_SPEC.md](MODEL_SPEC.md). Instrumental et chant font partie de la V1 complète.

## 1. Stratégie de départ

Développer un système composé d'un planificateur musical/vocal et d'un générateur audio multipiste conditionnel. Commencer par réutiliser des encodeurs et codecs évalués ; comparer l'adaptation d'un générateur existant à l'entraînement d'un générateur multipiste dédié.

Un LoRA de style ne suffit pas à créer une nouvelle capacité d'entrée MIDI, une topologie multipiste ou une garantie d'inpainting. Ces capacités exigent une représentation, des données, des interfaces de conditionnement et des objectifs d'entraînement adaptés.

La décision entre adaptation et entraînement dédié dépend de trois preuves : fidélité aux événements symboliques, génération vocale intelligible et génération de parties isolées cohérentes. Un excellent mix stéréo seul ne répond pas à ces preuves.

## 2. Corpus nécessaires

### 2.1 Trois niveaux de supervision

| Niveau | Contenu | Usages |
|---|---|---|
| A — aligné complet | Audio par instrument, mix, MIDI/partition, paroles et alignement vocal, structure | Supervision du contrat complet et jeu de validation principal |
| B — aligné partiel | Audio multipiste sans notes, ou chant avec partition sans accompagnement, ou audio + MIDI de certains instruments | Entraînement partiel avec pertes activées seulement sur annotations disponibles |
| C — faiblement annoté | Mix + texte, MIDI seul, partition seule, audio avec pseudo-labels | Préentraînement et élargissement stylistique ; jamais vérité terrain du test principal |

Chaque exemple contient un masque de disponibilité des annotations. Une note absente d'un corpus partiel ne signifie pas une absence de note dans la musique. Une piste non annotée n'est pas entraînée comme silence.

### 2.2 Sources candidates

| Source | Ce qu'elle peut apporter | Action avant inclusion |
|---|---|---|
| [Slakh2100-redux, publication des auteurs](https://zenodo.org/records/4599666) | Parties synthétiques et MIDI aligné ; démarrage instrumental reproductible | Utiliser la version dédupliquée, exclure `omitted`, vérifier les œuvres apparentées et consigner la version |
| [GTSinger, dépôt des auteurs](https://github.com/AaronZ345/GTSinger) | Chant, annotations temporelles et MusicXML ; français/anglais présents | Relever les conditions exactes, vérifier alignements, couverture linguistique et séparation des chanteurs/œuvres |
| Sessions de musiciens partenaires | Pistes de studio réelles, prises, partitions, paroles et variations d'interprétation | Collecter les sources et les autorisations d'usage prévues pour données, voix, paroles et publication |
| Rendus de compositions maîtrisées | Notes et pistes isolées à grande échelle, différents instruments et tempi | Contrôler les droits des compositions, banques sonores, rendus et redistribution |
| Corpus audio/textuels réutilisables | Couverture des styles et du timbre | Qualifier chaque source ; ne pas assimiler accès public et autorisation d'entraînement/publication |

Les auteurs de Slakh signalent des doublons MIDI entre splits dans la version originale ; des rendus différents du même MIDI peuvent donc provoquer une fuite. Cette alerte motive la déduplication au niveau de la composition. [Source primaire](https://zenodo.org/records/4599666).

Les corpus instrumentaux et vocaux peuvent initier des composants séparés, mais un corpus de **chant accompagné avec pistes synchronisées** reste nécessaire pour apprendre et valider leurs interactions. Mélanger arbitrairement une voix et un accompagnement ne crée pas une paire musicale correcte.

### 2.3 Manifeste par exemple

Stocker `example_id`, `composition_group_id`, `recording_id`, source/version, empreintes, durée, fréquence, pistes, instruments, langues, paroles, notes, transformations, annotations disponibles, confiance, split et métadonnées de réutilisation.

Les conditions de réutilisation sont enregistrées séparément pour code, poids de départ, enregistrements, œuvres, paroles, voix et banques de sons. La licence du code Song Maker ne détermine pas celle des futurs poids. Une source sans conditions établies reste hors du corpus utilisé pour une publication prévue.

### 2.4 Corpus pilote proposé

Les volumes suivants sont des objectifs de préparation, à réviser après inventaire ; ils ne décrivent pas des données déjà possédées.

| Ensemble | Cible initiale | Finalité |
|---|---|---|
| Technique | 20 compositions originales, 4–8 pistes, 15–30 s | Import/export, notes, masques, délais codecs et silence |
| Instrumental | 50–100 h de mixes avec pistes et symboles alignés | Apprentissage des parties et de leurs interactions |
| Vocal | 20–50 h de chant annoté couvrant FR/EN | Notes, phonèmes, syllabes, timing, intelligibilité et timbre |
| Vocal accompagné | 10–20 h avec voix isolée, accompagnement et paroles alignées | Cohérence voix/instruments et retouches vocales contextualisées |
| Validation réservée | Au moins 30 compositions instrumentales et 30 chantées | Décisions de recherche hors entraînement |

Les heures sont des **heures de chronologie de morceau**, pas la somme des heures de pistes. Publier aussi le nombre d'œuvres, d'interprètes, de pistes-heures et la distribution de durées. Ces volumes conviennent à une étude de faisabilité/adaptation ; ils ne garantissent pas un modèle généraliste de qualité studio entraîné de zéro.

## 3. Préparation et alignement

1. Qualifier les sources et attribuer les groupes de composition avant de découper les extraits.
2. Décoder sans traitement caché ; conserver originaux et transformations d'import.
3. Vérifier que les pistes ont une chronologie commune, compenser les latences documentées de rendu et garder les décalages de prise.
4. Importer notes, tempo, métrique, programmes et paroles dans `CompositionGraph`.
5. Établir l'alignement notes ↔ samples et syllabes/phonèmes ↔ notes, puis annoter erreurs et confiance.
6. Produire crops, masques et augmentations à partir de la chronologie alignée.
7. Mettre en cache les latents avec la révision du codec et les empreintes de la préparation.

Pour un enregistrement humain, une tempo map notée et le timing interprété ne sont pas identiques. L'alignement doit préserver rubato, anacrouse, swing et respiration ; les rendus parfaitement quantifiés ne suffisent pas.

Contrôler les cas de vélocités extrêmes, notes liées, pédale, instruments transpositeurs, percussion, silence, syllabes sur plusieurs notes et changement de tempo. Préserver les sessions qui contiennent des difficultés utiles au modèle plutôt que de filtrer tout ce qui n'est pas facile à aligner.

## 4. Séparation entraînement / validation / test

- Former les groupes avant les splits : œuvre, reprises/covers connues, arrangements, stems, MIDI source et augmentations.
- Garder tous les extraits et rendus d'une même composition dans un seul split.
- Détecter doublons par empreintes exactes, empreintes audio et similarité des séquences de notes, avec revue des cas ambigus.
- Prévoir des tests séparés de nouvelles compositions, nouveaux chanteurs et nouvelles instrumentations ; annoncer ce que chacun mesure.
- Figer le test final et l'utiliser une fois les choix de modèle et seuils établis sur validation.

Les comparaisons utilisent les mêmes sources de test, durées, contraintes et budgets déclarés. Si un modèle préentraîné a un corpus inconnu, l'absence de contamination ne peut pas être affirmée ; publier cette incertitude et ajouter un test de compositions inédites créées pour l'étude.

## 5. Tâches d'entraînement

Toutes les tâches partagent chronologie, identité de piste et règles de masque. La distribution initiale ci-dessous est une **hypothèse**, pas un réglage validé ; les exemples chantés traversent toutes les tâches compatibles.

| Tâche | Proportion initiale | Conditions → cible |
|---|---:|---|
| Génération depuis texte/paroles | 20 % | Style et paroles → événements + toutes les pistes |
| Rendu depuis partition/MIDI | 20 % | Événements fournis → interprétation audio |
| Accompagnement / arrangement | 15 % | Pistes connues → parties complémentaires |
| Inpainting | 25 % | Temps/pistes observés → régions masquées |
| Cover / transformation | 10 % | Contenu confirmé + nouvelle instrumentation/style → nouvelle interprétation |
| Variante / continuation | 10 % | Source et dimensions libres → autre version / suite |

Les couples entrée/cible pour covers et variantes doivent matérialiser le changement demandé. On peut rendre une même composition avec plusieurs arrangements maîtrisés ; deux enregistrements aléatoires du même genre ne forment pas un exemple de cover.

### 5.1 Masques d'inpainting

Combiner région temporelle courte, phrase de 1–4 mesures, section longue, piste entière, sous-ensemble de pistes, régions disjointes et jonctions du début/de la fin. Inclure notes tenues, pédales, réverbérations et phrases vocales traversant les frontières.

Les masques d'écriture sont séparés du contexte lu. Entraîner également les cas presque entièrement masqués et les cas avec une seule piste connue. Des masques uniquement rectangulaires simples ne suffisent pas aux retouches réelles.

### 5.2 Conditions manquantes et conflits

Utiliser dropout de modalités et de conditions pour apprendre texte seul, audio seul, symbole seul et combinaisons. La probabilité de dropout est choisie sur validation ; les verrous ne sont jamais effacés d'une tâche qui se présente comme strictement verrouillée.

Les requêtes contradictoires servent aux validateurs et aux tests de diagnostic. Leur cible n'est pas une musique qui viole arbitrairement une contrainte.

## 6. Objectifs et pertes

### 6.1 Plan musical

Prédiction des événements inconnus, structure et instruments ; objectifs pour hauteurs, rythmes, durées, accords, phonèmes et allocation syllabique. Masquer les cibles manquantes et imposer les verrous par construction dans le décodeur.

Les verrous d'événements et la légalité des formats sont des contraintes logicielles. Une faible perte moyenne ne remplace pas leur validation.

### 6.2 Génération audio

Pour le candidat flow matching, entraîner le champ de vitesse sur les latents cibles inconnus ; pour le candidat à tokens, utiliser une perte de prédiction des codes correspondant aux cellules inconnues. Les régions observées conditionnent la génération et ne sont pas des cibles à régénérer.

Pertes auxiliaires possibles, à ablater :

- Correspondance note/onset/rythme entre audio et événements.
- F0 et expression vocale sur les portions voisées, durées des syllabes et alignement des phonèmes.
- Accord entre parole prévue et parole chantée ; les scores d'un ASR sont contrôlés par annotations humaines.
- Timbre/instrument cible et réduction des événements instrumentaux hors piste.
- Cohérence harmonique et rythmique entre pistes, maintien des motifs à longue durée.
- Reconstruction du mix depuis les pistes uniquement lorsque la référence de mix est compatible avec la recette connue.
- Continuité aux frontières des régions régénérées, sans pénaliser la diversité permise.

Si le mix de studio contient un master non linéaire ou des effets inconnus, une simple perte `mix = somme des stems bruts` est incorrecte. Utiliser la recette disponible ou exclure cette égalité de l'objectif supervisé.

Le codec est d'abord évalué/fixé, puis éventuellement adapté avec reconstruction waveform, spectrale multi-résolution et objectifs perceptuels. La qualité de reconstruction du codec est une limite indépendante de la qualité du générateur.

### 6.3 Équilibrage et calibrage

Mesurer la contribution de chaque objectif et les gradients par tâche/modalité. Éviter qu'une masse de données instrumentales masque les erreurs de paroles ou que la perte vocale dégrade toutes les autres pistes.

Reporter les résultats séparément FR/EN, instrumental/chant, notes fournies/estimées, durée courte/longue, pistes isolées/mix. Les poids des pertes sont des paramètres d'expérience et doivent apparaître dans le manifeste d'entraînement.

## 7. Expériences et ablations

| Comparaison | Question |
|---|---|
| Plan musical + audio vs audio sans plan | Le plan améliore-t-il les notes, les exports et la structure ? |
| Interaction entre pistes vs synthèse indépendante | Le modèle apprend-il une meilleure cohérence rythmique/harmonique ? |
| Flow matching vs tokens multi-flux | Quel compromis qualité, contrôle local et coût ? |
| Conditions audio + symboles vs chacune seule | La multimodalité améliore-t-elle le résultat sur des tâches appariées ? |
| Vrai multipiste vs pseudo-stems séparés | Quel effet sur l'isolation, le timbre et les fuites instrumentales ? |
| Adaptation préentraînée vs générateur dédié | Quel investissement est nécessaire pour satisfaire le contrat ? |
| Plan vocal explicite vs paroles seules | Quel effet sur intelligibilité, notes, mélismes et placement ? |
| Contexte global vs fenêtres indépendantes | Les motifs, sections et voix restent-ils cohérents sur 240 s ? |

Références externes candidates : [JASCO](https://arxiv.org/abs/2406.10970), [StemGen](https://arxiv.org/abs/2312.08723), [MusicGen-Stem](https://arxiv.org/abs/2501.01757), [SongGen](https://github.com/LiuZH-19/SongGen) et [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5). Ces systèmes ont des tâches différentes ; une capacité absente est indiquée comme non applicable, jamais évaluée comme un mauvais résultat.

Avant tout usage de poids externes, fixer leur révision, le codec, la liste de tâches, les conditions de réutilisation et le runtime. Le dépôt ACE-Step distingue notamment les capacités des checkpoints base, sft et turbo ; une comparaison doit porter sur le checkpoint réellement utilisé. [Source officielle](https://github.com/ace-step/ACE-Step-1.5).

Utiliser plusieurs seeds d'entraînement lorsque le budget le permet, au minimum trois seeds d'échantillonnage pour la validation comparative, mêmes cas et écoute aveugle. Rapporter dispersion et intervalles de confiance ; une démo réussie ne suffit pas à choisir l'architecture.

## 8. Ressources et budget à mesurer

### 8.1 Profils de modèles candidats

Hypothèse de recherche : planificateur compact de quelques centaines de millions de paramètres ; générateur audio entre environ 0,6 et 2 milliards. La taille du codec et d'une éventuelle branche vocale doit être comptée séparément. Ces valeurs servent à établir une matrice d'expériences ; elles ne sont pas une exigence finale.

Un système plus grand déjà préentraîné peut servir de baseline et un système plus petit peut satisfaire des tâches ciblées. Publier le nombre total de paramètres et le nombre entraînable ; « LoRA » ne décrit pas la mémoire d'inférence de son modèle de base.

### 8.2 Entraînement

À titre d'arithmétique, une configuration avec poids BF16 (2 octets), gradients BF16 (2), copie maître FP32 (4) et deux moments FP32 (8) représente **16 octets par paramètre**, avant activations et buffers. Deux milliards de paramètres entraînés représentent alors environ **32 Go décimaux** pour ces seuls états. D'autres stratégies donnent d'autres chiffres.

Les activations dépendent fortement de la durée, du nombre de pistes et du mécanisme d'attention. Une GPU de 16 Go peut servir à certaines préparations, adaptations et essais courts ; la spécification ne suppose pas qu'elle entraîne de zéro le système complet. Étudier checkpointing, accumulation, gel de blocs, précalcul des latents et sharding selon les mesures.

Le budget se calcule à partir d'un pilote réel :

```text
GPU-heures = durée moyenne d'une mise à jour en secondes
             × nombre de mises à jour × nombre de GPU / 3600

Coût de calcul = GPU-heures × tarif réellement applicable
                + stockage + préparation + évaluations + marge de relance
```

Mesurer au moins 200 mises à jour après échauffement, inclure données/communication et publier débit, pic VRAM, mémoire hôte et checkpoint. Le nombre de mises à jour final dépend de la courbe de validation ; aucun coût ni délai calendaire n'est présenté comme établi à ce stade.

### 8.3 Inférence et stockage

Objectif à tester : profil local sur Windows/CUDA, avec matrice 12/16/24 Go selon matériel disponible ; pas de seuil minimal garanti avant mesure. Comparer 30/120/240 s, 1/4/8 pistes et chant/instrumental, avec chargement à froid et à chaud.

Rapporter `RTF = temps de génération / durée audio`, délai du premier aperçu, durée totale, VRAM, RAM et taille des artefacts. L'exécution CPU et d'autres backends sont des extensions à valider, pas des replis annoncés d'avance. GGUF n'est pas une exigence de l'entraînement ni une preuve de compatibilité avec audio.cpp.

Une piste stéréo PCM 24 bits à 48 kHz de 240 s contient 69 120 000 octets de données, hors en-têtes. Huit pistes et un mix représentent environ **622 Mo décimaux** sans compression, hors caches/versions. Prévoir stockage des originaux, latents, checkpoints et variantes ; mesurer FLAC sur les données réelles.

La compression et quantification des poids sont étudiées après validation de référence. Toute version compacte repasse les mesures de chant, notes, isolation, raccords et conservation ; elle a sa propre liste de capacités validées.

## 9. Jalons et critères de passage

| Jalon | Travail | Preuve nécessaire |
|---|---|---|
| J0 — contrats et corpus | Représentation, convertisseurs, masques, données pilotes | Round-trip musical, provenance et splits contrôlés |
| J1 — codecs et baselines | Reconstructions instrumentales/vocales, modèles de référence | Rapport de qualité, délais et limites de représentation |
| J2 — preuve instrumentale et vocale | Extraits de 20–30 s avec notes/paroles, plusieurs pistes | Mix, pistes isolées, MusicXML/MIDI et mesures alignées sur les mêmes résultats |
| J3 — éditions | Inpainting voix/instruments, cover, variante, accompagnement | Conservation exacte, invariants vérifiés, modifications perceptibles |
| J4 — V1 complète | Généralisation, FR/EN, 10–240 s, jusqu'à 8 pistes | Passage des critères [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md) sur jeux réservés |
| J5 — intégration | Provider Song Maker, versions, imports/exports réels | Parcours desktop complet, restauration et export réimporté |

J2 doit inclure du chant ; le repousser après J4 contredirait le périmètre confirmé. Un échec vocal, une mauvaise isolation ou des exports symboliques incohérents bloque le passage plutôt que d'être masqué par la qualité du mix.

## 10. Livrables de recherche

Inventaire des données, conditions de réutilisation, rapport de déduplication, schéma d'alignement, configurations d'expérience, checkpoints, métriques par tâche, cas d'échec, extraits écoutables, ablations et fiche de ressources.

La model card finale expose les langues, instruments, durées et modes évalués, les écarts de fidélité, les limites de transcription, le matériel testé, les conditions de réutilisation et les références de formation. Le résultat de chaque jalon doit être reproductible sans dépendre d'un exemple choisi à la main.
