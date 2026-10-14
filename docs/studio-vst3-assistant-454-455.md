# Studio : inserts VST3 et assistant conversationnel

État vérifié le 13 octobre 2026 sur Windows. Liens : [#454](https://github.com/azerothl/song-maker/issues/454), [#455](https://github.com/azerothl/song-maker/issues/455).

## Utilisation

- Ouvrir les réglages d’une piste : l’onglet **Effets** affiche la chaîne VST3. Le catalogue présente uniquement les effets audio compatibles. Les instruments VST3 restent dans le panneau d’instrument du piano roll.
- Pour une piste MIDI, **Choisir un instrument VST3** dans les réglages de piste ouvre directement l’onglet **Plug-in** du piano roll, déploie l’inspecteur et met le sélecteur à portée. Le catalogue se charge automatiquement ; **Rechercher les instruments installés** permet de l’actualiser.
- Ajouter un insert, régler ses paramètres ou ouvrir son éditeur, le désactiver, le déplacer dans la chaîne ou le retirer. Les réglages et l’état du plugin sont sauvegardés avec le mix.
- Les inserts des pistes audio et MIDI utilisent le moteur Windows persistant pendant la lecture. Le monitoring d’entrée en mode natif partagé peut utiliser la chaîne d’une piste équipée d’inserts ; la prise enregistrée reste sèche. Le mode exclusif n’active pas ce monitoring.
- Le rendu du mix et des pistes alignées contient désormais les instruments MIDI intégrés ou VST3, les inserts de piste et l’effet master. Un projet MIDI seul peut être exporté. L’option « Pistes séparées (WAV) » conserve sa fonction de copie des sources séparées ; l’export des pistes alignées est le parcours de rendu de l’arrangement.
- **Assistant de mix** ouvre une conversation dans l’espace Studio. Un beat régulier propose quatre mesures de grosse caisse, caisse claire et charleston ; une ligne de piano reprend les hauteurs et le rythme de la source choisie. Le tempo, la mesure, le nombre de notes et la source figurent dans l’aperçu.
- Une partition manuelle peut servir de mélodie. Lorsque plusieurs partitions ou pistes audio sont disponibles, choisir la source ; la transcription audio utilise BasicPitch ONNX avec Python 3.10+. Au premier usage, l’application prépare `tools/basicpitch-onnx-v1` dans son cache et installe BasicPitch 0.4.0 sans ses dépendances TensorFlow, puis le runtime ONNX et les bibliothèques audio. Les scripts sont embarqués dans l’exécutable. `SONG_MAKER_PYTHON` peut choisir le Python qui crée cet environnement ; les paquets du Python système ne sont pas modifiés. Une connexion Internet est nécessaire pour cette première préparation, puis la détection fonctionne hors ligne.
- **Détecter les notes** ouvre un aperçu avec trois modes (voix solo, basse, instrument avec accords), trois sensibilités, une plage de hauteurs et une durée minimale. Les clips actifs sont assemblés avec leurs découpes, positions, fondus, gains de clip, étirement et transposition, avant les effets de piste/master. On peut analyser un seul clip. Les notes gardent leur position absolue et suivent la carte de tempo et de mesure ; aucune quantification ni transposition hors plage n’est appliquée automatiquement. Les modes voix/basse choisissent une seule ligne parmi les événements détectés ; le mode avec accords conserve la polyphonie. Il ne s’agit pas d’un nouveau modèle de transcription.
- L’aperçu permet d’alterner l’audio source et les notes MIDI sur un passage réglable, éventuellement en boucle, puis de corriger les notes dans le piano roll. **Appliquer à la partition** ajoute une partie ou remplace celle choisie, conserve les autres voix et sauvegarde atomiquement une version précédente, y compris les modifications non enregistrées. **Restaurer avant l’extraction** réactive cette version après redémarrage ; les versions ultérieures restent dans l’historique. Les fichiers audio d’aperçu sont supprimés à la fermeture. Le gain de qualité dépend de la source : le résultat demande une écoute, surtout pour des chœurs, une piste mélangée ou de la batterie. Aucun gain chiffré de précision n’est revendiqué.
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

Après le signalement des instruments absents, le catalogue du piano roll a été vérifié dans la candidate Windows : MODO DRUM, MODO BASS 2 et SampleTank 4 sont présents après recherche. Leur inspection isolée réussit, avec respectivement 2 081, 2 081 et 3 681 paramètres. Le problème de visibilité a conduit à ajouter la recherche automatique et l’accès direct depuis la piste ; ce constat ne constitue pas une validation audio de ces trois instruments.

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

### Détection de notes — contrôle local du 14 octobre 2026

- Compilation TypeScript/Vite et candidate Windows Tauri réussies ; vérification Rust et Clippy sans avertissement ; syntaxe du script Python vérifiée. Les suites automatisées citées ci-dessus n’ont pas été relancées pour cette modification.
- Parcours dans la candidate native, sur une copie isolée d’une piste vocale réelle : deux régions de 8 s placées à 4 s et 16 s, avec des offsets source différents et une carte 128 → 96 BPM. Le mode voix solo équilibré a proposé 18 notes ; la partition active est restée inchangée pendant l’aperçu. Les commandes audio/MIDI se relaient sans erreur affichée.
- Application : les 676 notes déjà présentes ont été conservées, une partie de 18 notes a été ajoutée et le changement à 16 s a été enregistré au tick 32768 (PPQ 960). Après redémarrage, **Restaurer avant l’extraction** a réactivé la version précédente avec ses 676 notes et son tempo 120 ; les voix restaurées sont identiques à celles d’avant l’application. Le fichier original est resté inchangé.
- Analyse du premier clip seul : 6 notes proposées et un audio d’aperçu de 12 s, incluant les 4 s de position initiale. La boucle audio reste active au-delà de la durée du passage ; le passage vers la lecture MIDI arrête l’audio. Arrêt MIDI vérifié. Les fichiers temporaires disparaissent à la fermeture de l’aperçu, sans application au projet.
- Interface inspectée en français dans une fenêtre Windows de 1600 × 900 pixels de contenu : choix d’analyse, comparaison, grille de notes et actions de fermeture/application accessibles. **Non vérifié** : petite fenêtre, zoom 200 %, locale anglaise, miroir RTL, justesse musicale à l’oreille et précision des modes basse/accords sur leurs propres sources. Les nombres de notes ci-dessus décrivent ce parcours et ne mesurent pas un gain de précision.
