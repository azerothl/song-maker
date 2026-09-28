# Parcours SheetSage2 : audio → partition → YuE2

## Décision

La reprise d’un enregistrement ou d’un mixdown passe par une **partition symbolique** (ABC), pas par une réinjection de la forme d’onde. SheetSage2 propose l’ABC ; l’utilisateur la corrige et **confirme** ; seulement ensuite YuE2 génère une **nouvelle interprétation**.

Licence des poids SheetSage2 : **CC BY-NC 4.0** (`audio-cpp/SheetSage2-GGUF`, fichier `sheetsage2-orig.gguf`). Hors installeur.

## Ce qui est câblé (produit)

| Étape | État |
|---|---|
| Contrat TypeScript `@song-maker/sheetsage` | Câblé — readiness, progress/cancel types, gate YuE2 |
| Vérif licence / binaire / poids / disque | Câblé (sonde Tauri `sheetsage_probe`) |
| Runner live | Câblé — `audiocpp_cli --task midi --family sheetsage2` ou serveur `/v1/tasks/run` (modèle `sheetsage2` si GGUF présent) |
| Panneau UI (piste ou mixdown → transcribe → ABC éditable → confirmer) | Câblé |
| Annulation | Câblé (`sheetsage_cancel` + AbortSignal) |
| Appel YuE2 `start_generation` avec ABC confirmé | Câblé |
| Disclaimer « nouvelle interprétation » + CC BY-NC | Câblé (UI + package) |

## Prérequis runtime

1. Runtime audio.cpp épinglé (installeur) — serveur et/ou `audiocpp_cli`.
2. Poids opt-in hors installeur :
   - Chemin : `{cache}/models/SheetSage2-GGUF/sheetsage2-orig.gguf`
   - SHA-256 : `52bb5846c452037d39931aa8050885b6c751b9c7afcc8ef6d6d3067d241731a4`
   - Taille : 2 708 224 512 octets
3. Licence CC BY-NC acceptée dans le panneau.
4. Source audio avec chemin fichier réel (piste importée/enregistrée ; mixdown exporté).

## Règles d’honnêteté

1. Aucun ABC fictif à partir de silence ou d’absence de runtime.
2. **Aucun appel YuE2** tant que l’utilisateur n’a pas confirmé la partition (`assertAbcConfirmedForYue2`).
3. La sortie YuE2 est une version distincte ; les fichiers source ne sont pas écrasés.
4. Afficher clairement que le chanteur, le timbre, l’arrangement et la forme d’onde d’origine ne sont pas garantis.

## CLI de référence (audio.cpp)

```bash
audiocpp_cli --task midi --family sheetsage2 \
  --model models/SheetSage2-GGUF/sheetsage2-orig.gguf \
  --backend cuda --audio song.wav --out score.abc --log
```

## Package

`packages/sheetsage` — `checkSheetsageReadiness`, `createSheetsageTranscriber(probe, runner?)`, `assertAbcConfirmedForYue2`.
