# Parcours SheetSage2 : audio → partition → YuE2

## Décision

La reprise d’un enregistrement ou d’un mixdown passe par une **partition symbolique** (ABC), pas par une réinjection de la forme d’onde. SheetSage2 propose l’ABC ; l’utilisateur la corrige et **confirme** ; seulement ensuite YuE2 génère une **nouvelle interprétation**.

Licence des poids SheetSage2 : **CC BY-NC 4.0** (`audio-cpp/SheetSage2-GGUF`, fichier `sheetsage2-orig.gguf`). Hors installeur.

## Ce qui est câblé (produit)

| Étape | État |
|---|---|
| Contrat TypeScript `@song-maker/sheetsage` | Câblé — readiness, progress/cancel types, gate YuE2 |
| Vérif licence / binaire / poids / disque | Câblé (sonde injectable) |
| Panneau UI (piste ou mixdown → transcribe → ABC éditable → confirmer) | Câblé |
| Appel YuE2 `start_generation` avec ABC confirmé | Câblé (chemin génération existant) |
| Disclaimer « nouvelle interprétation » + CC BY-NC | Câblé (UI + package) |

## Ce qui est stubbé (runtime externe absent)

| Étape | État |
|---|---|
| Téléchargement / installation SheetSage2 GGUF | Non livré — opt-in futur hors installeur |
| Câblage audio.cpp `--task midi --family sheetsage2` | Absent du serveur produit |
| `transcribeAudioToAbc` réel | **`not_implemented`** — n’invente jamais d’ABC |
| Vérif Windows E2E du parcours complet | À faire quand binaire + poids sont présents |

## Règles d’honnêteté

1. Aucun ABC fictif à partir de silence ou d’absence de runtime.
2. **Aucun appel YuE2** tant que l’utilisateur n’a pas confirmé la partition (`assertAbcConfirmedForYue2`).
3. La sortie YuE2 est une version distincte ; les fichiers source ne sont pas écrasés.
4. Afficher clairement que le chanteur, le timbre, l’arrangement et la forme d’onde d’origine ne sont pas garantis.

## Métadonnées poids (spec §19)

- Fichier : `sheetsage2-orig.gguf`
- Taille : 2 708 224 512 octets
- SHA-256 : `52bb5846c452037d39931aa8050885b6c751b9c7afcc8ef6d6d3067d241731a4`
- Q8 : explicitement non fiable côté amont

## Package

`packages/sheetsage` — `checkSheetsageReadiness`, `createSheetsageTranscriber`, `assertAbcConfirmedForYue2`.
