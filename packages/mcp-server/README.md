# Song Maker MCP — génération locale YuE2 et ACE-Step

La couverture réelle du serveur par rapport aux parcours de l’application est suivie dans la [matrice de parité MCP](../../docs/mcp-capability-matrix.md). Les outils lisent et modifient les projets du profil actif ; la Bibliothèque MCP partage le même fichier `user-library.json` que l’application. La création, le renommage, les champs du formulaire, la suppression confirmée, l’import de fichiers audio ou d’une sortie de génération terminée dans un job, l’export audio et de stems déjà séparés, ainsi que la lecture des prises, mixes et partitions sont exposés. Le serveur peut créer ou relier une voix MIDI, éditer les notes en créant des versions, transcrire un fichier audio en MIDI avec BasicPitch ONNX, régler les contrôles de piste, l’arrangement et des chaînes d’effets DSP internes, puis rendre le mix avec le moteur partagé. La transcription dépose un fichier `.mid` dans le workspace ; si `projectId` et la révision `expectedUpdatedAt` sont fournis, elle enregistre aussi le score comme partition active du projet. Le rendu MCP n’exécute pas les inserts VST3 master ni les effets vocaux à consentement.

Ce serveur MCP permet à Codex de lancer YuE2 ou ACE-Step sur le GPU local sans démarrer l'application Tauri Song Maker. Il suit le moteur choisi dans le profil actif ; `engineId` permet une sélection explicite. YuE2 utilise `audiocpp_server` s’il est présent, avec repli sur `audiocpp_cli`. ACE-Step exige le serveur persistant et refuse tout repli CLI. Les poids ACE-Step doivent déjà être installés, et les avertissements requis doivent être acceptés dans le profil. **Le MCP ne fournit pas de GPU distant gratuit** : le calcul, les poids et le binaire audio.cpp doivent être présents sur la machine où il tourne.

## Lire les projets Song Maker

`list_projects` retourne les résumés du profil actif. `get_project` lit la fiche du projet demandé, y compris son style et ses paroles. `create_project` initialise un dossier et une fiche compatibles avec Song Maker. `rename_project`, `update_project` et `delete_project` exigent le `updatedAt` obtenu par une lecture récente afin de refuser une action fondée sur une fiche périmée. `update_project` n’écrit que les champs fournis et reprend les règles de validation du brouillon de l’application. `delete_project` exige aussi `confirm=true` ; il supprime le dossier du projet et retire ses titres de la Bibliothèque. Il ne supprime pas les fichiers d’autres projets.

`list_project_versions` liste les générations, séparations, sauvegardes de mix et versions de partition d’un projet, avec leurs métadonnées et les sélections actives. Il indique le WAV d’une génération par un chemin relatif au projet ; aucun contenu audio ni parole n’est lu. `rename_project_generation` modifie le nom d’une prise sans toucher au WAV et peut effacer son nom personnalisé. `use_project_generation` sélectionne une génération terminée après validation du WAV publié ; comme dans l’application, cette sélection efface la séparation et le mix actifs. `use_project_separation` active une séparation sauvegardée et son mix associé. `use_project_mix` choisit une version de mix sauvegardée et synchronise sa séparation lorsqu’elle est disponible. `use_project_score` choisit une partition sauvegardée. Ces écritures exigent la révision `updatedAt` courante et ne déclenchent ni génération ni séparation.

`get_project_mix` retourne le mix actif, ou la version `mix-vN` demandée, avec ses pistes, clips, réglages et arrangement, ainsi que `mixRevision`, `productionRevision` et les chaînes `effectsByTrack` prises en charge. Les chemins locaux de VST, les états propriétaires des plugins et les sources audio absolues ou hors du projet sont masqués. L’outil ne lit pas les fichiers audio.

