# Conformité produit et interface — 5 octobre 2026

## Portée et méthode

Référence de départ : `75e37cc`, branche locale `codex/product-conformance`. Revue du README, du contrat historique `specs/SONG_MAKER_SPEC.md`, des 16 issues ouvertes (dont trois créées pendant l'audit) et des suites de livraison mentionnées par ces tickets. Vérifications dans l'application **Tauri Windows de développement**, sur RTX 4080 SUPER 16 Go, YuE2 Q4 et ACE-Step ; ce n'est pas une validation d'un installeur publié. Les tests Chromium sont identifiés séparément. Une issue fermée, un module présent ou une compilation réussie ne prouvent pas un parcours produit utilisable.

Les phases historiques et la vision future de la spec ne constituent pas toutes des fonctions annoncées disponibles. Les écarts ci-dessous restent suivis jusqu'à réalisation de leurs critères ; la correction des textes ne réalise pas les moteurs manquants.

## Tickets et travaux

| Ticket | État constaté et correction locale | Reste à livrer ou à mesurer |
| --- | --- | --- |
| [#377 Instrumental](https://github.com/azerothl/song-maker/issues/377) | Brouillons exclus ; retrait HTDemucs des voix en local et dans le worker distant, original conservé. Essais YuE2 natifs 30/60/360 s et chaîne HTTP worker → moteur CUDA → HTDemucs → WAV 29 999 ms vérifiés. | Absence de voix résiduelle à valider à l'écoute ; nouvelle chaîne locale ACE-Step et import du résultat distant dans l'interface à vérifier. |
| [#378 Clarté UX](https://github.com/azerothl/song-maker/issues/378) | Suppression des diagnostics permanents de Créer, textes FR/EN simplifiés, paroles désactivées et expliquées en instrumental, réglages avancés et Générer visibles sans chevauchement. Modèle maison replié et annoncé en développement. « Moteur audio » remplace « runtime » dans le menu ; import audio décrit par son action. Détails techniques dépliables ; avis de licence visible avant acceptation, repliable ensuite. Navigation entre écrans réinitialise le défilement pour retrouver les actions principales. | Revue avec des utilisateurs débutants ; vérification de tous les messages issus des fournisseurs, dont certains diagnostics restent en français. |
| [#379 Comparaison moteurs](https://github.com/azerothl/song-maker/issues/379) | Source audio dépend du chemin stable, plus d'affectation à chaque mise à jour du parent ; pause, position et reprise conservées lors du choix explicite d'une autre source. Comparateur réel YuE2/ACE-Step visible dans Tauri ; lecture observée à 0:16 / 0:29. | Régression Chromium passée avec WAV de 12 s et mises à jour toutes les 100 ms ; écoute musicale humaine encore nécessaire. |
| [#380 Séparation](https://github.com/azerothl/song-maker/issues/380) | Action directe en Production, disponible avant le premier mix. Blocage expliqué sans génération ; Réglages du mix désactivé sans mix. Génération → choix HTDemucs → quatre pistes observé dans Windows. | Installer et publier la correction ; vérifier les séparateurs optionnels sur leurs poids réels. |
| [#381 Écoute des prises](https://github.com/azerothl/song-maker/issues/381) | Lecteur ajouté au comparateur multi-candidats ; écouter n'active pas la prise. Les écoutes s'excluent mutuellement, y compris avec le lecteur du mix. Prise 2 écoutée jusqu'à 0:18 / 0:29 dans Tauri ; version active et mix conservés. | Test média Chromium passé ; activation volontaire à revérifier nativement. |
| [#382 Ajout destructif](https://github.com/azerothl/song-maker/issues/382) | Commande dédiée renvoyant `generationId`, sans sauvegarder le formulaire ou remplacer la génération active. Import dans le dernier mix enregistré. Ajout réel de `gen-002` comme cinquième piste : paroles, style, `gen-001`, `sep-001`, `mix-v001` conservés. | Même parcours réel avec Lego ; interruption et éditions concurrentes à vérifier. |
| [#383 Alternatives destructives](https://github.com/azerothl/song-maker/issues/383) | Commande dédiée de comparaison : génération d'une alternative sans activation. ACE-Step `gen-003` produit depuis Versions ; titre, style, paroles, durée, génération active, séparation et mix comparés au document antérieur et conservés. | Génération de plusieurs alternatives YuE2 dans ce parcours et activation explicite à revérifier nativement. |
| [#368 Batch](https://github.com/azerothl/song-maker/issues/368) | Accès Bibliothèque, écoute de chaque prise et conservation du choix utilisateur ; workers isolés, configuration/ports distincts, mesure réelle de deux générations simultanées YuE2 Q4. Pause/reprise et relance des échecs observées. Ressources protégées et tentative liée aux artefacts. HTDemucs présent dans les workers ; instrumental 30/60 s réussi en relance. | Arrêt forcé et processus orphelins, équité entre lots, ACE-Step simultané, multi-GPU et contenus hétérogènes restent à vérifier/livrer. Les anciennes configurations n'ont pas les nouvelles empreintes. |
| [#325 Parties guidées par l'audio](https://github.com/azerothl/song-maker/issues/325) | Production → Ajouter une piste → Partie instrumentale. Choix clair entre réglages du morceau et audio. Si Lego manque, génération bloquée avec action vers la section exacte d'installation. YuE2 guidé par métadonnées observé avec ajout préservant le mix. | Installer Lego, générer sur un mix réel et écouter l'alignement. La sortie peut contenir plusieurs instruments : ne pas la présenter comme une basse isolée garantie. |
| [#343 Hôte DeclUI](https://github.com/azerothl/song-maker/issues/343) | L'hôte embarqué ne publie plus des capacités qui renvoient systématiquement 403. Seulement `list_projects` annoncé. L'adaptateur refuse le statut connecté si les capacités musique requises manquent. README corrigé. | Hôte musique complet avec permissions et commandes effectives si cet objectif est poursuivi. L'alternative « indisponible sans faux badge » est respectée. |
| [#342 Prises natives](https://github.com/azerothl/song-maker/issues/342) | CPAL natif, prises WAV, punch et comping présents ; repli WebView. Monitoring natif expliqué comme indisponible. | Même session matérielle capture + mix, monitoring duplex, mesure d'alignement et preuve physique Windows. |
| [#330 Drivers](https://github.com/azerothl/song-maker/issues/330) | WASAPI **partagé**, Core Audio et ALSA via CPAL. Sélection des périphériques native existante. Documentation actualisée. | WASAPI exclusif et/ou ASIO, mesure aller-retour réelle. L'estimation du buffer ne vaut pas cette preuve. macOS/Linux non mesurés ici. |
| [#326 VST3/AU](https://github.com/azerothl/song-maker/issues/326) | Chargement exploratoire de factory sous variable de développement ; aucun DSP de plugin dans le mix. Aucune commande normale « VST disponible ». Étude mise à jour : CPAL existe désormais. | Traitement audio, inserts dans le graphe réel, éditeur, persistance, isolation des crashs et plugin de référence Windows. AU séparément si promis. Un bouton de scan seul ne satisferait pas le ticket. |
| [#323 Modèle maison](https://github.com/azerothl/song-maker/issues/323) | Recette d'entraînement hors application ; ni poids produit entraînés ni runtime texte/audio→multipistes. Radio désactivée et détail facultatif. | Données autorisées, entraînement, évaluations, poids et contrat runtime, puis intégration. La recette miniature ne remplace pas le modèle produit. |
| [#333 Signature Windows](https://github.com/azerothl/song-maker/issues/333) | Configuration Artifact Signing existante, ajout de vérification Authenticode sur EXE et installeurs avant publication finale. | Identifiants Azure absents du dépôt GitHub à la vérification ; produire et publier un artefact réellement signé. |
| [#332 Notarisation macOS](https://github.com/azerothl/song-maker/issues/332) | Signature ad hoc remplacée par certificat + identité Developer ID + notarisation obligatoire. Validation codesign/stapler/Gatekeeper ; guide ajouté. | Secrets Apple absents, aucune release macOS notariée produite pendant cet audit. |

## Correspondance avec la spec et accès dans l'interface

| Contrat | Accès produit | Conclusion de cette revue |
| --- | --- | --- |
| §§5, 8 : texte → audio, instrumental, durée, seed | Créer ; Réglages avancés | Durée fixe mesurée avant publication ; essais natifs 30/60/360 s. Priorité aux paroles conserve une marge. Voix retirées en local, résidus possibles. Longueur du WAV et continuité musicale sont deux validations distinctes. |
| §8.6 : candidats | Versions → comparer les prises | Lecteur manquant corrigé ; traitement séquentiel, pas parallélisme natif. |
| §9 : stems | Production → Séparer les pistes | Entrée manquante avant mix corrigée ; quatre stems réels observés. |
| §§7, 11 : partition/MIDI/ABC | Partition ; import MIDI, piano roll et régénération | Parcours présent dans le code et l'UI. Pas de nouvelle campagne musicale complète dans cet audit. SheetSage2 reste un téléchargement optionnel. |
| §10 : mix/arrangement/FX | Production ; Réglages de piste et du mix | Mix avec stems et nouvelle piste observé. Effets natifs présents ; aucun hôte VST produit. Capture native partielle selon #330/#342. |
| §12 : versions/historique | Versions | Audition sans remplacement ajoutée ; maintien de l'arrangement lors d'ajout d'une partie corrigé. |
| §§13–15 : stockage, file, API | Backend et statut de tâche | Workers batch isolés et reprise par artefacts présents ; deux inférences YuE2 simultanées observées. Commandes dédiées de partie et comparaison préservent l'arrangement. Validation de crash forcé encore manquante. |
| §§16–17 : UI, réglages, langue | Bibliothèque, quatre onglets, Paramètres | Contrôles d'entrée des parcours revus dans Windows à 1282×832. FR/EN contrôlé par catalogue et tests. Revue entière avec débutants non réalisée. |
| §18 : plateformes/worker/hôte | Paramètres ; fonctionnalités avancées opt-in | Windows de développement vérifié. Aucune nouvelle preuve Linux/macOS ni release signée. Worker distant distinct ; hôte incomplet annoncé indisponible. |
| §19 : licences | Avant installation/activation des modèles | Acceptations conservées ; détails facultatifs sans suppression des restrictions utiles. |
| §§20–22 : performances/accessibilité/acceptation | Parcours et campagnes de validation | Tests automatiques et preuves natives ci-dessous ; ils ne valident pas tous les critères matériels, musicaux et multiplateformes. |
| §§3.4, 23 : vision et phases futures | Fonctionnalités optionnelles ou absentes | Modèle maison, plugins et session native de monitoring restent des travaux. Le parallélisme batch YuE2 existe avec mesure préalable ; son contrat complet reste ouvert. |
| `BATCH_GENERATION_SPEC.md` §§3–11 | Bibliothèque → Générer plusieurs morceaux | Import, aperçu, lancement, écoute, export, workers isolés et mesure simultanée présents ; choix conservé. Priorité interactive complète, arrêt forcé natif et contenus/moteurs hétérogènes restent des écarts au contrat V1. |
| `music-model/MODEL_SPEC.md`, `ACCEPTANCE_TESTS.md`, plans de pilote | Paramètres → modèle maison, en développement | Contrats generate/continue/inpaint/cover/variant/arrange, sorties natives multipistes, invariants et qualité FR/EN ne sont pas réalisés par la recette de pilote. Suivis dans #323 ; aucune assimilation aux capacités YuE2 ou à la séparation après génération. |

## Preuves natives conservées

Projet créé par l'audit : `Audit conformite instrumental 2026-10-05`, ID `6e6a92f6-40b2-49cb-a2f9-ea1cd122c994`, dans le profil Hobby. Les projets antérieurs n'ont pas servi à générer ou remplacer des pistes.

- `gen-001` : seed 240649671, YuE2 Q4 CUDA, cible 30 s, résultat 29 998 ms / 48 kHz stéréo. Paroles du brouillon conservées ; `lyrics.txt` fait 0 octet. Lecture native observée à 0:16 / 0:29.
- `sep-001` : quatre pistes HTDemucs réellement visibles dans Production, mix `mix-v001`.
- `gen-002` : génération de partie et import réel d'une piste supplémentaire `Basse (2)`, document comparé à `audit-before-add-part.json`. Les quatre sources de stems restent intactes.
- `gen-003` : alternative ACE-Step produite depuis Versions, seed 2389431338, WAV 30 000 ms / 48 kHz stéréo. Aucun remplacement de `gen-001`, `sep-001` ou `mix-v001` ; titre, style, paroles et durée conservés. `lyrics.txt` vide. Les deux moteurs restent écoutables dans le comparateur.
- Comparateur A/B : YuE2 observé à 0:16 / 0:29, ACE-Step à 0:11 / 0:30. Comparateur multi-prises : Prise 2 observée à 0:18 / 0:29, sans utiliser l'action de remplacement.
- Lego absent : bouton de génération désactivé avec raison et accès à l'installation. Cette observation ne prouve pas une inférence Lego.
- Batch `084bdf47-f442-4cd5-944b-b3afe2c77a04` : import natif d'un JSON à deux morceaux, aperçu de deux tâches et réduction explicite de 2 demandées à 1 effective. Deux générations réussies (seeds 42/43), lecteur visible après correction de sa largeur, lecture observée à 0:16 puis 0:28 / 0:29 malgré le polling. Export natif : deux WAV distincts et `batch-summary.json`. Le parallélisme n'est pas livré. Pause/reprise après crash restent à vérifier en campagne native.
- Batch `f5f4e9ac-c975-4054-8877-a6775af5e491` : deux prises réelles d'un même projet, seeds 50/51, fichiers distincts et première prise conservée active. Détails du style et du mode instrumental visibles avant lancement. Une pause arrivée à la fin a révélé un statut « en pause » malgré deux réussites : branche de finalisation corrigée ensuite, test de régression ajouté. Ce cas ne prouve pas une pause au milieu d'une inférence ni une reprise après crash.
- Batch `3542baed-75c7-4c35-a90a-5286697b8e2b` : génération réelle réussie avec le nouveau snapshot, profil `profile-001`, YuE2 `yue2-3b-q4_0.gguf`, seed 60. Le lot précédent finalisé via Reprendre affiche désormais « terminé », sans nouvelle génération.

Les nouveaux lots enregistrent le profil et les réglages de génération (moteur, références du binaire et du modèle, cache et adaptateurs) et refusent une tâche si ces réglages ont changé. Les anciens lots sans ce snapshot nécessitent une nouvelle importation pour générer. Cela ne réalise pas encore le snapshot complet des empreintes des fichiers ACE-Step/adaptateurs ni la réservation atomique de tous les writers exigée par la spec batch. Les résultats déjà prêts restent consultables et exportables.

## Validation et limites de livraison

- Régressions média Chromium : polling, lecture > 3,2 s, pause, recherche, changement de source, écoute d'une prise précise du batch et exclusion des lecteurs ; réussies.
- Régressions Production : séparation sans mix, dialogues, ancrage, clavier et libellés anglais ; réussies.
- Vérification TypeScript, compilation frontend et tests de l'adaptateur DeclUI ; réussis.
- Suite Rust : 129 tests réussis, 1 ignoré (modèle externe), dont conservation du choix utilisateur lors de l'arrivée d'une prise batch, finalisation d'un lot sans tâche à mettre en pause et détection des changements de configuration du moteur.
- Suite frontend complète : **488/488 réussis**. Une assertion exigeant le jargon `audio_input` vérifie désormais la limite produit et l'action Reprise. Le test clavier de suppression d'un marqueur attend le retour de focus prévu à la prochaine frame, au lieu de le vérifier immédiatement ; le comportement produit est inchangé.
- Workflow de release analysé comme YAML ; publication/signature non exécutée.

Les corrections sont locales jusqu'à publication. Aucun ticket matériel, modèle ou release n'est clos sur la seule base de ces modifications.

## Suite : moteurs batch isolés et simultanéité mesurée

Le travail suivant poursuit #368. Les changements sont locaux sur `codex/product-conformance`.

- Chaque tentative utilise un processus, une configuration, un port, une file et des journaux propres. Le processus est arrêté et attendu avant de rendre son permis, y compris après une erreur HTTP.
- Un verrou de ressources commun exclut génération interactive et séparation pendant les appels batch. Une demande interactive en attente passe avant les nouveaux workers batch.
- L’annulation cible les workers du lot ou de la prise demandés.
- Réservation des dossiers de génération sous verrou de projet ; publication relisant le document courant. Les writers formulaire, versions, partitions, mix et import/capture participent au verrou.
- L’interface propose une vérification explicite de deux générations simultanées, créant deux prises supplémentaires. Une configuration non mesurée reste à une prise ; aucune capacité n’est déduite des seuls gigaoctets annoncés.
- La preuve conserve les empreintes des fichiers du moteur/modèle/adaptateurs, le matériel, le profil, le contenu et les options. Elle est volontairement limitée au contenu et aux réglages vérifiés, pour la session en cours.

### Observations natives Windows

Lot d’isolation `d53e4c6d-845b-4bdf-9b9a-0a98e9b6cee7`, projet `e09ef56d-4c3b-4488-a5bf-7bd1582a7ad9` : deux prises de 29 998 ms, seeds 70/71, processus 52008/47048, dossiers distincts, lot terminé. Cet essai était séquentiel.

Vérification `capacity-570b6f24-aa49-4609-914f-35abd0e30234`, YuE2 Q4, RTX 4080 SUPER, instrumental 30 s :

- Deux processus distincts, 60932 et 25460, configurations aux ports 18100 et 18120.
- Prise A : 05:44:39 → 05:45:05 UTC, WAV 29 998 ms.
- Prise B : 05:44:40 → 05:44:59 UTC, WAV 29 998 ms.
- 49 échantillons de mémoire ; minimum libre 6 560 Mio, supérieur à la réserve de 2 048 Mio.
- Rapport `measurement.json` : `verified=true`, `overlap=true`. L’aperçu natif passe de 1 à 2 disponibles et le bouton Lancer devient utilisable à deux.
- Résultats de vérification dans les projets `ce3c6667-929d-40ba-b25f-4e1adfd635f9` et `40fd54b6-127e-4b86-ab16-c12f1fea8157`.

Ce résultat ne valide ni ACE-Step en parallèle, ni des morceaux aux options/contenus différents, ni le multi-GPU. Le maintien de capacité après redémarrage, la réconciliation de publication après crash et l’alternance stricte entre plusieurs lots restent à compléter ; #368 reste ouvert.

Validation de cette suite : TypeScript et build réussis ; frontend 488/488 ; Rust 135 réussis et 1 ignoré. Le warning de taille du bundle reste présent.

### Correction de la collision de ports et validation du lot complet

Le premier lot simultané `25d9cbd4-4545-4276-9898-a7d69a38fb23` a révélé une collision : deux workers choisissaient 18080 avant le démarrage des serveurs. Une prise réussissait, la seconde perdait sa connexion lorsque le premier processus s’arrêtait. La réservation est désormais faite sous le verrou du pool, avec des plages distinctes.

Une nouvelle mesure `capacity-fa08fcff-d204-4c72-853d-f0e0c0e016f3` a validé deux appels simultanés. Lot natif suivant `e5a9cac0-4b61-4562-8437-60ae97b0e64a`, projet `dc60f178-eaac-47a1-9db1-19aad7eae0c0` :

- Prises 1/2, seeds 80/81 : processus 64324/45572, ports 18080/18120. Début commun 05:57:07 UTC ; fin 05:57:32 / 05:57:26.
- Pause demandée depuis l’interface pendant ces deux prises : elles terminent, les deux suivantes restent en attente, lot en pause à 05:57:35.
- Reprise depuis l’interface : prises 3/4 seulement, seeds 82/83, processus 59128/7768, ports 18080/18120 ; 05:57:56 → 05:58:17 / 05:58:15.
- Quatre WAV de 29 998 ms ; lot terminé à 05:58:20, quatre prises prêtes, zéro échec.
- Lecture native de la prise 1 pendant les prises 3/4 : lecteur observé à 0:29 / 0:29, sans retour toutes les deux secondes.
- Après redémarrage, Relancer les échecs sur le premier lot conserve `gen-001` (tentative 1) et réussit la seconde tâche dans `gen-003` (tentative 2). L’interface affiche une prise simultanée et explique que la mesure doit être renouvelée.

Les formulaires et changements de profil sont protégés tant qu’un lot non terminé conserve ces ressources, y compris en pause. Les erreurs détaillées sont repliées. L’affichage de capacité lit les changements du lot, au lieu de reprendre uniquement le plan initial.

Limites supplémentaires : le verrou d’import/capture couvre encore l’ingestion de fichiers ; certains installateurs de modèles optionnels ne participent pas encore à la protection des ressources du batch. Les modifications externes des fichiers modèle entre deux tâches ne sont pas revalidées par empreinte complète à chaque tentative. L’état moteur dans la barre latérale a été raccordé aux workers actifs, mais son affichage pendant l’inférence n’a pas été observé dans ce dernier essai.

Validation finale : build réussi, frontend 488/488, Rust 135 réussis / 1 ignoré, diff sans erreur d’espacement. Aucune livraison distante ni fermeture de #368.

## Suite : protection des ressources, reprise et simplification des paramètres

### Corrections locales

- Admission commune aux installations, aux changements de profil/réglages et au lancement/vérification/reprise des lots. Le verrou couvre les téléchargements complets : assets requis, mix, ACE-Step, Lego, SheetSage2, BS/Mel RoFormer, HTDemucs 6 pistes, Rbitnet et adaptateurs LoRA. Les nouvelles signatures Tauri conservent les arguments de l’interface.
- Les plans nouveaux conservent les chemins, tailles et dates des fichiers du moteur/modèle. Une modification détectée interrompt la prise avec un message de remise en état. Pour les prises autorisées en parallèle, une empreinte SHA-256 complète est revérifiée après admission et avant l’inférence ; la preuve est invalidée si elle ne correspond plus.
- Le worker enregistre le numéro de tentative. La récupération au démarrage rapproche worker, tâche, tentative, seed et résultat. Elle contrôle la durée réelle et l’empreinte WAV, et l’empreinte de partition lorsqu’elle est déclarée. Un résultat unique valide redevient une prise prête sans la régénérer ; résultats incomplets ou ambigus restent interrompus. Une annulation persistée garde la priorité. Le choix de version de l’utilisateur est conservé.
- Import et capture audio préparent les fichiers avant le verrou de projet, puis relisent le document courant pour publier. Les statistiques de séparation relisent les réglages au lieu de republier une ancienne copie.
- Paramètres : outils avancés dans une section repliable ; descriptions plus simples en français et anglais. Dans Séparation, les limites techniques, sources, longues notices et empreintes sont repliées ; choix, résumé des pistes et conditions de licence restent accessibles. Les erreurs de cette page sont locales, annoncées et amenées dans la zone visible.

### Essai natif Windows et tests

Lot `f6dc1f9e-bead-4027-af58-c9642ba6a721`, Audit protection modeles 2026-10-05, quatre prises instrumentales de 30 s demandées, seed initial 90. Pause depuis l’interface pendant la première prise : une prise prête et trois en attente. Pendant le lot, la barre latérale affiche YuE2 Q4 « En mémoire » et moteur actif. Après la pause, le bouton Installer Mel-Band RoFormer refuse l’installation avec « Terminez ou annulez le lot avant de modifier les modèles installés. » Aucun téléchargement n’est lancé. Annulation native des trois prises restantes, première prise conservée.

Vérification visuelle native : notices repliées, message d’erreur dans la page, accueil des paramètres allégé et ouverture de Réglages avancés. Build et TypeScript réussis ; frontend 488/488 ; Rust 141 réussis et 1 ignoré. Les tests de récupération simulent les fichiers d’une publication interrompue, une annulation, un fichier audio corrompu et une tentative différente ; ils ne constituent pas un arrêt forcé natif pendant une inférence.

### Limites restantes

La récupération concerne les nouveaux workers qui enregistrent une tentative ; les anciennes sorties sans ce lien restent interrompues. Les anciennes configurations de lot ne possèdent pas les nouvelles empreintes. La suppression des processus orphelins après un arrêt forcé, l’équité stricte entre lots, ACE-Step simultané, les contenus hétérogènes et le multi-GPU restent ouverts. Une modification externe après la dernière vérification ne peut pas être empêchée par le verrou applicatif. Aucune validation native d’import/capture concurrente dans cette passe. #368 et #378 restent ouverts et les changements sont locaux.

## Push et suite instrumental / durée (#377, #385)

Les commits `c0dde3a`, `ff952ff`, `b6c18bd` et `7c9c8d4` sont poussés sur `codex/product-conformance`. Les tickets concernés possèdent désormais les liens vers ces commits. Aucun ticket n’est fermé par ce push.

Les prises récentes `gen-007` et `gen-008` du projet The Room Keeps Warm demandent 360 s en instrumental, sans paroles envoyées, et produisent 75 278 / 109 798 ms. La borne minimale de 200 trames autorisait l’arrêt à partir de 8 s. La durée fixe impose maintenant minimum = maximum = durée × 25 ; le WAV est vérifié avant publication, avec 250 ms de tolérance. Un échec conserve les fichiers et laisse la prise active intacte. Les continuations incluent leur préfixe. Aucun silence ni boucle n’est ajouté pour ajuster le fichier.

L’instrumental YuE2 / ACE-Step audio conserve l’original puis retire la piste voix via HTDemucs et rend batterie + basse + autres. Le formulaire annonce cette étape. Le composant est vérifié par SHA et appartient à l’empreinte du lot ; une séparation échouée ne publie pas le fichier original. Les artefacts décrivent la méthode, les pistes exclues et le hash original. Partition seule et Lego ne passent pas par cette étape. La séparation reste une estimation et peut laisser des résidus.

### Vérification Windows

Projet de contrôle `ed0f9a91-8d79-493c-a51b-e7b4d7f5f229`, créé via l’interface Windows, YuE2 Q4, seed aléatoire, instrumental, plan complet, 360 s : requête 9 000 / 9 000 trames, fichier final 359 998 ms, original et stems conservés ; `durationCompliance.matches=true`. Le lecteur progresse jusqu’à 0:13 sans redémarrer toutes les deux secondes. L’arrondi de la durée totale du lecteur affiche désormais 6:00, au lieu de 5:59 pour deux millisecondes de différence.

Limite observée : les deux dernières minutes de cet essai sont très faibles (niveau moyen original -55,6 dB ; instrumental -58,5 dB, contre -15,4 / -19,2 dB pour les deux premières minutes). La conformité de longueur du fichier ne certifie donc pas six minutes de musique continue. Aucun jugement d’écoute humaine ni garantie d’absence de chant résiduel n’est acquis. #377 et #385 restent ouverts. Le mode instrumental natif ACE-Step, le worker distant et la continuité musicale longue restent à vérifier.

Tests Rust : 143 réussis, 1 ignoré. Frontend : 488 réussis. Build et TypeScript réussis, avertissement de taille du bundle conservé.

### Reprise du lot court après correction des workers

Le premier essai batch 30 / 60 s a échoué avec `unknown model id: htdemucs`, car la configuration isolée filtrait le séparateur. Aucun fichier original n’a été activé comme instrumental. Les workers déclarent maintenant générateur + HTDemucs, toujours avec un seul modèle chargé à la fois ; un test de configuration couvre ce contrat.

Lot `b15a8620-f30e-4115-b8d8-1f2dc306969a`, relance native des échecs après correction `99538c3` : deux prises prêtes, zéro échec. Les `gen-001` échouées restent conservées ; les `gen-002` de tentative 2 produisent 29 998 / 59 998 ms après exclusion de la piste voix, avec originaux conservés et `durationCompliance.matches=true`. Les brouillons non vides restent exclus. Cet essai est séquentiel, YuE2 Q4. Tests Rust : 144 réussis / 1 ignoré.

## LoRA : parcours et téléchargements (#384, #386)

La page native présentait deux catalogues, deux cases de licence et des descriptions de développeur, tandis que l’import et l’inventaire local étaient en bas. Elle ne permettait pas de voir clairement installé / activé. Le téléchargement des trois packs présentés comme vérifiés utilisait des noms absents des dépôts Hugging Face.

La page utilise désormais un seul catalogue. En premier : fichiers installés, état réel d’activation dans les réglages, bouton Ajouter un fichier LoRA et explication de l’import externe. Les choix de fichier restent visibles ; les intensités et les détails de source sont repliés. Activer un pack est désactivé tant que ses fichiers locaux sont absents. Les états ne confondent pas sélection en cours, activation enregistrée et chargement en mémoire.

Le pack instrumental référence `ar_lora_inst_v3abc.bf16.safetensors`, révision `947f2f4b28978b2b6c3e316e6a87925c76bf3c4b`, SHA `e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414`. Les fichiers factices `instrumental_ar`, `realaudio_nar_v4`, `chnsn_ar` et `chnsn_nar` sont retirés. Les packs realaudio et chanson française sont informatifs jusqu’à vérification de leur contrat complet : têtes tokenizer séparées pour realaudio, variantes cabaret / Montmartre / rive gauche / grand boulevard pour chanson française. Les boutons d’installation correspondants sont indisponibles. Cela réduit les capacités annoncées à ce qui est étayé, sans réaliser leur chargement manquant.

Sources consultées : API HF des [instrumentaux](https://huggingface.co/api/models/Mothersuperior/YuE2-instrumental-cot-full-loras?blobs=true), [realaudio](https://huggingface.co/api/models/Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4?blobs=true) et [chanson française](https://huggingface.co/api/models/becausereasons/yue2-chnsn-chanson-francaise?blobs=true), le 5 octobre 2026. Le [contrat audio.cpp v0.8.2](https://github.com/0xShug0/audio.cpp/blob/v0.8.2/src/models/yue2/session.cpp) accepte AR et NAR ; sa documentation recommande le plan complet pour l’adaptateur instrumental.

### Vérification Windows du catalogue

Depuis Paramètres → LoRA et styles, l’import externe et l’état vide sont visibles avant le catalogue. Un seul consentement CC BY-NC est affiché. Le pack instrumental passe de Non installé à Installé — non activé après le bouton Installer le pack. Le fichier réellement écrit a l’empreinte attendue `e408fd…5414`. Le bouton Activer devient disponible ; son utilisation enregistre le chemin dans le profil Hobby, avec intensité AR 1, et l’inventaire comme le catalogue affichent Activé pour la prochaine génération. L’activation canonique Windows est rapprochée des fichiers locaux sans afficher un second choix de chemin absolu.

Le test d’activation réutilise uniquement le projet de contrôle de six minutes. Les changements de réglages ne prouvent pas à eux seuls que le moteur a appliqué l’adaptateur : le résultat de cette génération et l’état final du réglage sont consignés après l’appel. Les packs realaudio et chanson restent non validés ; #386 n’est pas fermé.

### Génération effective avec l’adaptateur et import externe

La prise native `gen-002` du projet de contrôle termine le 5 octobre à 07:20:40 UTC : 359 998 ms, SHA audio `34549d09043f8cb8c0a8cd274f70a54cea2953910cacb496a789aa7c8b8aee6b`, avec AR instrumental d’intensité 1 dans la requête et dans `session_options` de la configuration audio.cpp. Les trames restent 9 000 / 9 000 ; la piste voix est exclue du rendu et l’original conservé. Les trois portions successives de deux minutes du fichier final présentent des niveaux moyens -16,2 / -17,1 / -18,2 dB, sans la chute presque silencieuse observée dans `gen-001`. Les seeds diffèrent : ce résultat ne constitue pas une comparaison causale contrôlée, ni une garantie d’absence de voix résiduelle ou de qualité musicale.

Après l’essai, Désactiver les LoRA rétablit les deux choix à Aucun adaptateur dans l’interface et les réglages persistés. Le pack téléchargé reste installé, non activé. L’import externe est aussi exécuté depuis le bouton Ajouter un fichier LoRA, avec une copie du vrai fichier vérifié : il apparaît dans la bibliothèque locale comme installé et non activé, et n’active aucun adaptateur. La copie de contrôle importée est ensuite retirée ; le fichier du catalogue reste disponible.

Validation finale des changements LoRA : frontend 489/489, paquet LoRA 8/8, TypeScript et build réussis ; Rust 144 réussis / 1 ignoré lors de la correction précédente. Avertissement de taille du bundle conservé. #384 et #386 restent ouverts pour la confirmation du parcours utilisateur et la validation des autres packs. #377 et #385 restent ouverts pour les validations acoustiques et les autres moteurs. La génération native longue avec le pack est une preuve supplémentaire, pas une résolution universelle.

## Suite : conformité de la génération distante

Le worker recevait `targetDurationSec` et `preferFullLyrics` mais ne les transmettait pas au moteur. Il ne forçait pas non plus l’exclusion des brouillons instrumentaux côté serveur et déclarait systématiquement 48 kHz / stéréo sans mesurer les données reçues.

La requête réelle utilise désormais le budget de trames de l’application : min = max = durée × 25 en durée fixe/instrumental ; marge conservée pour priorité aux paroles chantées. Les brouillons instrumentaux sont exclus même s’ils figurent dans une requête ancienne. Le parseur WAV mesure fréquence, canaux et durée ; un écart supérieur à 250 ms interrompt la publication en durée fixe. Le fichier non conforme est conservé sous `audio-unpublished.wav` pour diagnostic, soumis à la rétention du worker, et n’est pas offert au téléchargement.

Autre écart : le mode simulate du worker retourne un WAV de 250 ms avec statut réussi. L’application vérifie maintenant `result.json` et son empreinte avant le téléchargement audio : un résultat simulé, invalide ou corrompu n’est pas importé. Le message explique comment configurer le moteur distant ou générer localement. Le worker conserve ses fixtures pour les tests de contrat.

Validation : 13 tests du worker et compilation TypeScript réussis, dont deux parcours HTTP chiffrés avec un moteur simulé qui renvoie respectivement 30 s et 1 s. Le premier publie sa durée mesurée ; le second échoue, conserve le WAV de diagnostic et renvoie 404 pour audio.wav. Il s’agit d’une validation de protocole et de publication avec une réponse contrôlée, pas d’une nouvelle inférence GPU distante. Le retrait des voix distant via HTDemucs n’est toujours pas livré ; il reste suivi dans #377. L’affichage natif du refus de démonstration et la conservation de la prise active dans ce parcours restent à observer.

La mise à jour est destinée à la PR #387 (branche codex/product-conformance). Validation frontend finale : 490 tests réussis, TypeScript et build réussis ; avertissement de taille du bundle conservé. Worker : 13 tests réussis et build réussi. Ticket du faux succès de démonstration : #388. Les tickets restent ouverts pour les preuves natives et GPU manquantes.

## Suite du traitement global : instrumental distant et partition (#377, #389)

Le worker possède désormais la chaîne de retrait des voix : original conservé, resampling SOXR à 44,1 kHz, séparation HTDemucs, contrôle des quatre rôles, resampling à 48 kHz des seuls drums/bass/other puis mix avec limiteur compensant sa latence. Les quatre pistes sont conservées ; la piste vocals n’entre jamais dans le mix. Piste absente/ambiguë, durée différente, FFmpeg absent ou annulation entre les étapes empêchent la publication de l’original comme instrumental. Le worker et audio.cpp doivent partager le même chemin absolu de données ; ce prérequis est documenté. Le contrôle d’annulation n’interrompt pas une requête audio.cpp déjà en cours. La configuration du moteur reste sous la responsabilité de l’administrateur : le worker ne certifie pas son empreinte modèle.

### Preuve réelle sur cette machine

Essai par HTTP chiffré avec le worker et le vrai audio.cpp v0.8.2 CUDA, RTX 4080 SUPER, YuE2 Q4, adaptateur instrumental enregistré dans la configuration de contrôle, seed 773, 30 s, plan complet, brouillon non vide. Job `job-a9b5f82d-ed20-475d-8d6a-8ad08ccec0dc` : 10:59:46 → 11:01:37 UTC, fichier final 29 999 ms, SHA `3f25beba740eee8ea8559b66bcf1977148a4e68c823a6fbd5c776c6870275fbb`. Original SHA `09d651b6b41a61c8a06e481c61be024c6b30c06e5a7e4f807ed35cc0ccadba40`, original/stems/rendu présents dans le dossier de contrôle sous TEMP. Le serveur de contrôle indépendant est arrêté après sa fin. Aucun réglage de profil ni prise existante n’est remplacé par cet essai. Il vérifie un moteur réel et le protocole distant sur la même machine, pas un déploiement distant ni le parcours d’import Tauri. Aucun jugement d’écoute ne certifie l’absence de résidu vocal.

### Écart de partition découvert pendant l’essai

Le premier résultat publiait une partition fictive de 24 octets, fabriquée par le worker lorsque les champs score/abc étaient absents. Les vrais artefacts ABC d’audio.cpp étaient ignorés. Ticket #389 créé. Le worker lit maintenant ces artefacts (base64 ou texte), refuse les contenus sans en-tête musical ABC et ne fabrique plus de notes. Une absence réelle produit score:null et aucun téléchargement score.abc. L’import Tauri ne déclare plus un chemin score.abc inexistant lorsque aucune partition n’est fournie. La campagne HTTP couvre le résultat sans partition avec un 404 sur score.abc ; un test vérifie l’extraction d’un artefact réel au format épinglé.

### Confirmation après correction de lecture ABC

Deuxième essai réel, même configuration/seed : `job-31f57c5d-730b-4b1d-a86b-8478455d30cb`, 11:03:41 → 11:05:26 UTC. WAV final 29 999 ms, même SHA audio que le premier essai ; vraie partition ABC issue de l’artefact audio.cpp, 5 138 octets, SHA `b5fd4931ffebb7f4e789cc2299e8680f997380a498599caecef2ea87b1b740a2`. Le serveur de contrôle est arrêté après la fin, artefacts conservés sous TEMP. Validation finale : 16 tests worker réussis, build TypeScript réussi et cargo check réussi. L’import/affichage de ce résultat dans l’application reste à observer ; aucune écoute humaine ne certifie les résidus vocaux. #377 et #389 restent ouverts sur ces critères.

## Import local du résultat distant : validation des données audio

Le chemin Tauri d’import utilisait `wav_duration_ms(...).unwrap_or(0)` et déclarait toujours 48 kHz / stéréo. Un fichier tronqué pouvait donc dépasser le contrôle sommaire RIFF/WAVE, être activé ou porter de fausses métadonnées. L’import décode maintenant les échantillons du WAV en mémoire avant création de la prise : en-tête, durée positive et totalité des données sont vérifiés. Le résultat conserve la fréquence et les canaux réels. Les fichiers invalides ne créent aucun dossier de génération et ne remplacent pas la prise active.

Test Rust : vrai WAV PCM mono 22 050 Hz / 1 s correctement mesuré, version tronquée et faux RIFF refusés. Suite Rust globale : 145 tests réussis / 1 ignoré avant le dernier garde de durée sous la milliseconde ; régression ciblée relancée après ce garde. L’application Windows a été retrouvée et observée, mais le parcours complet d’import du worker dans l’interface reste à vérifier ; cette observation n’est pas présentée comme une validation de ce parcours.
