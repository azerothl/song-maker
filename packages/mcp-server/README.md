# Song Maker MCP — YuE2 sans application desktop

Ce serveur MCP permet à Codex de lancer YuE2 sur le GPU local sans démarrer l'application Tauri Song Maker. Il utilise le binaire `audiocpp_cli` et les poids GGUF de la même [version épinglée](../../scripts/phase0/README.md). **Le MCP ne fournit pas de GPU distant gratuit** : le calcul, les poids et le binaire audio.cpp doivent être présents sur la machine où il tourne.

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

Redémarre la session Codex pour charger les outils. `runtime_status` vérifie les fichiers. `start_song` lance un titre. `start_batch` prend le chemin d'un `song-maker.batch.json` dans le workspace et un dossier de sortie, puis retourne un identifiant. `job_status` suit l'avancement, la durée des WAV et les éventuels échecs par chanson. `cancel_job` arrête une génération en cours et conserve les pistes déjà exportées. Un verrou partagé empêche deux jobs de lancer YuE2 simultanément sur le GPU, y compris depuis deux appels MCP. Le lot ne remplace jamais un fichier existant. Comme dans l'application, les instrumentaux et les titres qui privilégient la durée reçoivent un budget fixe et leur WAV est contrôlé à ±250 ms; les titres chantés qui privilégient les paroles gardent une durée minimale et peuvent dépasser la cible.

Le runner de lots prend en charge une prise par chanson, un seul flux GPU, la politique V1 `onError: continue` (valeur par défaut incluse) et aucune relance automatique. Il refuse les lots `onError: pause`, parallèles ou avec retry. Les erreurs d’une chanson sont rapportées par `job_status`, puis le lot continue. Si la protection thermique ou mémoire arrête un job, `resume_job` le reprend au morceau interrompu après refroidissement ou libération de VRAM.

Exemple pour Nexus : `batchFile = "mixes/rb-soul-chill/01/song-maker.batch.json"` et `outputDirectory = "mixes/rb-soul-chill/01/audio"`.

Les informations de chaque tâche sont conservées dans `.song-maker-mcp/jobs/` sous le workspace. Ajoute `.song-maker-mcp/` au `.gitignore` de ce workspace si nécessaire. Le serveur ne téléverse rien sur YouTube.
