# Studio : inserts VST3 et assistant conversationnel

État vérifié le 13 octobre 2026 sur Windows. Liens : [#454](https://github.com/azerothl/song-maker/issues/454), [#455](https://github.com/azerothl/song-maker/issues/455).

## Utilisation

- Ouvrir les réglages d’une piste : l’onglet **Effets** affiche la chaîne VST3. Le catalogue présente uniquement les effets audio compatibles. Les instruments VST3 restent dans le panneau d’instrument du piano roll.
- Ajouter un insert, régler ses paramètres ou ouvrir son éditeur, le désactiver, le déplacer dans la chaîne ou le retirer. Les réglages et l’état du plugin sont sauvegardés avec le mix.
- Les inserts des pistes audio et MIDI utilisent le moteur Windows persistant pendant la lecture. Le monitoring d’entrée en mode natif partagé peut utiliser la chaîne d’une piste équipée d’inserts ; la prise enregistrée reste sèche. Le mode exclusif n’active pas ce monitoring.
- Le rendu du mix et des pistes alignées contient désormais les instruments MIDI intégrés ou VST3, les inserts de piste et l’effet master. Un projet MIDI seul peut être exporté. L’option « Pistes séparées (WAV) » conserve sa fonction de copie des sources séparées ; l’export des pistes alignées est le parcours de rendu de l’arrangement.
- **Assistant de mix** ouvre une conversation dans l’espace Studio. Un beat régulier propose quatre mesures de grosse caisse, caisse claire et charleston ; une ligne de piano reprend les hauteurs et le rythme de la source choisie. Le tempo, la mesure, le nombre de notes et la source figurent dans l’aperçu.
- Une partition manuelle peut servir de mélodie. Lorsque plusieurs partitions ou pistes audio sont disponibles, choisir la source ; la transcription audio utilise BasicPitch ONNX avec Python 3.10+, `basic-pitch==0.4.0` et `onnxruntime`. Le script est embarqué dans l’exécutable. `SONG_MAKER_PYTHON` peut désigner un environnement Python déjà configuré.
- L’aperçu est audible sans sauvegarder le projet. **Appliquer** publie ensemble une version du mix, une version de partition si nécessaire et l’annulation. **Annuler la dernière application** reste disponible après navigation et redémarrage. Une modification manuelle ultérieure rend l’ancienne annulation indisponible afin de préserver cette modification.
- L’historique et les vingt dernières annulations sont locaux au projet. Les propositions de niveaux/panoramiques sont produites par le serveur de modèle configuré et vérifiées avant application ; aucune réponse du modèle n’exécute du code.

## Vérifications réalisées

| Vérification | Preuve |
| --- | --- |
| Audio MIDI réel dans Chromium | `scripts/verify-studio-midi-render.mts` : une seule voix liée au mix, beat de 8,075 s audible après la première mesure, insert appliqué, export audible, mute et arrêt des notes futures silencieux. Seul l’IPC natif est remplacé dans ce test. |
| Plugins installés | `scripts/verify-vst3-installed.py` : MixBox traite un signal stéréo ; changer Rack Input Volume modifie le résultat (différence RMS 0,02359). Odin2 produit un rendu MIDI audible (RMS 0,08449). Aucun plugin téléchargé. |
| Application Windows embarquée | Ouverture du projet isolé, ajout de MixBox depuis le catalogue filtré, désactivation de l’ancien insert, lecture dépassant la piste VST courte, puis export terminé dans le dossier choisi. WAV : 48 kHz, stéréo, 24 bits, 8,075 s, RMS 0,07338. |
| Assistant dans l’application | Piano proposé depuis les deux notes manuelles, application immédiate dans l’arrangement, nouvelle version de mix/score, historique restauré après redémarrage et annulation retirant la piste ajoutée. |
| Proposition de mix par le modèle local | Qwen `qwen3.5:2b` : baisse de 3 dB de la piste MIDI, application enregistrant le gain à −3 dB, puis annulation restaurant 0 dB. L’aperçu affiche les valeurs validées avant/après, pas une affirmation de modification du modèle. |
| Transcription depuis la conversation | Import du WAV synthétique A4 par le sélecteur Windows, choix de cette piste audio comme source, transcription BasicPitch ONNX, proposition et application d’une piste piano d’une note. La partition finale contient le beat, la voix manuelle et le piano ajouté ; la référence transcrite ne crée pas de quatrième voix audible. |
| Monitoring pendant la capture native | Entrée Microphone USB Audio CODEC, mode partagé et chaîne MixBox de la piste audio de test. Capture de 18 s avec retour activé, niveau d’entrée visible et aucune erreur affichée. Volume de sortie de l’insert abaissé pour cet essai ; prise jetée après l’arrêt. Cet essai ne mesure pas la latence physique et ne remplace pas une écoute humaine du retour. |
| Sauvegarde et erreurs | Test Rust de publication de mix/partition/annulation et d’échec forcé de sauvegarde : le projet conserve ses anciens pointeurs et son historique en cas d’échec. Actions et notes invalides rejetées. |

TR5 Classic EQ a pu être inspecté, mais a produit une sortie silencieuse hors bypass sur cette machine. Il n’est pas utilisé comme preuve d’un effet audible. MixBox et Odin2 constituent les preuves audio réelles.

Ces essais concernent une candidate avec interface embarquée, pas une release publique. La validation du ticket #454 sur une installation publiée reste à effectuer après intégration et publication. La mesure physique de latence WASAPI/punch (#330/#342) requiert toujours un câble de bouclage adapté et ne fait pas partie de ces preuves.

## Reproduire les vérifications

Depuis la racine du dépôt, avec les dépendances installées :

```powershell
npm run typecheck
npm run rust:test
npm run rust:clippy
npm test
pnpm -r --filter "./packages/**" run test
```

La CI de la PR vérifie aussi les packages et le site. Le passage complet du 13 octobre a terminé les 590 tests de l’application sans échec. Localement, 231 tests Rust ont réussi ; les deux tests nécessitant des services externes ont été ignorés.

Pour le rendu audio réel dans Chromium, démarrer `npm run dev` dans une autre fenêtre, puis :

```powershell
node --import tsx scripts/verify-studio-midi-render.mts
```

Pour vérifier les plugins déjà installés, construire la candidate puis fournir un dossier de résultats temporaire :

```powershell
npm run tauri build -- --debug --no-bundle
python scripts/verify-vst3-installed.py .\src-tauri\target\debug\song-maker.exe "$env:TEMP\song-maker-vst3-proof"
```

Ce dernier script attend MixBox et Odin2 dans `C:\Program Files\Common Files\VST3`. Il ne les installe pas et ne modifie pas leurs presets. La validation d’interface a utilisé un dossier de documents temporaire via `SONG_MAKER_DOCUMENTS_DIR`, sans modifier les projets personnels.
