# Matrice de parité MCP

État du serveur stdio `packages/mcp-server` comparé aux parcours de Song Maker. Cette matrice décrit le code et les outils MCP présents dans le dépôt ; elle ne prouve pas qu’un parcours a été exercé avec un vrai client MCP ou dans l’application Windows.

Dernière revue du code : 10 octobre 2026. À mettre à jour avec le README MCP et cette matrice lors de tout changement des outils ou des parcours principaux.

## Sens des états

- **Disponible** : un outil MCP peut effectuer et retourner cette action dans son périmètre documenté.
- **Partiel** : une partie du parcours existe, mais le résultat ou le contrat diffère de l’application.
- **Interaction requise** : l’opération dépend d’une action physique ou d’une fenêtre que le serveur stdio ne peut pas piloter.
- **Absent** : aucun outil MCP ne propose actuellement l’opération.

Les outils ci-dessous sont ceux enregistrés par `packages/mcp-server/src/server.mjs`. Projets et Bibliothèque utilisent le stockage du profil actif. La génération YuE2 en batch est un flux séparé de l’application de bureau ; le serveur n’est pas un adaptateur général de l’API Tauri.

## Parcours

| Parcours Song Maker | État MCP | Outil / limite réelle |
|---|---|---|
| Vérifier le moteur et les poids YuE2 | Disponible | `runtime_status` lit les prérequis locaux ; il ne démarre pas le moteur. |
| Vérifier température et VRAM NVIDIA | Disponible | `gpu_status` lit les capteurs et les seuils du runner ; matériel NVIDIA et outils de mesure requis. |
| Créer/renommer/supprimer un projet ; lister et lire les projets | Partiel | `list_projects`, `get_project`, `create_project`, `rename_project`, `update_project` et `delete_project` lisent et modifient les métadonnées du profil actif ; suppression protégée par confirmation et révision. |
| Prises et historique de projet | Partiel | `list_project_versions` expose les versions avec métadonnées ; `rename_project_generation` renomme une prise, et `use_project_generation`, `use_project_separation`, `use_project_mix` et `use_project_score` sélectionnent une génération terminée, une séparation, un mix sauvegardé ou une partition. Il ne lit pas le son. |
| Bibliothèque et playlists utilisateur | Partiel | `list_library`, `create_playlist`, `delete_playlist`, `add_library_track`, `remove_library_track`, `add_track_to_playlist` et `remove_track_from_playlist` partagent le fichier du profil actif. La suppression d’une playlist ou le retrait d’un titre exigent `confirm=true`. |
| Générer un morceau YuE2 | Partiel | `start_song` utilise les fichiers, la licence et le worker configurés pour le serveur MCP. Il ne reprend pas le projet, le profil ou les réglages de moteur de l’application. |
| Choisir ou installer un moteur/modèle dans Song Maker | Absent | Le runner MCP exige une installation et un choix de pack préparés séparément ; il n’expose pas le gestionnaire de ressources de l’application. |
| Accepter la licence YuE2 | Partiel | Un opt-in d’environnement spécifique au MCP est requis. Ce consentement n’est ni partagé avec le profil de l’application, ni modifiable par outil. |
| Générer des variantes dans un projet | Partiel | `start_song` lance une génération unique et `start_batch` accepte une prise par titre ; les jobs MCP ne sont pas rattachés automatiquement à un projet Song Maker. |
| Générer avec ACE-Step ou ACE-Step Lego | Absent | Les outils MCP n’exposent que le runner YuE2. |
| Importer un fichier batch et le prévisualiser | Partiel | `start_batch` lit un JSON depuis le workspace MCP ; `dryRun` valide et audite les directions sans créer de projet ni lancer le GPU. Le contrat n’est pas le parcours batch de l’application. |
| Générer un batch et suivre son avancement | Partiel | `start_batch` retourne un job ID ; `job_status`, `resume_job` et `cancel_job` permettent le suivi, la reprise et l’annulation. Le runner MCP reste séquentiel, une seule génération GPU à la fois, sans reprendre la file batch durable de l’application. |
| Écouter une prise pendant un batch | Interaction requise | Le serveur expose le fichier WAV et ses contrôles qualité ; l’utilisateur doit l’écouter avec un lecteur externe avant `resume_job` lorsque la validation est demandée. |
| Exporter un WAV de projet ou un résultat batch | Partiel | `export_project_audio` copie et valide un WAV généré du profil actif vers le workspace ; le batch écrit ses WAV dans le dossier de sortie. Le rendu du mix et les conversions FLAC/MP3 ne sont pas exposés. |
| Importer de l’audio dans un projet | Absent | Aucun outil MCP d’import de fichier audio. |
| Séparer un audio en stems | Absent | Aucun outil MCP de séparation. |
| Ajouter ou éditer une piste, régler le mix et les effets | Partiel | `get_project_mix` lit le mix actif ou une version sauvegardée ; `update_project_mix` règle le gain master et les contrôles gain/pan/mute/solo des pistes du mix actif avec contrôle de révision. Le MCP n’ajoute pas de piste, ne rend pas le mix et n’applique pas les effets/VST. |
| Charger un VST3/AU | Absent | Pas d’hôte de plugin exposé par MCP. L’hôte de l’application est suivi séparément dans #326. |
| Lire/éditer/générer une partition, MIDI ou transcription audio-vers-MIDI | Partiel | `get_project_score` lit les voix et notes d’une partition sauvegardée ; l’édition, la génération et la conversion audio-vers-MIDI restent absentes. |
| Enregistrer un micro ou contrôler une interface audio | Interaction requise | Aucun outil d’enregistrement ; la sélection du périphérique et l’autorisation micro requièrent l’application et l’appareil de l’utilisateur. |
| Hôte DeclUI / client Akasha | Absent | L’hôte embarqué opt-in de #343 est un service distinct ; il ne constitue pas la parité du serveur MCP de génération. |

