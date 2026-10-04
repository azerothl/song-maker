# Protocole hôte Akasha / DeclUI (`song-maker.host.v1`)

Référence pour une instance Akasha (ou DeclUI) qui expose Song Maker en mode hôte.

## Auth

- `Authorization: Bearer <token>` optionnel selon l’hôte
- Token client : Paramètres ou `SONG_MAKER_AKASHA_HOST_TOKEN`
- Opt-in client obligatoire — pas d’appel réseau si `hostOptIn=false`

## Endpoints

Base URL exemple : `https://akasha.example`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/host/discover` | Inscription / découverte |
| `POST` | `/v1/host/invoke` | Invoquer une capacité musique |

### `GET /v1/host/discover`

**200** :

```json
{
  "apiVersion": "song-maker.host.v1",
  "hostId": "akasha",
  "musicApi": {
    "id": "song-maker-music",
    "kind": "music",
    "version": 1,
    "capabilities": [
      "generate_yue2",
      "separate_stems",
      "export_mix",
      "list_projects",
      "apply_style_lora"
    ]
  },
  "declUiSurfaces": [
    { "id": "library", "declaration": "songmaker.library.v1" },
    { "id": "agent_panel", "declaration": "songmaker.agent_panel.v1" }
  ]
}
```

`kind` **doit** être `"music"` (jamais TTS sur cette surface).

Erreurs : `401/403` auth ; autre non-2xx → client passe en `unavailable`.

### `POST /v1/host/invoke`

Request :

```json
{
  "capability": "list_projects",
  "args": {},
  "permissionToken": "optional-host-permission"
}
```

Response **200** :

```json
{ "ok": true, "result": { "...": "..." } }
```

Erreurs typées (JSON, non-2xx ou `ok:false`) :

| errorCode | Sens |
|---|---|
| `auth_rejected` | Jeton / permission refusés |
| `capability_unknown` | Capacité non déclarée |
| `capability_denied` | Permission insuffisante |
| `api_version_mismatch` | Version d’API incompatible |
| `host_unreachable` | Transport / réseau |

## Cycle de vie (client)

1. `desktop` — défaut, zéro réseau  
2. Opt-in + discover → `connected` ou `unavailable`  
3. `invokeMusicCapability` seulement si `connected`  
4. `disableHostMode` / perte réseau → desktop ou rediscover via `resumeHostMode`

## Hôte embarqué Song Maker

Le desktop peut servir le même protocole sur `http://127.0.0.1:<port>` (opt-in Paramètres). Pas d’écoute hors loopback.

La génération YuE2 locale (Tauri / audiocpp) ne dépend pas de ce protocole.  
Aucun accès réseau hôte sans opt-in utilisateur.
