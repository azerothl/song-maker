# Song Maker MCP — YuE2 sans application desktop

La couverture réelle du serveur par rapport aux parcours de l’application est suivie dans la [matrice de parité MCP](../../docs/mcp-capability-matrix.md). Les outils lisent et modifient les projets du profil actif ; la Bibliothèque MCP partage le même fichier `user-library.json` que l’application. La création, le renommage, les champs du formulaire, la suppression confirmée, l’export WAV d’une génération et la lecture des prises, mixes et partitions sont exposés. Le serveur peut relier au mix une voix déjà présente dans la partition active, éditer des notes MIDI en créant des versions et régler le gain master ou les contrôles de base des pistes ; il ne crée pas encore de voix MIDI, n’importe pas d’audio, ne rend pas le mix et n’exécute pas les effets.

Ce serveur MCP permet à Codex de lancer YuE2 sur le GPU local sans démarrer l'application Tauri Song Maker. Il utilise `audiocpp_server` quand le binaire est présent : le serveur est démarré une fois par lot et garde YuE2 chargé pour les morceaux suivants. Si ce binaire manque ou ne démarre pas, le runner reprend le chemin compatible `audiocpp_cli`. Les poids GGUF et le moteur viennent de la même [version épinglée](../../scripts/phase0/README.md). **Le MCP ne fournit pas de GPU distant gratuit** : le calcul, les poids et le binaire audio.cpp doivent être présents sur la machine où il tourne.

## Lire les projets Song Maker

`list_projects` retourne les résumés du profil actif. `get_project` lit la fiche du projet demandé, y compris son style et ses paroles. `create_project` initialise un dossier et une fiche compatibles avec Song Maker. `rename_project`, `update_project` et `delete_project` exigent le `updatedAt` obtenu par une lecture récente afin de refuser une action fondée sur une fiche périmée. `update_project` n’écrit que les champs fournis et reprend les règles de validation du brouillon de l’application. `delete_project` exige aussi `confirm=true` ; il supprime le dossier du projet et retire ses titres de la Bibliothèque. Il ne supprime pas les fichiers d’autres projets.

`list_project_versions` liste les générations, séparations, sauvegardes de mix et versions de partition d’un projet, avec leurs métadonnées et les sélections actives. Il indique le WAV d’une génération par un chemin relatif au projet ; aucun contenu audio ni parole n’est lu. `rename_project_generation` modifie le nom d’une prise sans toucher au WAV et peut effacer son nom personnalisé. `use_project_generation` sélectionne une génération terminée après validation du WAV publié ; comme dans l’application, cette sélection efface la séparation et le mix actifs. `use_project_separation` active une séparation sauvegardée et son mix associé. `use_project_mix` choisit une version de mix sauvegardée et synchronise sa séparation lorsqu’elle est disponible. `use_project_score` choisit une partition sauvegardée. Ces écritures exigent la révision `updatedAt` courante et ne déclenchent ni génération ni séparation.

`get_project_mix` retourne le mix actif, ou la version `mix-vN` demandée, avec ses pistes, clips, réglages et arrangement, ainsi qu’une révision `mixRevision`. Les chemins locaux de VST, les états propriétaires des plugins et les sources audio absolues ou hors du projet sont masqués. L’outil ne lit pas les fichiers audio.

`update_project_mix` modifie le gain master (−24 à +12 dB) et les réglages des pistes existantes (gain −24 à +12 dB, pan −1 à +1, mute et solo). Passe `mixRevision` comme `expectedMixRevision` ; l’outil refuse une lecture périmée et n’écrit que dans le mix actif. Il préserve les clips, routages et paramètres VST, n’ajoute pas de piste et ne produit pas de rendu.

`add_project_midi_track` relie au mix actif une voix qui existe déjà dans la partition active. Appelle `get_project_score` et `get_project_mix`, puis transmets `voiceId`, `scoreRevision` et `mixRevision` comme `expectedScoreRevision` et `expectedMixRevision`. L’identifiant et le nom de la piste correspondent à la voix MIDI et l’outil refuse les révisions périmées. Il ne crée ni note ni audio.

