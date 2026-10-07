# Capture à faible latence et prises

Issues [#93](https://github.com/azerothl/song-maker/issues/93) (v1 WebView), [#330](https://github.com/azerothl/song-maker/issues/330) (chemin natif), [#342](https://github.com/azerothl/song-maker/issues/342) (punch / prises).

## Décision actuelle

| Aspect | Choix |
|---|---|
| Moteur par défaut | **cpal** : WASAPI **partagé** (Windows), Core Audio (macOS), ALSA (Linux). Pas de getUserMedia. |
| Windows, accès direct | Choix WASAPI exclusif par périphérique. PCM 16 bits à 48, 44,1, 96, 32 ou 16 kHz selon l’entrée ; si aucun format n’est accepté ou que l’entrée est occupée, repasser en mode partagé. |
| Repli | WebView `MediaRecorder` + `AudioContext` si aucun périphérique natif, ou choix explicite. |
| Latence native | Estimation `2 × (buffer / sampleRate)` — **pas** une mesure boucle haut-parleur → micro. |
| WASAPI exclusif | Disponible pour les périphériques reconnus par WASAPI et acceptant un format PCM compatible. Aucun repli silencieux : les erreurs invitent à repasser en mode partagé. |
| ASIO | **Non livré** (pas de SDK Steinberg dans le dépôt). |
| Monitoring natif | Coupé en v1 (pas de graphe duplex matériel). Monitoring optionnel seulement sur le repli WebView. |
| Prises / punch / comping | Punch-in `startMs` dès la finalisation (1 ou N prises). Aimantation grille mix. Session `.wav` (natif) ou `.webm` (WebView). Comping v1 inchangé (inspecteur). |

## Limites

- Windows : le mode partagé passe par cpal ; le mode exclusif ouvre l’endpoint WASAPI sélectionné. ASIO n’est pas livré. La correspondance des endpoints dépend de leur nom exposé par Windows ; les appareils homonymes restent à vérifier sur du matériel réel.
- Le délai présenté reste une estimation liée au tampon actif, pas une mesure matérielle aller-retour. Pas de validation de latence revendiquée sans boucle entrée-sortie mesurée.
- Linux : ALSA (souvent via PipeWire). JACK dédié non branché. Preuve cloud Linux = énumération + WAV de test, pas une interface audio studio.
- macOS : Core Audio ; **non mesuré** ici (comme le MIDI matériel).
- Punch : pas de monitoring mix pendant l’enregistrement natif ; pas de punch hardware (ASIO footswitch). Preuve Windows native hors CI cloud.

## Hors périmètre

Hôte VST3, monitoring DSP externe, driver ASIO.
