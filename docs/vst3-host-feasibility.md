# Étude de faisabilité — hôte VST3

**Issue :** [#326](https://github.com/azerothl/song-maker/issues/326)
**Dépendance :** [#93](https://github.com/azerothl/song-maker/issues/93) (moteur audio temps réel / capture basse latence)  
**Date :** 2026-09-28 ; état de la pile actualisé le 2026-10-09

## État actuel — 9 octobre 2026

Les PR #402 et #406 ont intégré l’hôte VST3 Windows dans Production : effets master rendus hors ligne pour aperçu et export, éditeurs natifs de plugins et instruments MIDI VST3. Les plugins ne sont pas redistribués par Song Maker. L’issue #326 reste ouverte pour la validation de bout en bout dans l’application Windows avec un plugin réel et pour les vérifications de persistance/packaging. AU/macOS et le monitoring VST3 en temps réel restent différés.

Les sections suivantes conservent l’étude de faisabilité et le statut antérieur à l’implémentation ; elles ne décrivent pas l’état courant du produit.
## Décision

**Historique :** le 6 octobre 2026, l’hôte VST3 Windows hors ligne a été priorisé. Cette première tranche a depuis été intégrée dans Production par les PR #402 et #406 ; l’état courant est résumé en tête de ce document. AU/macOS et le monitoring VST3 en temps réel restent différés.

Raisons principales :

1. La capture native cpal existe (#330/#342), mais elle ne partage pas un graphe DSP natif avec le lecteur et les effets.
2. La pile actuelle (Web Audio + bake offline TypeScript + MediaRecorder) **ne fournit pas** de callback audio hôte apte à charger des `.vst3`.
3. Le spike Windows sait scanner et charger une factory. Il ne traite pas l’audio et ne restaure pas un état de plugin : le critère « charger / jouer / restaurer » reste incomplet.
4. La spécification du premier build classait les plugins VST/AU comme **hors produit** (`specs/SONG_MAKER_SPEC.md` §4) ; ce périmètre est rouvert pour la tranche ci-dessus.
5. Les effets natifs de `@song-maker/mix-production` couvrent déjà le rack in-app (EQ, dynamique, réverb, etc.) pour le parcours générer → séparer → mixer.

L’hôte hors ligne intégré n’utilise pas un graphe DSP duplex : les plugins ne s’appliquent pas pendant l’enregistrement et ne sont pas lus en temps réel. Ces capacités restent dans le périmètre de #330/#342.

**Contrainte de livraison :** le contrôle d’expérimentation existant reste un diagnostic uniquement. Un contrôle produit ne pourra apparaître dans Production qu’avec le traitement hors ligne effectif, la persistance et l’aperçu/export branchés.

## Spike initial (#326, 2026-10-04) — scan seulement

Incrément derrière `SONG_MAKER_VST3_SPIKE=1` : scan de bundles `.vst3`, `dlopen` + `GetPluginFactory`, métadonnée d’insert sur une piste mix **ignorée par le bake**. Isolation crash via `song-maker --vst3-spike-probe` si le binaire Tauri est utilisé.

**Ce n’était pas** : callback audio, effet audible, AU ni isolation des traitements DSP. L’ancien panneau de diagnostic est masqué sans le flag et ne constitue pas l’interface produit.

L’hôte hors ligne a été intégré par #402 et #406. Les essais dans l’application Windows de développement ont couvert un effet Rustortion reconstruit avec un correctif amont, un instrument Odin2, la restauration des réglages, l’aperçu et un export WAV. Le Rustortion 0.3.0 publié échoue avant l’ouverture de son éditeur, sans fermer Song Maker. Il reste à refaire le parcours dans un build Windows publié avec des plugins stables, puis à écouter et comparer le rendu exporté.

## Stack audio actuelle (constat)

| Couche | Techno | Rôle | Prêt pour hôte VST3 ? |
|---|---|---|---|
| Shell | Tauri 2 | IPC, fichiers, spawn | Non |
| Lecture | Web Audio (`playback.ts`) | Transport stems / WAV | Soft RT navigateur, pas de graphe plugin |
| FX production | `mix-production` (TS, bake offline) | Écoute + export | Offline in-process |
| Capture | cpal natif, repli `getUserMedia` + MediaRecorder | Prises utilisateur | WASAPI partagé, sans graphe DSP duplex |
| Mix/export Rust | hound, ffmpeg/soxr | Mixdown / normalize | Offline |
| ML | audiocpp | Génération / stems / transcription | Pas un moteur device |

cpal est présent pour la capture. Pas de graphe hôte VST3, de JUCE, de PortAudio, d’ASIO ni de SDK VST3 intégré au produit.

## Comparaison d’options (Win + Linux, Tauri)

### Option A — Ne pas intégrer (rester FX natifs)

| | |
|---|---|
| **Idée** | Étendre `mix-production` (+ éventuel WASM) ; pas de plugins tiers. |
| **Plateformes** | Non retenue comme réponse au besoin VST3 exprimé. |
| **Coût** | Faible — déjà le chemin produit. |
| **Risques** | Catalogue FX limité vs un DAW ; pas d’écosystème tiers. |
| **Licence / distrib.** | Aucune licence Steinberg hôte. |
| **Maintenance** | Alignée sur le bake offline existant. |
| **Adéquation Tauri** | Sans objet pour l’hébergement de plugins tiers. |

### Option B — Hôte VST3 natif à côté de Tauri (SDK Steinberg / loader C++|Rust)

| | |
|---|---|
| **Idée** | Lancer un processus auxiliaire Windows, charger un effet VST3, traiter le mix hors ligne, puis réutiliser ce rendu pour l’aperçu et l’export. |
| **Plateformes** | VST3 Windows d’abord. AU pourra être ajouté avec une future version macOS. |
| **Coût** | Modéré à élevé — catalogue, paramètres, formats audio, stabilité des plugins, rendu et intégration export. |
| **Risques** | Compatibilité des plugins, latence de traitement, mémoire IPC, réglages non restaurés, sortie différente du mix sans validation réelle. |
| **Maintenance** | À mesurer sur une sélection de plugins Windows réels. Pas de graphe temps réel dans cette tranche. |
| **Adéquation Tauri** | Le WebView lance l’opération; le processus auxiliaire isole un plugin qui plante ou se bloque. |

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

## Hôte intégré — état des preuves

| Critère #100 | Statut ici |
|---|---|
| Scan et choix dans Production | **Intégrés par #402/#406** — parcours visuel vérifié dans l’application de développement ; build publié à vérifier. |
| Traitement d’un effet master hors ligne | **Intégré** — sous-processus isolé ; rendu et export réussis avec Rustortion reconstruit temporairement, sans écoute subjective revendiquée. |
| Préécoute et export | **Branchés sur le même rendu** — un export WAV a réussi ; écoute subjective et comparaison après réimport à vérifier. |
| Sauvegarde des réglages | **Paramètres et état d’éditeur persistés par mix** — restauration vérifiée après réouverture avec Rustortion reconstruit temporairement. |
| Windows load / play / restore | **Partiellement vérifié dans l’application de développement** — effet réel, instrument MIDI, réglages restaurés et échec d’ouverture isolé. Refaire les parcours dans un build publié avec des plugins stables et confirmer le comportement d’un plugin qui plante ou se bloque. |
| Voie Linux testée | **Limites documentées** : libs ALSA/JACK peuvent être présentes sur une machine de build, mais **sans** session PipeWire/GUI plugin, **sans** inventaire commercial de `.vst3` Linux, et **sans** moteur RT produit, un proto Linux ne vaudrait pas validation produit. Wine n’est **pas** une stratégie produit. |
| AU/macOS et effet pendant l’enregistrement | **Hors de cette tranche**. |

Les prochains essais doivent refaire le parcours dans un build Windows publié, écouter le mix et comparer l’aperçu au WAV exporté après réimport. Ils doivent aussi vérifier l’isolation d’un plugin qui plante ou se bloque. Le scan seul ne constitue pas une validation produit.

## Licence et distribution (points de vigilance)

- L’hôte utilise `vst3-host` 0.9.0 et son crate `vst3` 0.3.0; les notices et versions exactes doivent être auditées avant une version publique. Aucun bundle de plugin tiers ne sera redistribué par Song Maker.
- Hôte commercial / distribution desktop : vérifier les licences des plugins installés par l’utilisateur et conserver l’isolation hors du processus UI.
- JUCE : modèle de licence distinct (GPL vs commercial) à croiser avec le choix SDK.

## Public cible

Song Maker vise génération, séparation et mix assisté. Les effets natifs restent utiles, et la prise en charge des plugins tiers répond au besoin de personnalisation avancée exprimé pour Production.

## Prochaines étapes

1. Refaire le parcours avec un effet et un instrument VST3 stables dans un build Windows publié.
2. Comparer l’aperçu et l’export réimporté sur le même rendu, et consigner l’écoute réelle.
3. Vérifier dans ce build le comportement d’un plugin qui plante ou se bloque, puis confirmer la restauration de ses réglages.
4. Faire un audit final des dépendances, licences et packaging ; Song Maker ne redistribue pas les plugins.
5. Garder AU/macOS, monitoring pendant l’enregistrement et l’interface audio en étapes ultérieures (#330/#342).

## Synthèse

| Question | Réponse |
|---|---|
| Intégrer maintenant ? | **Oui, première tranche intégrée par #402 et #406** — hôte VST3 hors ligne sous Windows ; preuve produit suivie par #326. |
| Différer ? | AU sur macOS, monitoring temps réel et tests avec interface audio. |
| Ne pas intégrer ? | Non; le besoin d’effets tiers dans Production a été confirmé. |
| Livrable #326 | Hôte VST3 hors ligne + interface Production; issue ouverte jusqu’à validation Windows avec effet réel. |
