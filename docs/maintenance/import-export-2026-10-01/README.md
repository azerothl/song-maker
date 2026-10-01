# Export après import audio — 1 octobre 2026

## Reproduction native

Un nouveau projet réservé à l'audit a été créé depuis la bibliothèque de Tauri Windows. Un WAV synthétique de 12 s a été importé avec le menu Ajouter une piste. La piste et sa source normalisée étaient sauvegardées, la lecture disponible, mais Exporter restait désactivé : #279. Le déclencheur exigeait une génération IA active.

L'export devient disponible lorsqu'un mix actif contient une source et un clip de durée positive, même sans génération. Sans pistes utilisables et pendant une opération, le bouton reste désactivé. La barre de Production ouvre le mode Mix pour les projets sans stems IA, au lieu d'un mode Pistes séparées inutilisable.

## Fichier obtenu

Le parcours natif a été poursuivi jusqu'au choix du dossier local de destination et au message « Export terminé ». Le WAV obtenu est PCM stéréo, 48 kHz, 24 bits, 576 000 trames, soit exactement 12 s ; son signal est non nul. `export-metrics.json` contient les mesures et le SHA256 vérifié, identique au rapport d'export produit par l'application. Aucun morceau personnel n'a été exporté ni transmis.

## Superposition du dialogue

Ce parcours a révélé #282 : la règle sticky dessinait ses zones au-dessus des options d'export. Le dialogue était enfermé dans le contexte de superposition du bandeau master (alors niveau 4), sous la règle (niveau 5). Le bandeau master est depuis passé au niveau 6 en permanence (#289), ce qui couvre aussi le dialogue d'export.

`native-overlay-before.jpg` et `native-overlay-after.jpg` montrent le même dialogue dans le même projet, à 1282×832. Après correction, Format, Profondeur et Destination sont visibles. Un test du vrai composant de Production vérifie par hit-testing que le dialogue couvre les zones sticky à 1280 et 640 px et que le niveau normal revient après fermeture. Ces deux dimensions sont des vérifications Chromium ; la capture native est à 1282×832.

Pas de test d'écoute comparative, de FLAC/MP3 ou d'export sur une autre plateforme dans ce lot.
