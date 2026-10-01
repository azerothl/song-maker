# Sortie MIDI — 1 octobre 2026

La sortie de la voix sélectionnée de la partition utilise midir côté Rust, indépendamment de Web MIDI. Accès dans Partition → Piano roll → Sortie MIDI. Rechercher les sorties, sélectionner explicitement le port, choisir canal/programme (numéros 1–16 / 1–128), lire la partition ou tester un do médium de trois secondes. Aucun changement des notes du projet.

« Tout arrêter » invalide la génération de lecture sous le même verrou que les envois : les événements encore programmés ne sont plus envoyés. Sur les seize canaux, le backend envoie Sustain Off, All Notes Off, All Sound Off et Note Off pour chaque hauteur. Les changements de port, le démontage du panneau et la fermeture de l’état natif demandent également l’arrêt. Les erreurs ne révèlent pas les diagnostics du pilote.

## Vérifications séparées

- **Application Tauri Windows** : recherche de Microsoft GS Wavetable Synth, sélection conservée, test de note lancé (état de lecture affiché), clic « Tout arrêter », retour au repos sans message d’erreur. Capture `native-connected-after-stop.jpg`, fenêtre 1282×832. Le projet observé n’a aucune note dans sa partition ; le test utilise une note temporaire et ne la sauvegarde pas. Aucun synthétiseur matériel ni port virtuel externe vérifié. Aucune écoute ou mesure de silence revendiquée.
- **Backend installé** : diagnostic exécuté sur cette machine confirmant que le pilote WinMM retourne un ID vide pour le synthétiseur GS. #274 consigne le défaut natif. Les clés de sélection encodent désormais ID du pilote et nom du port. Une correspondance ambiguë est refusée plutôt que d’ouvrir un autre endpoint.
- **Tests Rust** : ordre Note Off avant Note On à temps égal ; validation complète avant sortie ; valeurs non finies, bornes et durées refusées ; arrêt couvrant les seize canaux et toutes les hauteurs, même si un envoi échoue ; identifiant Windows vide distinct de la sélection vide.
- **Tests React Chromium** avec backend simulé : connexion uniquement après sélection, lecture stoppée, échec de connexion lisible sans démarrage ni diagnostic brut. Ces tests ne prouvent pas la réception matérielle.
- Clippy et TypeScript réussis. 416 tests d’application réussis avant la dernière addition du bouton de test ; tests MIDI ciblés relancés ensuite. Compilation de production réussie.

macOS et Linux : non testés nativement. La dépendance ALSA est ajoutée aux bibliothèques de compilation de la CI Linux. Le scénario matériel/port virtuel de #170 reste ouvert. #164 garde sa dépendance.

Limites : une voix à la fois, carte de tempo utilisée comme le lecteur MIDI existant (premier tempo), maximum 50 000 notes et une heure. Le bouton d’arrêt concerne cette sortie MIDI ; l’arrêt du synthétiseur interne reste séparé.
