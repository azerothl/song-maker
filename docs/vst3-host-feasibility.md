# Étude de faisabilité — hôte VST3

**Issue :** [#100](https://github.com/azerothl/song-maker/issues/100)  
**Dépendance :** [#93](https://github.com/azerothl/song-maker/issues/93) (moteur audio temps réel / capture basse latence)  
**Date :** 2026-09-28

## Décision

**Différer** l’intégration d’un hôte VST3 tiers.

Raisons principales :

1. Le produit n’a **pas** encore choisi de moteur audio temps réel natif (#93 ouvert ; hors périmètre VST3 explicite).
2. La pile actuelle (Web Audio + bake offline TypeScript + MediaRecorder) **ne fournit pas** de callback audio hôte apte à charger des `.vst3`.
3. Le critère d’acceptation « prototype Windows : charger / jouer / restaurer » **n’est pas validable** dans l’environnement d’agent Linux cloud ; aucun prototype trompeur n’est livré.
4. La spécification produit classe encore les plugins VST/AU comme **hors produit** (`specs/SONG_MAKER_SPEC.md` §4).
5. Les effets natifs de `@song-maker/mix-production` couvrent déjà le rack in-app (EQ, dynamique, réverb, etc.) pour le parcours générer → séparer → mixer.

**Ne pas intégrer** reste l’issue probable si #93 reste centré WebView, ou si l’audience n’exige pas de plugins tiers. La décision sera **réévaluée** seulement après choix moteur (#93) **et** validation Windows dédiée.

**Contrainte produit :** aucun contrôle UI VST3 n’est présenté comme disponible.

## Spike #326 (2026-10-04) — pas un hôte

Incrément derrière `SONG_MAKER_VST3_SPIKE=1` : scan de bundles `.vst3`, `dlopen` + `GetPluginFactory`, métadonnée d’insert sur une piste mix **ignorée par le bake**. Isolation crash via `song-maker --vst3-spike-probe` si le binaire Tauri est utilisé.

**Ce n’est pas** : callback audio, éditeur de plugin, AU, sandbox produit, rack « VST disponible ». Sans le flag, l’UI spike est absente.

La décision « différer l’hôte » ci-dessus reste la vérité produit.

## Stack audio actuelle (constat)

| Couche | Techno | Rôle | Prêt pour hôte VST3 ? |
|---|---|---|---|
| Shell | Tauri 2 | IPC, fichiers, spawn | Non |
| Lecture | Web Audio (`playback.ts`) | Transport stems / WAV | Soft RT navigateur, pas de graphe plugin |
| FX production | `mix-production` (TS, bake offline) | Écoute + export | Offline in-process |
| Capture | `getUserMedia` + MediaRecorder | Prises utilisateur | Latence WebView documentée |
| Mix/export Rust | hound, ffmpeg/soxr | Mixdown / normalize | Offline |
| ML | audiocpp | Génération / stems / transcription | Pas un moteur device |

Pas de `cpal`, JUCE, PortAudio, ASIO ni SDK VST3 dans le dépôt.

## Comparaison d’options (Win + Linux, Tauri)

### Option A — Ne pas intégrer (rester FX natifs)

| | |
|---|---|
| **Idée** | Étendre `mix-production` (+ éventuel WASM) ; pas de plugins tiers. |
| **Plateformes** | Identiques au desktop actuel (Win/Linux via Tauri/WebView). |
| **Coût** | Faible — déjà le chemin produit. |
| **Risques** | Catalogue FX limité vs un DAW ; pas d’écosystème tiers. |
| **Licence / distrib.** | Aucune licence Steinberg hôte. |
| **Maintenance** | Alignée sur le bake offline existant. |
| **Adéquation Tauri** | Excellente (pas de processus RT natif supplémentaire). |

### Option B — Hôte VST3 natif à côté de Tauri (SDK Steinberg / loader C++|Rust)

| | |
|---|---|
| **Idée** | Processus ou `cdylib` : callback WASAPI/ASIO (Win) + JACK/ALSA/PipeWire (Linux) ; scan, load, process, state chunk ; UI plugin via fenêtres natives. WebView pour le non-RT. |
| **Réfs** | [steinbergmedia/vst3sdk](https://github.com/steinbergmedia/vst3sdk) (SDK VST3 ; historique dual GPL/propriétaire, évolutions vers licences plus permissives signalées côté communauté — **vérifier la licence SDK ciblée avant adoption**), exemples d’hôte minimal C++ ([SO](https://stackoverflow.com/questions/24478173/build-a-minimal-vst3-host-in-c)), crate exploratoire [plugin_host](https://crates.io/crates/plugin_host) (Rust, maturité à auditer). |
| **Plateformes** | Win prioritaire pour l’écosystème ; Linux possible mais inventaire `.so` / GUI X11-Wayland plus fragile. |
| **Coût** | Élevé — nouveau sous-système (devices, scan, sandbox crash, presets, automation, CI dual-OS). |
| **Risques** | Plugins instables qui plantent l’hôte ; latence et sync avec le modèle offline actuel ; divergence écoute live vs bake ; surface licence/distribution. |
| **Maintenance** | Lourde (compat plugins, OS audio, GUI embedding). |
| **Adéquation Tauri** | Possible en **sidecar** isolé, pas « dans » le WebView. Bloqué tant que #93 n’a pas choisi l’API device. |

### Option C — Moteur embarqué type JUCE (ou équivalent) en sous-processus

| | |
|---|---|
| **Idée** | Réutiliser les helpers d’hôte JUCE (scan, editor, state) dans un binary dédié piloté par Tauri. |
| **Réfs** | [JUCE Plugin Host](https://forum.juce.com/) / tutoriels d’hôte ; questions licence JUCE + VST3 ([forum](https://forum.juce.com/t/juce-gpl-and-vst-sdk-license-mystery/14935)). |
| **Plateformes** | Win + Linux supportés par JUCE ; GUI Linux plus exigeante. |
| **Coût** | Élevé (binaire, licences JUCE selon modèle, intégration IPC). |
| **Risques** | Taille binaire, licences croisées, même dépendance #93 pour le device layer. |
| **Maintenance** | Élevée mais plus « batteries included » que l’option B from-scratch. |
| **Adéquation Tauri** | Sous-processus + protocole IPC ; WebView reste non-RT. |

### Pistes adjacentes (non retenues pour MVP)

- **CLAP-first** ([free-audio/clap-host](https://github.com/free-audio/clap-host)) : hôte de référence utile, mais ne remplace pas la demande VST3 du ticket et n’élimine pas #93.
- **Déléguer à un DAW externe** (Reaper, Carla…) : hors produit Song Maker ; utile comme contournement utilisateur, pas comme feature in-app.

## Prototype isolé — limites documentées

| Critère #100 | Statut ici |
|---|---|
| Proto Windows load / play / restore | **Non réalisé** — agent Linux uniquement ; pas de runner Windows ni SDK/hôte VST3 dans le dépôt. |
| Voie Linux testée | **Limites documentées** : libs ALSA/JACK peuvent être présentes sur une machine de build, mais **sans** session PipeWire/GUI plugin, **sans** inventaire commercial de `.vst3` Linux, et **sans** moteur RT produit, un proto Linux ne vaudrait pas validation produit. Wine n’est **pas** une stratégie produit. |
| UI VST3 « disponible » | **Absente** — à conserver jusqu’à validation réelle. |

Un proto ultérieur ne doit démarrer que si : (1) #93 livre un chemin RT natif Windows, (2) le spec réouvre VST/AU, (3) un runner Windows dédié existe hors CI cloud Linux.

## Licence et distribution (points de vigilance)

- SDK VST3 Steinberg : historiquement dual (GPL / propriétaire) ; des discussions récentes évoquent une évolution plus permissive — **auditer la version exacte** et les obligations de marque/notice avant toute intégration ([dépôt SDK](https://github.com/steinbergmedia/vst3sdk)).
- Hôte commercial / distribution desktop : vérifier accords Steinberg, notices, et politiques de sandbox des plugins tiers (crash isolation recommandée hors process UI).
- JUCE : modèle de licence distinct (GPL vs commercial) à croiser avec le choix SDK.

## Public cible

Song Maker vise génération + séparation + mix assisté, pas un DAW généraliste. Les FX natifs + presets (#77/#78) et le copilote de production (#97) adressent le besoin immédiat sans écosystème plugin. L’utilité VST3 tiers reste **spéculative** face au coût.

## Prochaines étapes (si réouverture)

1. Trancher #93 (API device Win+Linux, buffers, monitoring).
2. Si moteur natif retenu : spike Windows isolé (charge + process + state restore d’un plugin de test, hors UI produit).
3. Documenter isolation crash, scan, presets, automation, sauvegarde projet.
4. Mettre à jour le spec (retirer VST/AU du hors-produit **seulement** après spike vert).
5. Sinon : clore définitivement en **ne pas intégrer**.

## Synthèse

| Question | Réponse |
|---|---|
| Intégrer maintenant ? | **Non** |
| Différer ? | **Oui** (décision retenue) |
| Ne pas intégrer ? | Option finale probable si #93 reste WebView-centric |
| Livrable #100 | Cette étude + comparaison A/B/C ; proto Windows reporté |