`create_project_midi_track` crée une voix vide et sa piste dans un projet ayant déjà une partition et un mix actifs. Appelle `get_project_score` et `get_project_mix`, puis passe leurs révisions, une `idempotencyKey` stable et éventuellement un nom. La même clé permet de réessayer après une interruption sans créer un doublon. Une nouvelle version de partition est conservée ; si le mix change entre les deux écritures, la réponse indique que la voix est enregistrée mais reste à relier avec `add_project_midi_track`.

`get_project_score` retourne la partition active, ou la version `score-vN` demandée, avec ses voix, notes et une révision `scoreRevision`. Les chemins locaux de VST et leurs états propriétaires sont masqués. `edit_project_score` accepte jusqu’à 512 opérations d’ajout, modification ou suppression de notes MIDI sur la partition active. Passe `scoreRevision` comme `expectedScoreRevision` ; chaque appel crée une nouvelle version, met à jour la partition active et conserve les précédentes. Les voix et notes inconnues, les valeurs MIDI hors limites et les révisions périmées sont refusées. La génération de partition et la conversion audio-vers-MIDI ne sont pas exposées.

`export_project_audio` copie le WAV d’une génération terminée vers un dossier du workspace MCP. Le fichier source doit appartenir au profil actif et être un WAV lisible ; l’outil valide son format, retourne ses métadonnées et refuse de remplacer un fichier déjà présent. Il n’exporte pas le mix actif et ne convertit pas en FLAC ou MP3.

`list_library` retourne uniquement les titres choisis par l’utilisateur et leurs playlists. Les modifications exigent la révision `updatedAt` retournée par le dernier appel. `add_library_track` vérifie la présence du WAV dans le profil actif ; `remove_library_track` ne supprime que l’entrée de Bibliothèque. Les suppressions de playlist et de titre requièrent `confirm=true`. L’application et le serveur MCP partagent un verrou de fichier et rejettent les écritures faites depuis une révision périmée.

Le serveur lit le manifeste `profiles.json` et les fichiers `project.json` dans le même dossier de données que l’application. Il détecte les emplacements usuels de Documents ; si Song Maker utilise un dossier redirigé ou personnalisé, définis `SONG_MAKER_DOCUMENTS_DIR` dans l’environnement du serveur vers le dossier `Song Maker` qui contient `profiles.json` (ou le dossier historique `projects`). Les projets corrompus ou hors du profil actif sont ignorés dans la liste. Les paroles ne sont jamais incluses dans les résultats de `list_projects`.

## Préparer le moteur

Node.js 20+, GPU NVIDIA compatible et les scripts de phase 0 sont requis. Sous Windows, depuis la racine du dépôt :

```powershell
cd scripts\phase0
.\download-binaries.cmd --windows
.\download-models.cmd --q4
.\verify-hashes.cmd
```

Ces scripts téléchargent le moteur et les poids dans `%LOCALAPPDATA%\song-maker` sans installer l'application `.exe`. Le serveur choisit Q4 par défaut, comme le réglage initial de Song Maker. Pour utiliser Q8, télécharge ce pack et définis `SONG_MAKER_MODEL=q8` dans l'environnement MCP; Q8 n'est jamais sélectionné automatiquement. Les poids YuE2 sont [CC BY-NC 4.0](https://huggingface.co/m-a-p/YuE2-3B/blob/main/LICENSE) : ce serveur refuse la génération tant que `SONG_MAKER_YUE2_NONCOMMERCIAL=1` n'est pas défini. N'utilise cette option que pour un usage non commercial conforme à la licence.

## Protection du GPU

Le serveur exige une lecture valide des capteurs NVIDIA avant le lancement de chaque morceau et vérifie la température ainsi que la VRAM libre. Par défaut il interrompt le rendu si la température mesurée atteint **80 °C** et exige au moins **8 Gio libres en Q4** ou **12 Gio en Q8**. Pendant le rendu, la température est revérifiée toutes les 3 secondes. Une lecture de capteur qui échoue ponctuellement est signalée puis retentée; elle n'est pas assimilée à une surchauffe et ne tue pas le rendu. Un dépassement réellement mesuré arrête le processus et place le job en `paused_safety`; après refroidissement, `resume_job` reprend au morceau interrompu. `gpu_status` permet de contrôler les capteurs avant de lancer un lot.

