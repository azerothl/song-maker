# Capture à faible latence et prises

Issues [#93](https://github.com/azerothl/song-maker/issues/93) (v1 WebView), [#330](https://github.com/azerothl/song-maker/issues/330) (chemin natif), [#342](https://github.com/azerothl/song-maker/issues/342) (punch / prises).

## Décision actuelle

| Aspect | Choix |
|---|---|
| Moteur par défaut | **cpal** : WASAPI **partagé** (Windows), Core Audio (macOS), ALSA (Linux). Pas de getUserMedia. |
| Repli | WebView `MediaRecorder` + `AudioContext` si aucun périphérique natif, ou choix explicite. |
| Latence native | Estimation `2 × (buffer / sampleRate)` — **pas** une mesure boucle haut-parleur → micro. |
| WASAPI exclusif | **Non livré**. |
| ASIO | **Non livré** (pas de SDK Steinberg dans le dépôt). |
| Monitoring natif | Coupé en v1 (pas de graphe duplex matériel). Monitoring optionnel seulement sur le repli WebView. |
| Prises / punch / comping | Punch-in `startMs` dès la finalisation (1 ou N prises). Aimantation grille mix. Session `.wav` (natif) ou `.webm` (WebView). Comping v1 inchangé (inspecteur). |

## Limites

- Windows : chemin réel = WASAPI partagé via cpal. L’exclusif et ASIO restent un ticket ouvert (checklist #330).
- Linux : ALSA (souvent via PipeWire). JACK dédié non branché. Preuve cloud Linux = énumération + WAV de test, pas une interface audio studio.
- macOS : Core Audio ; **non mesuré** ici (comme le MIDI matériel).
- Punch : pas de monitoring mix pendant l’enregistrement natif ; pas de punch hardware (ASIO footswitch). Preuve Windows native hors CI cloud.

## Hors périmètre

Hôte VST3, monitoring DSP externe, driver ASIO.
