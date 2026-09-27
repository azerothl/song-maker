# `@song-maker/akasha-declui`

Phase **4** — adaptateur hôte agentique desktop-first ([spec §18.5](../../specs/SONG_MAKER_SPEC.md)).

## Contenu

- Descripteur d’API musique (`MUSIC_API_DESCRIPTOR`) distincte du TTS.
- Surfaces DeclUI (`DECL_UI_SURFACES`) avec phase propriétaire.
- `DesktopFirstAkashaHostBridge` / `getSharedAkashaHostBridge()` — appelable depuis Paramètres « mode hôte ».
- Notes : [`docs/integration-notes.md`](./docs/integration-notes.md).

## Branchement

Le défaut reste **desktop**. `enableHostMode()` active un adaptateur local de découverte DeclUI sans processus distant ni SheetSage2. La génération phase 1 n’est pas altérée.

## Tests

```bash
pnpm --filter @song-maker/akasha-declui test
```
