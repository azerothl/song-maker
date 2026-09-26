# `@song-maker/akasha-declui`

Phase **4** — stub d’intégration hôte agentique ([spec §18.5](../../specs/SONG_MAKER_SPEC.md)).

## Contenu

- Descripteur d’API musique (`MUSIC_API_DESCRIPTOR`) distincte du TTS.
- Surfaces DeclUI (`DECL_UI_SURFACES`) avec phase propriétaire.
- `StubAkashaHostBridge` — `describe()` OK, `register()` lève.
- Notes : [`docs/integration-notes.md`](./docs/integration-notes.md).

## Branchement après phase 1–2

Le desktop phase 1 ne charge pas ce paquet. Phase 4 l’enregistre auprès d’Akasha et réutilise `@song-maker/lora-packs` pour le catalogue.

## Tests

```bash
pnpm --filter @song-maker/akasha-declui test
```
