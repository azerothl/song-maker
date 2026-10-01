# Assistant de mix unique avec Qwen

Choix utilisateur : un Qwen léger. Qwen 3.5 2B était déjà installé dans Ollama sur la machine ; aucun téléchargement ajouté. Un seul point d'entrée dans Réglages du mix. Les fonctions manuelles et les diagnostics de l'ancien Copilote restent accessibles dans un panneau repliable.

Le backend envoie uniquement noms/rôles/niveaux RMS et crêtes, gain/pan actuels et objectif à 127.0.0.1:11434. Aucun WAV n'est envoyé. Adresse fixe, proxy désactivé, redirections désactivées, modèle fixé, réponse JSON contrôlée. IDs inconnus/dupliqués, nombres non finis, gain hors [-60,+12] dB ou variation supérieure à 6 dB, pan hors [-1,+1] : rejet. Les propositions inchangées sont retirées. Aucun téléchargement automatique. États localisés si Ollama/modèle absent ou réponse invalide.

Les réglages restent des propositions. L'utilisateur doit examiner puis confirmer ; un bouton restaure gain/pan après application. Le fingerprint du mix et de son overlay interdit l'application d'une analyse périmée. Les autres données de piste sont conservées à l'annulation.

Validation séparée :
- Vrai appel Rust vers Ollama/Qwen sur 2 résumés synthétiques : réponse JSON valide en 44 467 ms, proposition identique au réglage courant (filtrée comme sans effet). Cette mesure ne démontre pas la qualité des conseils ni la latence sur un projet réel.
- Test d'interface Chromium avec WAV synthétiques et réponse de modèle simulée : aucune application avant confirmation, application puis annulation, fonctions manuelles disponibles.
- Tests TypeScript/Rust : réponses invalides et parité FR/EN ; compilation et Clippy réussis.
- Captures Chromium Windows du composant React à 1280×720/640×720 dans captures/. Aucune interaction native Tauri ni écoute A/B avec stems réels revendiquée.

Sources du transport et du modèle : https://docs.ollama.com/api/chat et https://ollama.com/library/qwen3.5:2b .

#235 reste ouvert pour le test natif complet, le premier benchmark sur un vrai projet et l'évaluation des propositions. Aucun seuil de performance inventé.