`update_project_mix` modifie le gain master (−24 à +12 dB), les réglages de pistes (gain, pan, mute, solo), les cartes de tempo/métrique, les repères et les chaînes d’effets DSP internes (limiteur, compresseur, gate, EQ, EQ paramétrique, filtre, delay, reverb). Pour les effets, passe `effectsByTrack` et `productionRevision` de `get_project_mix` ; chaque liste remplace la chaîne de la piste et le serveur conserve le reste du fichier de production partagé avec l’application. Modifie les effets dans un appel distinct des niveaux ou clips. Les effets vocaux à consentement et les plugins VST3/AU ne sont pas sélectionnables via MCP. Pour les autres champs, passe `mixRevision` comme `expectedMixRevision` ; l’outil refuse une lecture périmée et n’écrit que dans le mix actif. `clipEdits` accepte jusqu’à 1 000 opérations typées : `move` (position), `trim` (offset source + durée), `fade`, `gain`, `processing`, `take_active` (comping), `cut` (scinde en deux clips) et `duplicate`. Les fondus doivent tenir dans la durée du clip ; les trims vérifient le WAV interne, son hash et la plage source. Les chemins et les octets audio ne sont pas éditables. Les scissions et duplications retournent leurs nouveaux identifiants dans `clipEditSummary`. Les cartes de tempo/métrique et repères prennent leur liste complète ; `markers: []` les retire. L’outil ne rend pas le mix.

`add_project_midi_track` relie au mix actif une voix qui existe déjà dans la partition active. Appelle `get_project_score` et `get_project_mix`, puis transmets `voiceId`, `scoreRevision` et `mixRevision` comme `expectedScoreRevision` et `expectedMixRevision`. L’identifiant et le nom de la piste correspondent à la voix MIDI et l’outil refuse les révisions périmées. Il ne crée ni note ni audio.

`create_project_midi_track` crée une voix vide et sa piste. Appelle `get_project_score` et `get_project_mix` pour fournir les révisions des documents déjà actifs ; dans un projet vierge, omets les révisions manquantes et le serveur initialise partition et mix comme le Studio. Passe une `idempotencyKey` stable et éventuellement un nom. La même clé permet de réessayer après une interruption sans créer de doublon. Une nouvelle version de partition est conservée ; si le mix change entre les deux écritures, la réponse indique que la voix est enregistrée mais reste à relier avec `add_project_midi_track`.

`get_project_score` retourne la partition active, ou la version `score-vN` demandée, avec ses voix, notes et une révision `scoreRevision`. Les chemins locaux de VST et leurs états propriétaires sont masqués. `edit_project_score` accepte jusqu’à 512 opérations d’ajout, modification ou suppression de notes MIDI sur la partition active. Passe `scoreRevision` comme `expectedScoreRevision` ; chaque appel crée une nouvelle version, met à jour la partition active et conserve les précédentes. Les voix et notes inconnues, les valeurs MIDI hors limites et les révisions périmées sont refusées.

`transcribe_audio_to_midi` exécute le script BasicPitch ONNX fourni avec Song Maker sur un fichier audio du workspace (256 Mio maximum), valide le MIDI avec le moteur de partition partagé, puis le publie dans `outputDirectory` sans écraser de fichier. Python 3.10+, `basic-pitch==0.4.0` et `onnxruntime` sont requis ; `SONG_MAKER_PYTHON` peut sélectionner l’interpréteur. La réponse contient le chemin MIDI, son hash, le nombre de notes et de pistes MIDI, le modèle et les avertissements de lecture. Pour enregistrer le résultat comme partition active d’un projet, passe `projectId` et `expectedUpdatedAt` lus depuis `get_project`. Si le projet change pendant la transcription, le MIDI reste exporté et `projectImport` retourne la raison pour laquelle la partition n’a pas été activée. La génération autonome d’une partition reste absente.

