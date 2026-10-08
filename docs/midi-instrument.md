# Instrument MIDI intégré (préécoute et enregistrement)

Issue [#96](https://github.com/azerothl/song-maker/issues/96).

## Décision

Instrument logiciel **intégré** en Web Audio (`src/lib/midiInstrument.ts`) : oscillateurs + filtre par défaut ; **banque SF2 choisie par l’utilisateur** (#329) pour le rendu interne. Aucune SF2 n’est bundlée (licence / taille). Sans fichier, ou si le parse échoue : oscillateurs. Les notes restent symboliques (`ScoreDocument` / export MIDI) ; le rendu audio n’écrase jamais le MIDI.

| Aspect | Choix |
|---|---|
| Licence moteur | Apache-2.0 in-repo (Song Maker) |
| Banque d’échantillons | Aucune bundlée. SF2 utilisateur optionnelle (`parseSf2`) |
| Parseur | RIFF `sfbk` : `smpl` 16-bit + presets/programmes. **Pas** un moteur SoundFont complet (modulateurs, envelopes AHDSR, chorus) |
| Programmes | Sans SF2 : piano, epiano, organ, bass, strings, lead, pad, pluck. Avec SF2 : presets bank/program du fichier |
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

Les instruments VST3 sous Windows sont pris en charge dans Production (PR #402 et #406) ; les éditeurs natifs et effets audio utilisent un hôte distinct. AU/macOS reste hors du périmètre.

## Sortie MIDI native (midir, #170 / #338)

Le piano roll envoie aussi vers un port **midir** (indépendant de Web MIDI) : Partition → Sortie MIDI.

| OS | Backend | Preuve dans ce dépôt |
|---|---|---|
| Windows | WinMM | GS Wavetable, 2026-10-01. USB matériel : **non vérifié**. |
| macOS | CoreMIDI | **Aucune** preuve Tauri / IAC. Compilé seulement. |
| Linux | ALSA | Compilé + test « liste des ports sans panic ». Pas de preuve jack/USB. |

« Non testé » n’est pas « non compilé ». L’UI affiche cette limite. Ne pas cocher macOS/Linux comme validés tant qu’un testeur n’a pas collé une preuve native.