## Couverture de l’API MCP actuelle

| Outil | Entrée et résultat | Effets / garde-fous |
|---|---|---|
| `runtime_status` | Aucun argument ; état des fichiers et du moteur YuE2 local. | Lecture seule ; ne lance aucune génération. |
| `gpu_status` | Aucun argument ; température et VRAM du GPU NVIDIA. | Lecture seule ; ne change pas les limites du pilote ou de la carte. |
| `list_projects` | `query` facultatif ; profil actif et résumés des projets, triés par dernière modification. | Lecture seule du dossier de données Song Maker ; les paroles sont omises des résumés. |
| `get_project` | `projectId` ; fiche de projet avec style, paroles, paramètres et identifiants de prises actives. | Lecture seule ; ne modifie ni le projet ni la bibliothèque. |
| `list_project_versions` | `projectId` ; générations (état, moteur, seed, nom, score/WAV disponibles), séparations, sauvegardes de mix et scores (métadonnées), choix actifs et chemin WAV relatif. | Lecture seule du profil actif ; liens symboliques refusés, ni paroles ni octets audio lus. Le WAV doit être ouvert séparément ; aucune version n’est restaurée. |
| `use_project_generation` | `projectId`, `generationId`, `expectedUpdatedAt` relu depuis le projet ; retourne la fiche mise à jour et la nouvelle révision. | Ne sélectionne que le WAV publié d’une génération terminée dans le profil actif. Refuse une révision périmée ; active cette prise et efface la sélection de séparation et de mix, comme `use_generation` dans l’application. Ne supprime aucun artefact. |
| `rename_project_generation` | `projectId`, `generationId`, `name`, `expectedUpdatedAt` relu depuis le projet ; retourne la fiche et la nouvelle révision. | Renomme une génération valide ou efface son nom personnalisé si `name` est vide ; exige une génération présente et une révision courante. Ne modifie pas ses fichiers audio. |
| `use_project_separation` | `projectId`, `separationId`, `expectedUpdatedAt` relu depuis le projet ; retourne la fiche mise à jour, le mix associé et la nouvelle révision. | Active uniquement une séparation sauvegardée et son mix d’origine ; vérifie les documents et profils avant écriture. Refuse une révision périmée et ne lance pas de séparation. |
| `use_project_mix` | `projectId`, `mixId`, `expectedUpdatedAt` relu depuis le projet ; retourne la fiche mise à jour, le mix choisi et la nouvelle révision. | Active uniquement un mix sauvegardé valide ; synchronise la séparation associée si elle est disponible, sinon efface la séparation active. Refuse une révision périmée. Ne change pas les réglages du mix et ne produit pas de rendu. |
| `use_project_score` | `projectId`, `scoreId`, `expectedUpdatedAt` relu depuis le projet ; retourne la fiche mise à jour, la partition et la nouvelle révision. | Active uniquement une partition sauvegardée et valide. Refuse une révision périmée ; ne modifie pas les notes. |
| `get_project_mix` | `projectId`, `mixId` facultatif (mix actif par défaut) ; retourne les pistes, clips, réglages d’arrangement, paramètres de mix et `mixRevision` SHA-256. | Lecture seule ; liens symboliques refusés, chemins de source absolus ou hors projet masqués, chemins VST locaux et états propriétaires des plugins omis. Ne lit pas l’audio et ne rend pas le mix. |
| `update_project_mix` | `projectId`, `expectedMixRevision` lue depuis `get_project_mix`, `mixId` facultatif (mix actif), gain master optionnel (−24 à +12 dB) et liste de pistes avec gain (−24 à +12 dB), pan (−1 à +1), mute ou solo. | Modifie uniquement les contrôles fournis sur le mix actif ; refuse une révision périmée, une piste inconnue ou une ancienne version. Préserve les clips, le routage et les réglages plugin ; n’ajoute pas de piste et ne rend pas l’audio. |
| `get_project_score` | `projectId`, `scoreId` facultatif (partition active par défaut) ; retourne le document de partition avec voix et notes. | Lecture seule ; liens symboliques refusés ; document JSON plafonné à 8 Mio. Ne modifie ni ne convertit la partition. |
| `export_project_audio` | `projectId`, `generationId`, `outputDirectory` dans le workspace MCP ; `fileName` WAV facultatif. Retourne le chemin, le nombre d’octets et les métadonnées audio. | Copie uniquement le WAV d’une génération publiée du profil actif, valide le fichier et refuse tout écrasement ; ne rend pas le mix et ne convertit pas les formats. |
| `create_project` | `title` (1 à 120 caractères) ; retourne le profil actif et la nouvelle fiche. | Crée les dossiers Song Maker et un `project.json` vide ; la bibliothèque de l’application récupère cette fiche depuis le disque. |
| `rename_project` | `projectId`, `title`, `expectedUpdatedAt` ; retourne la fiche actualisée. | Refuse les titres interdits et les lectures périmées ; seule la fiche projet est modifiée. |
| `update_project` | `projectId`, `expectedUpdatedAt` et champs facultatifs du formulaire (style, paroles, cot, langue, tempo, tonalité, métrique, durée, options). | Valide les valeurs selon le contrat du brouillon Song Maker, conserve les champs omis et refuse une fiche périmée. |
| `delete_project` | `projectId`, `expectedUpdatedAt`, `confirm=true`. | Supprime le dossier du projet après contrôle du profil actif, du type de dossier et de la révision ; retire ses titres de la Bibliothèque. Si ce nettoyage échoue, la réponse signale explicitement l’avertissement. |
| `list_library` | Aucun argument ; retourne les titres explicitement conservés, les playlists et la révision. | Lit `user-library.json` du profil actif ; les projets non sélectionnés ne sont pas ajoutés. |
| `create_playlist` | `title`, `expectedUpdatedAt` (nullable avant la première écriture). | Crée une playlist dans le fichier partagé avec l’application. |
| `delete_playlist` | `playlistId`, `expectedUpdatedAt`, `confirm=true`. | Retire la playlist et ses associations ; les titres restent dans la Bibliothèque. |
| `add_library_track` | `projectId`, `generationId`, `expectedUpdatedAt` (nullable pour la première écriture). | Inscrit uniquement une prise dont le WAV se trouve dans le projet du profil actif. |
| `remove_library_track` | `projectId`, `generationId`, `expectedUpdatedAt`, `confirm=true`. | Retire l’inscription de la Bibliothèque ; le projet et le WAV sont conservés. |
| `add_track_to_playlist` | `projectId`, `generationId`, `playlistId`, `expectedUpdatedAt`. | Associe un titre déjà présent dans la Bibliothèque à une playlist. |
| `remove_track_from_playlist` | `projectId`, `generationId`, `playlistId`, `expectedUpdatedAt`. | Retire l’association ; le titre reste dans la Bibliothèque. |
| `start_song` | `title` (1–120), `style` (1–4000), `lyrics` (0–4000), `outputDirectory`, `targetDurationSec` (30–360, défaut 180), `cot` (`full`/`melody`/`off`), `instrumentalMode`, `seed` (uint32), `creativeDirection` facultatif avec six champs de 240 caractères. Retourne un job ID et l’état initial. | Génère un WAV YuE2 dans le workspace autorisé. Vérifie l’opt-in de licence et les limites GPU. Une erreur de validation, de licence, de prérequis ou de capacité est retournée comme erreur MCP lisible. |
| `start_batch` | `batchFile` dans le workspace, `outputDirectory` requis hors `dryRun`, `dryRun`, `reviewBeforeNext` et `requireCreativeDirection` (les trois booléens ont des défauts sûrs). Retourne un rapport d’audit en simulation ou job ID et état initial en exécution. | `dryRun` n’utilise pas le GPU. L’exécution est séquentielle, refuse les demandes de parallélisme/retry non supportées et ne remplace pas les exports existants. |
| `job_status` | `jobId` UUID ; état, compteurs, fichiers terminés, erreurs, dossier de sortie, avertissements, revue audio et horodatages. | Lecture seule ; ne retourne pas les paroles. Le statut se récupère par interrogation. |
| `resume_job` | `jobId` UUID ; retourne l’état du job et les compteurs après demande de reprise/validation. | Autorise la génération suivante après arrêt de sécurité ou revue qualité. L’utilisateur doit écouter le WAV avant de confirmer une revue. |
| `cancel_job` | `jobId` UUID ; retourne l’état (`cancelling` ou terminal) et si l’annulation a été demandée. | Arrête le travail en cours et conserve les sorties déjà publiées. L’achèvement peut être coopératif ; consulter `job_status`. |

