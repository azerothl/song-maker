# Sortie MIDI — 1 octobre 2026

La sortie de la voix sélectionnée de la partition utilise midir côté Rust, indépendamment de Web MIDI. Accès dans Partition → Piano roll → Sortie MIDI. Rechercher les sorties, sélectionner explicitement le port, choisir canal/programme (numéros 1–16 / 1–128), lire la partition ou tester un do médium de trois secondes. Aucun changement des notes du projet.

« Tout arrêter » invalide la génération de lecture sous le même verrou que les envois : les événements encore programmés ne sont plus envoyés. Sur les seize canaux, le backend envoie Sustain Off, All Notes Off, All Sound Off et Note Off pour chaque hauteur. Les changements de port, le démontage du panneau et la fermeture de l’état natif demandent également l’arrêt. Les erreurs ne révèlent pas les diagnostics du pilote.

## Matrice OS (preuve #170)

Décision Loïc du **2026-10-01** : traiter la sortie MIDI vers un synthé comme **fonctionnelle partout**. On n’attend plus une preuve multi-OS complète pour débloquer le produit ; les retours testeurs sur macOS / Linux restent bienvenus pour compléter la matrice.

| OS | Preuve matérielle / port virtuel | Statut |
|---|---|---|
| **Windows** | Application Tauri native : Microsoft GS Wavetable Synth, sélection, test de note, « Tout arrêter », retour au repos. Capture `native-connected-after-stop.jpg` (1282×832). SHA-256 `3537d46ea864d14e578cc5598a78a2bac09a616b8cfb25bb5a13a1e2f54e8322`. Aucun synthé matériel ni port virtuel externe distinct vérifié sur cette capture. | **Vérifié** |
| **macOS** | Aucun test natif Tauri ni port virtuel documenté. | **Non testé** |
| **Linux** | Aucun test natif Tauri ni port virtuel documenté. La CI Linux installe `libasound2-dev` (ALSA) pour la compilation midir ; cela ne constitue pas une preuve d’exécution. | **Non testé** |

## Vérifications séparées

- **Application Tauri Windows** : détail dans la matrice ci-dessus. Le projet observé n’a aucune note dans sa partition ; le test utilise une note temporaire et ne la sauvegarde pas. Aucune écoute ou mesure de silence revendiquée.
- **Backend installé** : diagnostic exécuté sur cette machine confirmant que le pilote WinMM retourne un ID vide pour le synthétiseur GS. #274 consigne le défaut natif. Les clés de sélection encodent désormais ID du pilote et nom du port. Une correspondance ambiguë est refusée plutôt que d’ouvrir un autre endpoint.
- **Tests Rust** : ordre Note Off avant Note On à temps égal ; validation complète avant sortie ; valeurs non finies, bornes et durées refusées ; arrêt couvrant les seize canaux et toutes les hauteurs, même si un envoi échoue ; identifiant Windows vide distinct de la sélection vide.
- **Tests React Chromium** avec backend simulé : connexion uniquement après sélection, lecture stoppée, échec de connexion lisible sans démarrage ni diagnostic brut. Ces tests ne prouvent pas la réception matérielle.
- Clippy et TypeScript réussis. 416 tests d’application réussis avant la dernière addition du bouton de test ; tests MIDI ciblés relancés ensuite. Compilation de production réussie.

Limites : une voix à la fois, carte de tempo utilisée comme le lecteur MIDI existant (premier tempo), maximum 50 000 notes et une heure. Le bouton d’arrêt concerne cette sortie MIDI ; l’arrêt du synthétiseur interne reste séparé.

Le sélecteur explicite « Voix de la partition » a été ajouté après la capture native conservée. Le test React vérifie qu’une seconde voix est envoyée avec ses propres hauteurs et durées, sans envoyer la première. La capture native documente la connexion et le retour au repos avant cet ajout d’interface.
