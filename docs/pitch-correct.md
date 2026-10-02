# Correction de justesse vocale (optionnelle)

Issue [#83](https://github.com/azerothl/song-maker/issues/83). Également insert FX vocal pour [#164](https://github.com/azerothl/song-maker/issues/164) (étape autotune) — voir [`voice-cleanup.md`](./voice-cleanup.md).

## Décision

Correcteur **local** en TypeScript dans `@song-maker/mix-production` (`pitch_correct`), sans bibliothèque native Autotune / RubberBand / SoundTouch.

| Aspect | Choix |
|---|---|
| Licence | Code Apache-2.0 in-repo — compatible redistribution Song Maker |
| Cible | Stems / pistes `vocals` uniquement (UI) |
| Modes | Chromatique, ou tonalité + gamme majeur/mineur |
| Paramètres | Intensité, vitesse (lag), préservation formants (approximative) |
| Bypass | Case « activé » de l’effet → signal original |
| Bake | Même chemin lecture Web Audio / export (`bakeMixPcm`) |
| Persistance | Overlay production (`localStorage` par `mixId`), comme les autres FX |

## Qualité et limites

- Détection F0 AMDF + décalage par overlap-add — utile pour de **petites dérives**, pas un Autotune commercial.
- `formantPreserve` = shelf HF compensatoire, **pas** un verrouillage LPC des formants.
- Coût CPU : analyse par trames ~40 ms ; acceptable en offline bake ; pas de GPU.
- Écoute A/B recommandée avant export.

## Hors périmètre v1

SDK propriétaires, modèles ML de pitch, correction sur pistes non vocales, convolution formantique haute fidélité.