Le seuil peut être abaissé avec `SONG_MAKER_GPU_MAX_TEMP_C` (65–85 °C). Le MCP ne modifie ni la limite de puissance ni les réglages du pilote. La protection thermique intégrée à la carte reste la dernière sécurité matérielle; garde aussi une bonne ventilation du boîtier.

Le moteur reçoit par défaut jusqu'à 8 threads CPU, ou le nombre de cœurs disponibles si la machine en a moins. Ajuste `SONG_MAKER_THREADS` (1–64) si tu veux limiter ou augmenter ce nombre.

## Composer un lot vraiment varié

Garde un socle commun dans `style` pour l'identité de l'album. Renseigne les six axes propres à chaque piste dans `creativeDirection` : `scene`, `groove`, `foreground`, `harmony`, `arrangement` et `motif` (240 caractères maximum par axe). Ils décrivent respectivement le moment, le mouvement, le timbre principal, la couleur harmonique, le déroulé et un motif mélodique propre. Ces précisions sont ajoutées au prompt envoyé à YuE2 par le CLI et le serveur persistant.

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

`start_batch` attend par défaut une validation avant chaque piste suivante (`reviewBeforeNext: true`). Après un export, `job_status` expose `reviewRequired`, le chemin du WAV et les métriques audio. Écoute le morceau et vérifie le fichier avant d’appeler `resume_job` : cet appel valide le morceau affiché et autorise le suivant. Avec `audiocpp_server`, le modèle reste chargé pendant la validation et se ferme après 15 minutes sans reprise; reprendre ensuite relance le worker. Les erreurs de génération ou de format, les plages quasi silencieuses d’au moins 3 secondes et le clipping déclenchent une pause `paused_quality`, même si la validation manuelle est désactivée. Les métriques couvrent le fichier par fenêtres de 250 ms espacées de 500 ms; une plage suspecte est une estimation à confirmer à l’écoute.

## Brancher Codex

Depuis la racine du dépôt : `pnpm install --filter @song-maker/mcp-server...`. Ajoute ensuite ce serveur stdio à la configuration Codex, en adaptant les deux chemins absolus :

```toml
[mcp_servers.song_maker]
command = "node"
args = ["C:/chemin/song-maker/packages/mcp-server/src/server.mjs"]
cwd = "C:/chemin/song-maker"

[mcp_servers.song_maker.env]
SONG_MAKER_WORKSPACE_ROOT = "C:/chemin/nexus42"
SONG_MAKER_YUE2_NONCOMMERCIAL = "1"
```

Redémarre la session Codex pour charger les outils. `runtime_status` vérifie les fichiers. `start_song` lance un titre. `start_batch` audite le lot avec `dryRun: true`, puis retourne un identifiant de job au lancement. `job_status` suit les exports, les métriques de qualité, la piste en attente de validation et les éventuels échecs. Appelle `resume_job` après avoir vérifié le WAV pour valider la piste et autoriser la suivante; `cancel_job` arrête le job et conserve les pistes déjà exportées. Un verrou partagé empêche deux jobs de lancer YuE2 simultanément sur le GPU. Les fichiers terminés sont conservés si une chanson échoue et les exports existants ne sont jamais remplacés. Comme dans l’application, les instrumentaux et les titres qui privilégient la durée reçoivent un budget fixe et leur WAV est contrôlé à ±250 ms; les titres chantés qui privilégient les paroles peuvent dépasser la cible.

Le runner de lots prend en charge une prise par chanson, un seul flux GPU, la politique V1 `onError: continue` (valeur par défaut incluse) et aucune relance automatique. Il refuse les lots `onError: pause`, parallèles ou avec retry. Une erreur de génération interrompt également le lot avant la piste suivante pour permettre de la traiter. Si la protection thermique ou mémoire arrête un job, `resume_job` le reprend au morceau interrompu après refroidissement ou libération de VRAM.

Exemple pour Nexus : `batchFile = "mixes/rb-soul-chill/01/song-maker.batch.json"` et `outputDirectory = "mixes/rb-soul-chill/01/audio"`.

Les informations de chaque tâche sont conservées dans `.song-maker-mcp/jobs/` sous le workspace. Ajoute `.song-maker-mcp/` au `.gitignore` de ce workspace si nécessaire. Le serveur ne téléverse rien sur YouTube.
