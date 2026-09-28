# Instrument MIDI intégré (préécoute et enregistrement)

Issue [#96](https://github.com/azerothl/song-maker/issues/96).

## Décision

Instrument logiciel **intégré** en Web Audio (`src/lib/midiInstrument.ts`) : oscillateurs + filtre, **sans banque SF2 tierce**. Les notes restent symboliques (`ScoreDocument` / export MIDI) ; le rendu audio n’écrase jamais le MIDI.

| Aspect | Choix |
|---|---|
| Licence moteur | Apache-2.0 in-repo (Song Maker) |
| Banque d’échantillons | Aucune — empreinte N/A |
| Programmes | piano, epiano, organ, bass, strings, lead, pad, pluck (formes d’onde) |
| Entrée | Web MIDI API (`navigator.requestMIDIAccess`) |
| Sortie | `AudioContext` → périphérique système (`outputDevice` affiché dans Paramètres) |
| Mute / solo / niveau | Panneau instrument (partition) |
| Latence | `audioLatencyMs` (défaut **20 ms**, réglable 0–200) |

## Latence documentée

| Plateforme | Budget typique | Notes |
|---|---|---|
| Windows (Tauri WebView2) | 20–40 ms | Lookahead synth + buffer navigateur ; monitoring MIDI possible |
| Linux / macOS (WebKit/Chromium) | 15–35 ms | Même chemin Web Audio |
| Hors ligne (pas d’AudioContext) | N/A | Préécoute indisponible ; édition MIDI OK |

Réglage : Paramètres → Système → Latence audio, ou panneau instrument sous le piano roll.

## Flux

1. Importer / dessiner une partition → **Lire** avec l’instrument choisi (sans YuE2).
2. Clavier MIDI → monitoring + **Enregistrer** (quantifié ou libre) → notes ajoutées à la voix active.
3. Export MIDI / ABC inchangés ; pas de remplacement des données d’origine par un WAV rendu.

## Hors périmètre

Plugins VST3 (ticket d’étude séparé). Soundfonts GM propriétaires.
