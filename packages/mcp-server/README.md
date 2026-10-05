# Song Maker MCP — YuE2 sans application desktop

Ce serveur MCP permet à Codex de lancer YuE2 sur le GPU local sans démarrer l'application Tauri Song Maker. Il utilise `audiocpp_server` quand le binaire est présent : le serveur est démarré une fois par lot et garde YuE2 chargé pour les morceaux suivants. Si ce binaire manque ou ne démarre pas, le runner reprend le chemin compatible `audiocpp_cli`. Les poids GGUF et le moteur viennent de la même [version épinglée](../../scripts/phase0/README.md). **Le MCP ne fournit pas de GPU distant gratuit** : le calcul, les poids et le binaire audio.cpp doivent être présents sur la machine où il tourne.

## Préparer le moteur

Node.js 20+, GPU NVIDIA compatible et les scripts de phase 0 sont requis. Sous Windows, depuis la racine du dépôt :

```powershell
cd scripts\phase0
.\download-binaries.cmd --windows
.\download-models.cmd --q8
.\verify-hashes.cmd
```

Ces scripts téléchargent le moteur et les poids dans `%LOCALAPPDATA%\song-maker` sans installer l'application `.exe`. Q4 fonctionne aussi si seuls ces poids sont présents. Les poids YuE2 sont [CC BY-NC 4.0](https://huggingface.co/m-a-p/YuE2-3B/blob/main/LICENSE) : ce serveur refuse la génération tant que `SONG_MAKER_YUE2_NONCOMMERCIAL=1` n'est pas défini. N'utilise cette option que pour un usage non commercial conforme à la licence.

## Protection du GPU

Le serveur exige `nvidia-smi` et vérifie la température ainsi que la VRAM libre avant chaque morceau. Par défaut il interrompt la génération à **80 °C** et exige au moins **8 Gio libres en Q4** ou **12 Gio en Q8**. La température est surveillée pendant le rendu, toutes les 3 secondes. En cas de dépassement ou si le capteur devient inaccessible, le processus audio est arrêté et le job passe à `paused_safety`; après refroidissement, `resume_job` reprend au morceau interrompu. `gpu_status` permet de contrôler les capteurs avant de lancer un lot.

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

Avant de lancer un lot, appelle `start_batch` avec `dryRun: true` et son `batchFile`. Le bilan signale les directions manquantes, les formulations lexicalement proches et les axes répétés, sans utiliser le GPU. Les six axes sont exigés par défaut à la génération et les prompts de direction identiques sont refusés; passe `requireCreativeDirection: false` seulement pour un lot volontairement libre. L’analyse de similarité reste un indicateur textuel : elle ne reconnaît pas les mélodies ni ne juge l’audio.

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

Redémarre la session Codex pour charger les outils. `runtime_status` vérifie les fichiers. `start_song` lance un titre. `start_batch` audite un lot avec `dryRun: true`, puis lance le même fichier avec `outputDirectory`; le job se met en pause pour laisser vérifier chaque WAV avant la piste suivante. `job_status` suit les exports, les métriques qualité, la piste en attente de validation et les éventuels échecs. Un verrou partagé empêche deux jobs de lancer YuE2 simultanément sur le GPU, y compris depuis deux appels MCP. Les fichiers terminés sont conservés si une chanson échoue. Le lot ne remplace jamais un fichier existant. La durée demandée (30 à 360 s) est indicative : YuE2 peut produire un morceau plus court ou plus long.

Le runner de lots prend en charge une prise par chanson, un seul flux GPU, la politique V1 `onError: continue` (valeur par défaut incluse) et aucune relance automatique. Il refuse les lots `onError: pause`, parallèles ou avec retry. Une erreur de génération interrompt également le lot avant la piste suivante pour permettre de la traiter. Si la protection thermique ou mémoire arrête un job, `resume_job` le reprend au morceau interrompu après refroidissement ou libération de VRAM.

Exemple pour Nexus : `batchFile = "mixes/rb-soul-chill/01/song-maker.batch.json"` et `outputDirectory = "mixes/rb-soul-chill/01/audio"`.

Les informations de chaque tâche sont conservées dans `.song-maker-mcp/jobs/` sous le workspace. Ajoute `.song-maker-mcp/` au `.gitignore` de ce workspace si nécessaire. Le serveur ne téléverse rien sur YouTube.
