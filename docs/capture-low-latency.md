# Capture à faible latence et prises

Issue [#93](https://github.com/azerothl/song-maker/issues/93).

## Décision v1

| Aspect | Choix |
|---|---|
| Moteur | WebView `MediaRecorder` + `AudioContext` (comme #41) |
| Latence | Affichage `baseLatency` + `outputLatency` ; compromis via `latencyHint` (`stable` / `balanced` / `low`) |
| Monitoring | Coupé par défaut ; délai optionnel = latence estimée (anti-décalage, pas anti-larsen magique) |
| Décompte | 0–10 s avant départ |
| Boucle | N sessions → une piste, N clips `takeGroupId` ; dernière prise active |
| Punch | Placement `startMs` = punch-in ; arrêt auto à (punch-out − punch-in) hors boucle |
| Comping | Sélection de prise dans l’inspecteur clips ; découpe pour régions ; originaux conservés |
| Urgence | Déconnexion / pause / arrêt : pas de piste mix corrompue (discard session) |

## Limites (Windows / Linux)

- Pas de WASAPI exclusif, ASIO, PipeWire ou JACK dans ce ticket — latence typique WebView souvent **> 10–40 ms**.
- Périphériques testés via `enumerateDevices` / `getUserMedia` dans le WebView Tauri.
- Calibration boucle complète (haut-parleur → micro) non instrumentée ; la compensation est une estimation.
- Chemin natif `cpal` envisageable plus tard derrière les mêmes commandes `user-audio/capture`.

## Hors périmètre

Hôte VST3, monitoring DSP externe.