Les outils de génération exposent le progrès par `job_status` et les erreurs sous forme de message texte MCP. Ils n’émettent pas d’événements de progression. Les états de batch comprennent notamment `queued`, `running`, `paused_safety`, `paused_review`, `paused_quality`, `cancelling`, `completed`, `completed_with_errors`, `failed` et `cancelled`.

## Gaps d’acceptation restant

- Les outils de projet utilisent le profil et les fichiers du format Song Maker. Ils exposent les métadonnées des versions, le renommage d’une prise, l’activation d’une génération, d’une séparation, d’un mix sauvegardé ou d’une partition, ainsi que la lecture détaillée des documents.
- La Bibliothèque MCP couvre ses titres choisis et playlists ; l’import audio, les stems, les clips/routages/effets du mix, l’édition des notes MIDI et les réglages de modèles et ressources ne sont pas pilotables via MCP.
- Les états de job sont consultés par interrogation ; il n’y a pas de flux d’événements MCP ni de reprise de la file batch de l’application.
- Les tests du package vérifient le protocole et le runner local. Il reste à exercer les capacités annoncées depuis un vrai client MCP Windows et à retrouver un artefact dans l’application lorsqu’une intégration le promettra.

Voir aussi : [README du serveur MCP](../packages/mcp-server/README.md), [ticket #410](https://github.com/azerothl/song-maker/issues/410), [mode batch #368](https://github.com/azerothl/song-maker/issues/368), [hôte DeclUI #343](https://github.com/azerothl/song-maker/issues/343), [hôte VST3/AU #326](https://github.com/azerothl/song-maker/issues/326).
