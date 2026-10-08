# `@song-maker/akasha-declui`

Phase **4** — intégration hôte Akasha / DeclUI ([spec §18.5](../../specs/SONG_MAKER_SPEC.md), #66).

## Contenu

- Descripteur d’API musique (`MUSIC_API_DESCRIPTOR`) distincte du TTS.
- Surfaces DeclUI (`DECL_UI_SURFACES`) avec phase propriétaire.
- `DesktopFirstAkashaHostBridge` — découverte HTTP réelle ; modes `desktop` | `connected` | `unavailable`.
- Protocole : [`docs/host-protocol.md`](./docs/host-protocol.md).
- Notes : [`docs/integration-notes.md`](./docs/integration-notes.md).

## Branchement

Le défaut reste **desktop** (zéro réseau).  
`enableHostMode({ hostOptIn: true, hostUrl })` appelle `GET /v1/host/discover`.  
Un **hôte DeclUI embarqué** (loopback 127.0.0.1) peut être démarré depuis Paramètres.  
Sans URL ou hôte injoignable → **`unavailable`** (jamais un faux « activé »).  
La génération phase 1 n’est pas altérée.

### Capacités de l’hôte embarqué

Dans cette version, l’hôte embarqué annonce et exécute seulement `list_projects`.
La génération (`generate_yue2`), la séparation (`separate_stems`), l’export
(`export_mix`) et l’application des styles (`apply_style_lora`) ne sont pas
exposés par cet hôte ; leurs appels sont refusés. Ils restent disponibles par
les parcours de bureau de Song Maker. Un hôte Akasha externe peut proposer ces
capacités séparément. L’interface ne le présente pas comme connecté à un hôte
musical complet lorsque ces capacités manquent.

## Tests

```bash
pnpm --filter @song-maker/akasha-declui test
```