`export_project_audio` exporte l’audio d’une génération terminée vers un dossier du workspace MCP. `format` accepte `wav` (défaut), `flac` ou `mp3`. Le WAV conserve la source par défaut ; `bitDepth` accepte 16 ou 24 bits pour WAV/FLAC et `bitrateKbps` accepte 128, 192 ou 320 kbit/s pour MP3. `fileName`, s’il est fourni, doit avoir l’extension correspondant au format. Les conversions nécessitent FFmpeg ; le résultat est vérifié avant publication. L’outil retourne le chemin, la taille, les métadonnées de la source et les réglages d’export, puis refuse de remplacer un fichier déjà présent. Il n’exporte pas le mix actif.

`render_project_mix` rend le mix actif ou une version sauvegardée dans le workspace MCP avec le moteur offline partagé : position, durée, coupes, fades, gain, time-stretch/transposition des clips, niveaux, panoramique, mute/solo, automation, effets DSP intégrés, sidechain et bus/sends. Les clips doivent référencer des WAV PCM ou float32 mono/stéréo à la fréquence du mix, rester dans le dossier du projet et respecter leur hash enregistré. Un insert VST3 master actif n’est pas exécuté et fait échouer explicitement le rendu. Le traitement est borné à 256 Mio de sources, 512 Mio de mémoire estimée, 256 pistes, 256 bus et 10 000 clips actifs. Les sorties WAV acceptent 16/24 bits ; FLAC/MP3 requièrent FFmpeg. Le fichier final n’est jamais écrasé et une modification concurrente du mix annule la publication.

`export_project_stems` copie tout ou partie des WAV d’une séparation déjà terminée vers un dossier du workspace MCP. Passe le `separationId` retourné par `list_project_versions`; `roles` peut limiter l’export à `vocals`, `drums`, `bass`, `other`, `guitar` ou `piano`. L’outil vérifie le manifeste, les hashes, les fichiers audio et les chemins, puis refuse d’écraser un fichier existant. Il ne démarre pas de nouvelle séparation.

`import_project_audio_track` importe un WAV, MP3 ou FLAC depuis `SONG_MAKER_WORKSPACE_ROOT` dans une piste audio du mix actif. Appelle `get_project` et `get_project_mix` avant l’import et passe `updatedAt` et `mixRevision` pour protéger les modifications concurrentes ; si le projet n’a pas encore de mix, seul `updatedAt` est requis. L’outil conserve l’original, normalise une copie en WAV float32 stéréo 48 kHz avec FFmpeg/libsoxr, place le clip à `startMs`, peut mettre en sourdine les pistes existantes et retourne la durée, le SHA-256, la piste ajoutée et la nouvelle `mixRevision`. La source doit rester dans le workspace configuré et FFmpeg avec libsoxr doit être disponible. L’outil ne rend pas le mix.

`import_job_audio_track` relie un job de génération à un projet : attends `completed` ou `completed_with_errors` dans `job_status`, lis `get_project` et `get_project_mix`, puis passe `jobId`, `completedIndex` (0 par défaut), `projectId`, `updatedAt` et `mixRevision` courants. Le serveur importe la sortie WAV sélectionnée avec les mêmes contrôles et la même normalisation que `import_project_audio_track`, et retourne ses métadonnées de job avec le clip ajouté. La sortie doit encore se trouver dans le workspace MCP. Une génération en cours, un index absent ou une révision périmée est refusé.

`import_job_generation` importe cette même sortie WAV comme une prise dans l’historique du projet. Attends la fin du job, lis `get_project`, puis passe `jobId`, `completedIndex` (0 par défaut), `projectId` et l’`updatedAt` courant ; `name` est facultatif. Le WAV est copié et vérifié dans `generations/gen-N/audio.wav`, avec `request.json`, `result.json` et la provenance du job. La prise apparaît dans `list_project_versions`. La première génération importée devient active si le projet ne possède encore aucune génération, séparation ou mix actif, afin qu’elle soit immédiatement retrouvable dans Song Maker. Sur un projet déjà utilisé, les sélections et le mix restent inchangés ; une prise inactive peut être renommée ou sélectionnée avec `rename_project_generation` et `use_project_generation`. Le fichier source doit encore se trouver dans le dossier de sortie du job dans le workspace MCP. Les WAV invalides, trop volumineux, les jobs en cours et les révisions périmées sont refusés.

