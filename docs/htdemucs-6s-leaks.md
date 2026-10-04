# HTDemucs 6 stems — fuites piano (#344)

Le modèle 6 stems **n’a pas été réentraîné**. Licence et case opt-in inchangées.

## Mesure (synthétique, reproductible)

Test `packages/stem-providers/src/pianoBleed.test.ts` :

| Condition | Signal | Résultat |
|---|---|---|
| Avant | Stem « batterie » = 440 Hz (fuite piano 0,18) + bruit | énergie 440 Hz de référence |
| Après masque Wiener vs stem piano 440 Hz | même stem | énergie 440 Hz **&lt; 70 %** de l’avant |

Ce n’est **pas** une écoute sur un morceau réel piano-heavy. Voix / batterie réelles : non mesurées ici.

## Traitement

Masque spectral : `other / (other + 0,85 × piano)` sur STFT, appliqué aux stems non-piano après `demucs-onnx`. Le stem **piano** est inchangé.

## UI

6 stems **déconseillé** piano-heavy. Recommandation inchangée : HTDemucs 4 stems pour mix/batterie.
