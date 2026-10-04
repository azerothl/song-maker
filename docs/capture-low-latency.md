# Capture à faible latence et prises

Issues [#93](https://github.com/azerothl/song-maker/issues/93) (v1 WebView) et [#330](https://github.com/azerothl/song-maker/issues/330) (chemin natif).

## Décision actuelle

| Aspect | Choix |
|---|---|
| Moteur par défaut | **cpal** : WASAPI **partagé** (Windows), Core Audio (macOS), ALSA (Linux). Pas de getUserMedia. |
| Repli | WebView `MediaRecorder` + `AudioContext` si aucun périphérique natif, ou choix explicite. |
| Latence native | Estimation `2 × (buffer / sampleRate)` — **pas** une mesure boucle haut-parleur → micro. |
| WASAPI exclusif | **Non livré**. |
| ASIO | **Non livré** (pas de SDK Steinberg dans le dépôt). |
| Monitoring natif | Coupé en v1 (pas de graphe duplex matériel). Monitoring optionnel seulement sur le repli WebView. |
| Prises / punch / comping | Inchangés côté mix ; le fichier de session peut être `.wav` (natif) ou `.webm` (WebView). |

## Limites

- Windows : chemin réel = WASAPI partagé via cpal. L’exclusif et ASIO restent un ticket ouvert (checklist #330).
- Linux : ALSA (souvent via PipeWire). JACK dédié non branché. Preuve cloud Linux = énumération + WAV de test, pas une interface audio studio.
- macOS : Core Audio ; **non mesuré** ici (comme le MIDI matériel).
- Calibration boucle complète non instrumentée.

## Hors périmètre

Hôte VST3, monitoring DSP externe, driver ASIO.
