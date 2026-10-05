# Song Maker MCP — YuE2 sans application desktop

Ce serveur MCP permet à Codex de lancer YuE2 sur le GPU local sans démarrer l'application Tauri Song Maker. Il utilise le binaire `audiocpp_cli` et les poids GGUF de la même [version épinglée](../../scripts/phase0/README.md). **Le MCP ne fournit pas de GPU distant gratuit** : le calcul, les poids et le binaire audio.cpp doivent être présents sur la machine où il tourne.

## Préparer le moteur

Node.js 20+, GPU NVIDIA compatible et les scripts de phase 0 sont requis. Sous Windows, depuis la racine du dépôt :

```powershell
cd scripts\phase0
.\download-binaries.cmd --windows
.\download-models.cmd --q8
.\verify-hashes.cmd
```

Ces scripts téléchargent le moteur et les poids dans `%LOCALAPPDATA%\song-maker` sans installer l'application `.exe`. Q4 fonctionne aussi si seuls ces poids sont présents. Les poids YuE2 sont [CC BY-NC 4.0](https://huggingface.co/m-a-p/YuE2-3B/blob/main/LICENSE) : ce serveur refuse la génération tant que `SONG_MAKER_YUE2_NONCOMMERCIAL=1` n'est pas défini. N'utilise cette option que pour un usage non commercial conforme à la licence.

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

Redémarre la session Codex pour charger les outils. `runtime_status` vérifie les fichiers. `start_song` lance un titre. `start_batch` prend le chemin d'un `song-maker.batch.json` dans le workspace et un dossier de sortie, puis retourne un identifiant. `job_status` suit les exports WAV et les éventuels échecs par chanson. Un verrou partagé empêche deux jobs de lancer YuE2 simultanément sur le GPU, y compris depuis deux appels MCP. Les fichiers terminés sont conservés si une chanson échoue. Le lot ne remplace jamais un fichier existant. La durée demandée (30 à 360 s) est indicative : YuE2 peut produire un morceau plus court ou plus long.

Le runner de lots prend en charge une prise par chanson, un seul flux GPU, la politique V1 `onError: continue` (valeur par défaut incluse) et aucune relance automatique. Il refuse les lots `onError: pause`, parallèles ou avec retry, car il ne fournit pas de reprise ni de parallélisme. Les erreurs d’une chanson sont rapportées par `job_status`, puis le lot continue.

Exemple pour Nexus : `batchFile = "mixes/rb-soul-chill/01/song-maker.batch.json"` et `outputDirectory = "mixes/rb-soul-chill/01/audio"`.

Les informations de chaque tâche sont conservées dans `.song-maker-mcp/jobs/` sous le workspace. Ajoute `.song-maker-mcp/` au `.gitignore` de ce workspace si nécessaire. Le serveur ne téléverse rien sur YouTube.