`list_library` ne prend aucun argument et retourne les titres choisis par l’utilisateur, les playlists et la révision `updatedAt`. `create_playlist` prend `title` et `expectedUpdatedAt` (nullable avant la première écriture), puis retourne la playlist et la nouvelle révision. `delete_playlist` prend `playlistId`, `expectedUpdatedAt` et `confirm: true` ; il retire la playlist et ses associations, mais garde les titres dans la Bibliothèque.

`add_library_track` prend `projectId`, `generationId` et `expectedUpdatedAt` ; il vérifie le WAV dans le projet du profil actif avant d’inscrire la prise. `remove_library_track` prend ces mêmes identifiants, la révision et `confirm: true` ; il ne supprime que l’inscription, jamais le projet ni son WAV. `add_track_to_playlist` et `remove_track_from_playlist` prennent `projectId`, `generationId`, `playlistId` et `expectedUpdatedAt` ; le premier associe un titre déjà conservé, le second retire uniquement l’association. Les outils d’écriture retournent l’état actualisé et sa révision. L’application et le serveur MCP partagent un verrou de fichier et rejettent les écritures faites depuis une révision périmée.

Le serveur lit le manifeste `profiles.json` et les fichiers `project.json` dans le même dossier de données que l’application. Il détecte les emplacements usuels de Documents ; si Song Maker utilise un dossier redirigé ou personnalisé, définis `SONG_MAKER_DOCUMENTS_DIR` dans l’environnement du serveur vers le dossier `Song Maker` qui contient `profiles.json` (ou le dossier historique `projects`). Les projets corrompus ou hors du profil actif sont ignorés dans la liste. Les paroles ne sont jamais incluses dans les résultats de `list_projects`.

`list_local_resources` lit les choix, consentements et ressources du profil actif. Il indique les composants manquants d’un pack YuE2 incomplet, vérifie le poids ACE-Step épinglé, distingue ACE-Step Turbo du runtime Python ACE-Step Lego et expose la disponibilité de génération par moteur. `mcpGenerationReady`, `mcpGenerationBlockers` et `mcpRuntimeMissing` suivent le moteur actif et ses contrôles de profil. `settingsRevision` est une empreinte des réglages du profil et des réglages généraux, sans exposer leur contenu. Le runtime MCP suit `binaryTag` pour chercher le CLI/serveur dans la version extraite du cache, y compris ses sous-dossiers par plateforme. L’inventaire reste en lecture seule et ne télécharge ni n’installe de ressources.

`activate_generation_settings` peut sélectionner pour l’application YuE2 Q4/Q8 ou ACE-Step Turbo déjà installé et autorisé. Il exige la révision `settingsRevision` courante ; Song Maker doit être fermé et `confirmAppClosed: true` fourni. Les téléchargements, installations et changements de licence ne sont pas exposés. `start_song` et `start_batch` utilisent par défaut le moteur actif du profil, ou acceptent `engineId: "yue2"` ou `"ace_step"`. `modelId: "q4"` ou `"q8"` ne concerne que YuE2. ACE-Step vérifie le poids complet, le serveur audio local et les acceptations de licence du profil ; aucun contournement par variable d’environnement ni repli CLI n’est prévu.

## Préparer le moteur

Node.js 20+, GPU NVIDIA compatible et les scripts de phase 0 sont requis. Sous Windows, depuis la racine du dépôt :

```powershell
cd scripts\phase0
.\download-binaries.cmd --windows
.\download-models.cmd --q4
.\verify-hashes.cmd
```

