# Nettoyage de voix (insert piste)

Issue [#164](https://github.com/azerothl/song-maker/issues/164) — effets de voix sur piste.

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

## Conversion de voix (échafaudage)

Insert `voice_convert` : case de consentement « voix de l’utilisateur uniquement » (contrainte Loïc). **Aucun modèle de conversion n’est livré** ; sans consentement la conversion est refusée (pass-through) ; avec consentement, pass-through + message UI honnête.

## Hors périmètre v1

Modèles neuronaux de denoise, conversion vers voix de tiers, RubberBand GPL.
