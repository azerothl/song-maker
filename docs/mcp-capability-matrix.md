# Matrice de parité MCP

État du serveur stdio `packages/mcp-server` comparé aux parcours de Song Maker. Cette matrice décrit le code et les outils MCP présents dans le dépôt ; elle ne prouve pas qu’un parcours a été exercé avec un vrai client MCP ou dans l’application Windows.

Dernière revue du code : 10 octobre 2026. À mettre à jour avec le README MCP et cette matrice lors de tout changement des outils ou des parcours principaux.

## Sens des états

- **Disponible** : un outil MCP peut effectuer et retourner cette action dans son périmètre documenté.
- **Partiel** : une partie du parcours existe, mais le résultat ou le contrat diffère de l’application.
- **Interaction requise** : l’opération dépend d’une action physique ou d’une fenêtre que le serveur stdio ne peut pas piloter.
- **Absent** : aucun outil MCP ne propose actuellement l’opération.

Les outils ci-dessous sont ceux enregistrés par `packages/mcp-server/src/server.mjs`. Ils exécutent un flux YuE2 indépendant de l’application de bureau ; ils ne sont pas un adaptateur MCP de l’API Tauri.

## Parcours

| Parcours Song Maker | État MCP | Outil / limite réelle |
|---|---|---|
| Vérifier le moteur et les poids YuE2 | Disponible | `runtime_status` lit les prérequis locaux ; il ne démarre pas le moteur. |
| Vérifier température et VRAM NVIDIA | Disponible | `gpu_status` lit les capteurs et les seuils du runner ; matériel NVIDIA et outils de mesure requis. |
| Créer/renommer/supprimer un projet ; lister et lire les projets | Partiel | `list_projects` et `get_project` lisent les fiches du profil actif, sans écriture. La gestion de projet et la synchronisation des modifications restent absentes. |
| Bibliothèque et playlists utilisateur | Absent | Aucune lecture/écriture du stockage de Bibliothèque. |
| Générer un morceau YuE2 | Partiel | `start_song` utilise les fichiers, la licence et le worker configurés pour le serveur MCP. Il ne reprend pas le projet, le profil ou les réglages de moteur de l’application. |
| Choisir ou installer un moteur/modèle dans Song Maker | Absent | Le runner MCP exige une installation et un choix de pack préparés séparément ; il n’expose pas le gestionnaire de ressources de l’application. |
| Accepter la licence YuE2 | Partiel | Un opt-in d’environnement spécifique au MCP est requis. Ce consentement n’est ni partagé avec le profil de l’application, ni modifiable par outil. |
| Générer des variantes dans un projet | Absent | `start_song` lance une génération unique et `start_batch` accepte une prise par titre ; aucun rattachement à Versions. |
| Générer avec ACE-Step ou ACE-Step Lego | Absent | Les outils MCP n’exposent que le runner YuE2. |
| Importer un fichier batch et le prévisualiser | Partiel | `start_batch` lit un JSON depuis le workspace MCP ; `dryRun` valide et audite les directions sans créer de projet ni lancer le GPU. Le contrat n’est pas le parcours batch de l’application. |
| Générer un batch et suivre son avancement | Partiel | `start_batch` retourne un job ID ; `job_status`, `resume_job` et `cancel_job` permettent le suivi, la reprise et l’annulation. Le runner MCP reste séquentiel, une seule génération GPU à la fois, sans reprendre la file batch durable de l’application. |
| Écouter une prise pendant un batch | Interaction requise | Le serveur expose le fichier WAV et ses contrôles qualité ; l’utilisateur doit l’écouter avec un lecteur externe avant `resume_job` lorsque la validation est demandée. |
| Exporter le résultat batch | Partiel | Les WAV sont écrits dans le dossier de sortie ; pas d’export audio multi-format ni de bilan intégré à la Bibliothèque. |
| Importer de l’audio dans un projet | Absent | Aucun outil MCP d’import de fichier audio. |
| Séparer un audio en stems | Absent | Aucun outil MCP de séparation. |
| Ajouter ou éditer une piste, régler le mix et les effets | Absent | Aucun outil MCP de production ou de mixage. |
| Charger un VST3/AU | Absent | Pas d’hôte de plugin exposé par MCP. L’hôte de l’application est suivi séparément dans #326. |
| Éditer/générer une partition, MIDI ou transcription audio-vers-MIDI | Absent | Aucun outil de composition ou de conversion MIDI. |
| Enregistrer un micro ou contrôler une interface audio | Interaction requise | Aucun outil d’enregistrement ; la sélection du périphérique et l’autorisation micro requièrent l’application et l’appareil de l’utilisateur. |
| Hôte DeclUI / client Akasha | Absent | L’hôte embarqué opt-in de #343 est un service distinct ; il ne constitue pas la parité du serveur MCP de génération. |