Ces scripts téléchargent le moteur et les poids dans `%LOCALAPPDATA%\song-maker` sans installer l'application `.exe`. Le serveur suit le modèle sélectionné dans les réglages Song Maker (Q4 ou Q8). Tu peux remplacer ce choix par `SONG_MAKER_MODEL=q4` ou `SONG_MAKER_MODEL=q8` dans l'environnement MCP ; le modèle doit être installé dans le cache configuré. Les poids YuE2 sont [CC BY-NC 4.0](https://huggingface.co/m-a-p/YuE2-3B/blob/main/LICENSE) : la génération est refusée si le profil actif n’a pas accepté la licence. Une configuration explicite `SONG_MAKER_YUE2_NONCOMMERCIAL=1` reste possible après lecture de la licence, pour un usage non commercial conforme à ses conditions.

Pour ACE-Step, installe d’abord ACE-Step 1.5 Turbo depuis Paramètres → Modèle dans Song Maker et accepte ses avertissements dans le profil concerné. Le MCP vérifie la taille complète du modèle et utilise `audiocpp_server` ; il ne télécharge pas les poids et n’ouvre pas la fenêtre d’acceptation. Il exige 12 Gio de VRAM libres avant le rendu.

## Protection du GPU

Le serveur exige une lecture valide des capteurs NVIDIA avant le lancement de chaque morceau et vérifie la température ainsi que la VRAM libre. Par défaut il interrompt le rendu si la température atteint **80 °C** et exige au moins **8 Gio libres en YuE2 Q4**, **12 Gio en YuE2 Q8 ou ACE-Step**. Pendant le rendu, la température est revérifiée toutes les 3 secondes. Une lecture de capteur qui échoue ponctuellement est signalée puis retentée; elle n'est pas assimilée à une surchauffe et ne tue pas le rendu. Un dépassement réellement mesuré arrête le processus et place le job en `paused_safety`; après refroidissement, `resume_job` reprend au morceau interrompu. `gpu_status` permet de contrôler les capteurs avant de lancer un lot.

Le seuil peut être abaissé avec `SONG_MAKER_GPU_MAX_TEMP_C` (65–85 °C). Le MCP ne modifie ni la limite de puissance ni les réglages du pilote. La protection thermique intégrée à la carte reste la dernière sécurité matérielle; garde aussi une bonne ventilation du boîtier.

Le moteur reçoit par défaut jusqu'à 8 threads CPU, ou le nombre de cœurs disponibles si la machine en a moins. Ajuste `SONG_MAKER_THREADS` (1–64) si tu veux limiter ou augmenter ce nombre.

## Composer un lot vraiment varié

Garde un socle commun dans `style` pour l'identité de l'album. Renseigne les six axes propres à chaque piste dans `creativeDirection` : `scene`, `groove`, `foreground`, `harmony`, `arrangement` et `motif` (240 caractères maximum par axe). Ils décrivent respectivement le moment, le mouvement, le timbre principal, la couleur harmonique, le déroulé et un motif mélodique propre. Ces précisions sont ajoutées au prompt envoyé à YuE2 ou ACE-Step par le serveur persistant.

```json
{
  "id": "01",
  "title": "Blue Hour Arrival",
  "style": "Instrumental classic jazz with restrained Japanese electric-jazz color; intimate hotel-lounge mix, no vocals.",
  "lyrics": "",
  "instrumentalMode": true,
  "creativeDirection": {
    "scene": "A guest enters at blue hour; the lobby feels spacious and unhurried.",
    "groove": "Lazy 6/8 sway with brushed snare and a soft, syncopated bass pulse.",
    "foreground": "Muted flugelhorn carries the theme; Rhodes answers only at phrase endings.",
    "harmony": "Open major ninths with a brief borrowed-minor turn before resolving.",
    "arrangement": "Begin with solo Rhodes, add bass after eight bars, save the brushes for the second theme.",
    "motif": "A descending three-note call returns in a different register near the ending."
  }
}
```

Avant de lancer un lot, appelle `start_batch` avec `dryRun: true` et son `batchFile`. Le bilan signale les directions manquantes, les formulations lexicalement proches et les axes répétés, sans utiliser le GPU. Les six axes sont exigés par défaut à la génération; les doublons exacts et les paires avec une proximité lexicale d’au moins 0,65 sont refusés. Passe `requireCreativeDirection: false` seulement pour un lot volontairement libre. L’analyse de similarité reste un indicateur textuel : elle ne reconnaît pas les mélodies ni ne juge l’audio.

`start_batch` attend par défaut une validation avant chaque prise suivante (`reviewBeforeNext: true`). Après un export, `job_status` expose `reviewRequired`, le titre, le numéro de prise, le chemin du WAV et les métriques audio. Écoute le morceau et vérifie le fichier avant d’appeler `resume_job` : cet appel valide la prise affichée et autorise la suivante. Avec `audiocpp_server`, le modèle reste chargé pendant la validation et se ferme après 15 minutes sans reprise; reprendre ensuite relance le worker. Les erreurs de génération ou de format, les plages quasi silencieuses d’au moins 3 secondes et le clipping déclenchent une pause `paused_quality`, même si la validation manuelle est désactivée. Les métriques couvrent le fichier par fenêtres de 250 ms espacées de 500 ms; une plage suspecte est une estimation à confirmer à l’écoute.

## Brancher Codex

Depuis la racine du dépôt, installe le serveur et compile son moteur de mix partagé :

```powershell
pnpm install --filter @song-maker/mcp-server...
pnpm --filter @song-maker/mix-production build
```

La compilation est nécessaire avant un lancement direct avec `node` ; les scripts `pnpm start` et `pnpm test` la déclenchent aussi. Ajoute ensuite ce serveur stdio à la configuration Codex, en adaptant les deux chemins absolus :

```toml
[mcp_servers.song_maker]
command = "node"
args = ["C:/chemin/song-maker/packages/mcp-server/src/server.mjs"]
cwd = "C:/chemin/song-maker"

[mcp_servers.song_maker.env]
SONG_MAKER_WORKSPACE_ROOT = "C:/chemin/nexus42"
SONG_MAKER_YUE2_NONCOMMERCIAL = "1"
```

Redémarre la session Codex pour charger les outils. `runtime_status` vérifie le moteur actif et ses fichiers. `start_song` lance un titre. `start_batch` audite le lot avec `dryRun: true`, puis retourne un identifiant de job au lancement. `job_status` suit les exports, les métriques de qualité, la piste en attente de validation et les éventuels échecs. Appelle `resume_job` après avoir vérifié le WAV pour valider la piste et autoriser la suivante; `cancel_job` arrête le job et conserve les pistes déjà exportées. Un verrou partagé empêche deux jobs de génération simultanés sur le GPU. Les fichiers terminés sont conservés si une chanson échoue et les exports existants ne sont jamais remplacés. ACE-Step et les instrumentaux YuE2 contrôlent la durée à ±250 ms; les titres chantés YuE2 qui privilégient les paroles peuvent dépasser la cible.

Le runner de lots prend en charge de 1 à 1 000 prises par titre, jusqu’à 10 000 prises au total, un seul flux GPU, la politique V1 `onError: continue` (valeur par défaut incluse) et aucune relance automatique. Les prises d’un titre utilisent des seeds distinctes, dérivées de sa seed de base avec retour modulo 2³². Les fichiers multi-prises portent un suffixe `Prise NN` et le statut distingue chaque prise. Il refuse les lots `onError: pause`, parallèles ou avec retry. Une erreur de génération interrompt également le lot avant la prise suivante pour permettre de la traiter. Si la protection thermique ou mémoire arrête un job, `resume_job` le reprend à la prise interrompue après refroidissement ou libération de VRAM.

Exemple pour Nexus : `batchFile = "mixes/rb-soul-chill/01/song-maker.batch.json"` et `outputDirectory = "mixes/rb-soul-chill/01/audio"`.

Les informations de chaque tâche sont conservées dans `.song-maker-mcp/jobs/` sous le workspace. Ajoute `.song-maker-mcp/` au `.gitignore` de ce workspace si nécessaire. Le serveur ne téléverse rien sur YouTube.
