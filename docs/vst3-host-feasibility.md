# Étude de faisabilité — hôte VST3

**Issue :** [#326](https://github.com/azerothl/song-maker/issues/326)
**Dépendance :** [#93](https://github.com/azerothl/song-maker/issues/93) (moteur audio temps réel / capture basse latence)  
**Date :** 2026-09-28 ; état de la pile actualisé le 2026-10-05

## Décision

**Décision révisée le 6 octobre 2026 :** l’hôte VST3 passe en priorité. Première tranche : plugins VST3 Windows utilisés comme effets master, rendus hors ligne dans le mix, avec aperçu, export et réglages persistés. AU suivra avec une future version macOS. Cette fonctionnalité n’est pas encore livrée.

Raisons principales :

1. La capture native cpal existe (#330/#342), mais elle ne partage pas un graphe DSP natif avec le lecteur et les effets.
2. La pile actuelle (Web Audio + bake offline TypeScript + MediaRecorder) **ne fournit pas** de callback audio hôte apte à charger des `.vst3`.
3. Le spike Windows sait scanner et charger une factory. Il ne traite pas l’audio et ne restaure pas un état de plugin : le critère « charger / jouer / restaurer » reste incomplet.
4. La spécification du premier build classait les plugins VST/AU comme **hors produit** (`specs/SONG_MAKER_SPEC.md` §4) ; ce périmètre est rouvert pour la tranche ci-dessus.
5. Les effets natifs de `@song-maker/mix-production` couvrent déjà le rack in-app (EQ, dynamique, réverb, etc.) pour le parcours générer → séparer → mixer.

La capture native est désormais présente, mais le graphe DSP duplex requis reste à construire (#330/#342). La première tranche hors ligne ne dépend pas de la capture native ; elle ne livrera ni effets pendant l’enregistrement ni écoute temps réel des plugins.

**Contrainte de livraison :** le contrôle d’expérimentation existant reste un diagnostic uniquement. Un contrôle produit ne pourra apparaître dans Production qu’avec le traitement hors ligne effectif, la persistance et l’aperçu/export branchés.

## Spike initial (#326, 2026-10-04) — scan seulement

Incrément derrière `SONG_MAKER_VST3_SPIKE=1` : scan de bundles `.vst3`, `dlopen` + `GetPluginFactory`, métadonnée d’insert sur une piste mix **ignorée par le bake**. Isolation crash via `song-maker --vst3-spike-probe` si le binaire Tauri est utilisé.

**Ce n’était pas** : callback audio, effet audible, AU ni isolation des traitements DSP. L’ancien panneau de diagnostic est masqué sans le flag et ne constitue pas l’interface produit.

Un prototype d’hôte hors ligne est en cours sur la branche `codex/vst3-host-windows`. Il ajoute le scan et les réglages dans Production, le rendu isolé d’un effet master et le branchement de la préécoute et de l’export. Il n’a pas encore été testé dans l’application Windows avec un véritable effet VST3; il reste donc en cours et l’issue reste ouverte.

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

## Prototype isolé — état actuel

| Critère #100 | Statut ici |
|---|---|
| Scan et choix dans Production | **Implémentés localement** — pas encore vérifiés dans l’application Windows. |
| Traitement d’un effet master hors ligne | **Implémenté localement** — processus auxiliaire, paramètres normalisés et écrêtage de sécurité; pas encore essayé avec un plugin réel. |
| Préécoute et export | **Branchés localement** — même chemin de rendu dans Production et export; pas encore validés à l’écoute ni avec un export réimporté. |
| Sauvegarde des réglages | **Implémentée localement** — chemin, activation et paramètres par mix; restauration d’état interne propre au plugin non fournie. |
| Proto Windows load / play / restore | **En attente de preuve** — il faut charger un effet VST3 réel, modifier un réglage, relire, réouvrir le projet, préécouter et exporter. |
| Voie Linux testée | **Limites documentées** : libs ALSA/JACK peuvent être présentes sur une machine de build, mais **sans** session PipeWire/GUI plugin, **sans** inventaire commercial de `.vst3` Linux, et **sans** moteur RT produit, un proto Linux ne vaudrait pas validation produit. Wine n’est **pas** une stratégie produit. |
| AU/macOS et effet pendant l’enregistrement | **Hors de cette tranche**. |

Le prochain prototype doit traiter et restaurer l’état d’un effet master réel, s’intégrer à l’aperçu et à l’export du mix, et conserver une preuve Windows. Le scan et le chargement de factory ne suffisent pas.

## Licence et distribution (points de vigilance)

- L’hôte utilise `vst3-host` 0.9.0 et son crate `vst3` 0.3.0; les notices et versions exactes doivent être auditées avant une version publique. Aucun bundle de plugin tiers ne sera redistribué par Song Maker.
- Hôte commercial / distribution desktop : vérifier les licences des plugins installés par l’utilisateur et conserver l’isolation hors du processus UI.
- JUCE : modèle de licence distinct (GPL vs commercial) à croiser avec le choix SDK.

## Public cible

Song Maker vise génération, séparation et mix assisté. Les effets natifs restent utiles, et la prise en charge des plugins tiers répond au besoin de personnalisation avancée exprimé pour Production.

## Prochaines étapes

1. Vérifier les commandes et l’interface dans l’application Windows, avec au moins un effet VST3 sans accepter de licence de plugin à la place de l’utilisateur.
2. Confirmer que le paramètre choisi survit à la fermeture et à la réouverture du projet.
3. Comparer l’aperçu et l’export réimporté sur le même rendu et vérifier le comportement lors d’un plantage ou blocage du plugin.
4. Faire un audit final des dépendances, licences et packaging de la première version.
5. Garder AU/macOS, monitoring pendant l’enregistrement et l’interface audio en étapes ultérieures (#330/#342).

## Synthèse

| Question | Réponse |
|---|---|
| Intégrer maintenant ? | **Oui, première tranche en cours** — effet master VST3 hors ligne sur Windows. |
| Différer ? | AU sur macOS, monitoring temps réel et tests avec interface audio. |
| Ne pas intégrer ? | Non; le besoin d’effets tiers dans Production a été confirmé. |
| Livrable #326 | Hôte VST3 hors ligne + interface Production; issue ouverte jusqu’à validation Windows avec effet réel. |