## Couverture de l’API MCP actuelle

| Outil | Entrée et résultat | Effets / garde-fous |
|---|---|---|
| `runtime_status` | Aucun argument ; état des fichiers et du moteur YuE2 local. | Lecture seule ; ne lance aucune génération. |
| `gpu_status` | Aucun argument ; température et VRAM du GPU NVIDIA. | Lecture seule ; ne change pas les limites du pilote ou de la carte. |
| `list_projects` | `query` facultatif ; profil actif et résumés des projets, triés par dernière modification. | Lecture seule du dossier de données Song Maker ; les paroles sont omises des résumés. |
| `get_project` | `projectId` ; fiche de projet avec style, paroles, paramètres et identifiants de prises actives. | Lecture seule ; ne modifie ni le projet ni la bibliothèque. |
| `start_song` | `title` (1–120), `style` (1–4000), `lyrics` (0–4000), `outputDirectory`, `targetDurationSec` (30–360, défaut 180), `cot` (`full`/`melody`/`off`), `instrumentalMode`, `seed` (uint32), `creativeDirection` facultatif avec six champs de 240 caractères. Retourne un job ID et l’état initial. | Génère un WAV YuE2 dans le workspace autorisé. Vérifie l’opt-in de licence et les limites GPU. Une erreur de validation, de licence, de prérequis ou de capacité est retournée comme erreur MCP lisible. |
| `start_batch` | `batchFile` dans le workspace, `outputDirectory` requis hors `dryRun`, `dryRun`, `reviewBeforeNext` et `requireCreativeDirection` (les trois booléens ont des défauts sûrs). Retourne un rapport d’audit en simulation ou job ID et état initial en exécution. | `dryRun` n’utilise pas le GPU. L’exécution est séquentielle, refuse les demandes de parallélisme/retry non supportées et ne remplace pas les exports existants. |
| `job_status` | `jobId` UUID ; état, compteurs, fichiers terminés, erreurs, dossier de sortie, avertissements, revue audio et horodatages. | Lecture seule ; ne retourne pas les paroles. Le statut se récupère par interrogation. |
| `resume_job` | `jobId` UUID ; retourne l’état du job et les compteurs après demande de reprise/validation. | Autorise la génération suivante après arrêt de sécurité ou revue qualité. L’utilisateur doit écouter le WAV avant de confirmer une revue. |
| `cancel_job` | `jobId` UUID ; retourne l’état (`cancelling` ou terminal) et si l’annulation a été demandée. | Arrête le travail en cours et conserve les sorties déjà publiées. L’achèvement peut être coopératif ; consulter `job_status`. |

Les outils de génération exposent le progrès par `job_status` et les erreurs sous forme de message texte MCP. Ils n’émettent pas d’événements de progression. Les états de batch comprennent notamment `queued`, `running`, `paused_safety`, `paused_review`, `paused_quality`, `cancelling`, `completed`, `completed_with_errors`, `failed` et `cancelled`.

## Gaps d’acceptation restant

- Les outils de projet lisent le profil et les fichiers du format Song Maker ; ils ne partagent pas encore les validations d’écriture ni les règles de persistance de l’application.
- Création/modification/suppression de projets, versions, bibliothèque et playlists, import audio, stems, mixage, MIDI, réglages de modèles et ressources ne sont pas pilotables via MCP.
- Les états de job sont consultés par interrogation ; il n’y a pas de flux d’événements MCP ni de reprise de la file batch de l’application.
- Les tests du package vérifient le protocole et le runner local. Il reste à exercer les capacités annoncées depuis un vrai client MCP Windows et à retrouver un artefact dans l’application lorsqu’une intégration le promettra.

Voir aussi : [README du serveur MCP](../packages/mcp-server/README.md), [ticket #410](https://github.com/azerothl/song-maker/issues/410), [mode batch #368](https://github.com/azerothl/song-maker/issues/368), [hôte DeclUI #343](https://github.com/azerothl/song-maker/issues/343), [hôte VST3/AU #326](https://github.com/azerothl/song-maker/issues/326).
