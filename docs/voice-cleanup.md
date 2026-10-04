# Nettoyage de voix (insert piste)

Issue [#164](https://github.com/azerothl/song-maker/issues/164) — effets de voix sur piste. Suite [#337](https://github.com/azerothl/song-maker/issues/337).

## Décision v1

Débruitage **classique** (spectral soft-mask + plancher de bruit), sans réseau de neurones, dans `@song-maker/mix-production` (`voice_cleanup`).

| Aspect | Choix |
|---|---|
| Licence | Code Apache-2.0 in-repo — pas de GPL RubberBand |
| Emplacement | Ligne FX piste Production (`ProductionTrackFxLinePopin`) |
| Cible | Pistes vocales uniquement (comme `pitch_correct`) |
| Paramètres | `strength`, `noiseFloorDb`, `preserveAttack` |
| Bypass | Case « activé » de l’effet → signal original |
| Bake | Même chemin lecture / export (`TrackEffectsRack.process`) |
| Persistance | Overlay production (undo/historique #133) |

## Autotune / justesse

`pitch_correct` (issue [#83](https://github.com/azerothl/song-maker/issues/83), doc [`pitch-correct.md`](./pitch-correct.md)) est exposé comme insert FX vocal dans le même popover — lié au périmètre #164 étape 2.

## Conversion de voix (#337)

Insert `voice_convert` :

- Case de consentement « voix de l’utilisateur uniquement ».
- Enveloppe spectrale extraite d’un **WAV de référence de l’utilisateur**. Sans consentement : pass-through. Avec consentement **sans** enveloppe : erreur `VOICE_CONVERT_NO_REFERENCE` (pas de faux succès).
- **Pas un modèle neuronal** (pas de RVC / So-VITS). Qualité : correspondance de timbre limitée.

### Note juridique interne

Conversion **uniquement** vers / depuis la voix de l’utilisateur, après consentement explicite. Interdit : voix de tiers, artistes, clones. L’enveloppe extraite n’est pas un modèle commercialisable et n’autorise pas l’imitation d’une personne tierce.

Chemin prévu pour un futur ONNX : `cache/models/voice-convert/` — **aucun poids épinglé aujourd’hui**.

## Débruitage statistique (`voice_denoise`)

Insert distinct de `voice_cleanup` : MMSE / Wiener sur STFT, bruit estimé sur les trames calmes. **Pas un réseau**. Denoise neuronal (RNNoise, DeepFilterNet) : non livré.

## Reste à faire (checklist FR)

- [ ] Modèle neuronal de conversion utilisateur, gated par le consentement.
- [ ] Denoise neuronal opt-in, pins et licences.
- [x] Note juridique interne (voix utilisateur vs tiers).
- [x] Aucun bouton qui prétend inférer un modèle tant que le runtime n’en a pas.
