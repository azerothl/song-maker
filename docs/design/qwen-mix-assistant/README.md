# Assistant de mix unique avec Qwen

Choix utilisateur : Qwen léger. Le modèle qwen3.5:2b était déjà installé dans Ollama ; aucun poids téléchargé pendant cette livraison. Un seul point d’entrée dans Réglages du mix. Les fonctions manuelles et diagnostics restent dans un panneau repliable.

Le backend envoie uniquement noms, rôles, niveaux RMS/crêtes, gain/pan et objectif à 127.0.0.1:11434. Aucun WAV envoyé. Adresse fixe, proxy et redirections désactivés. Réponse JSON contrôlée : IDs inconnus/dupliqués, nombres non finis, gain hors [-60,+12] dB, variation supérieure à 6 dB ou pan hors [-1,+1] rejetés. Les propositions inchangées sont retirées. Aucun téléchargement automatique.

Les réglages demandent examen puis confirmation ; une action annule gain/pan. Le fingerprint du mix et de son overlay bloque une proposition périmée. L’annulation conserve les autres données de piste.

## Licence et notices

[Note et sources épinglées](../../model-licenses/README.md) : Apache-2.0, Copyright 2026 Alibaba Cloud. La copie officielle complète est disponible dans l’assistant hors ligne et référencée dans NOTICE. Les poids sont installés séparément dans Ollama.

## Preuves distinctes

- Tauri Windows, vrai projet de sept pistes, 6:54 : proposition, examen sans écriture, confirmation persistée puis annulation en une action. Le JSON retrouve exactement son SHA-256 initial. Voir [audit natif](../../maintenance/native-audit-2026-10-01/README.md).
- Première analyse complète après relance : 14,3 s, dont 6,71 s pour le modèle. Deuxième mesure à froid, modèle absent de /api/ps avant clic : 13,17 s, dont 6,8 s pour Qwen. Aucun réglage appliqué pendant cette deuxième mesure ; hash du mix inchangé.
- Tests React Chromium : confirmation/annulation, notices hors ligne, modèle absent FR/EN sans diagnostic brut, conservation des gains en cas de réponse invalide. Tests TypeScript/Rust : contrat, bornes et parité linguistique.
- La mesure synthétique ancienne de 44 467 ms ne représente pas un projet réel. Les captures Chromium restent distinctes des captures natives.

## Budget initial après mesure

Sur la machine de référence Windows / RTX 4080 SUPER, pour le même projet de sept pistes de 6:54 et le même modèle Q8_0, le seuil de surveillance de régression est fixé à **28,6 s pour l’analyse complète** : deux fois la première mesure native complète de 14,3 s. Le facteur deux ménage la variabilité du chargement à froid ; c’est une règle de surveillance explicite, pas une promesse sur d’autres configurations. La mesure suivante de 13,17 s reste sous ce seuil. Un dépassement doit être consigné avec état du modèle, durée/nombre de pistes et matériel avant changement du seuil. Le timeout de transport de 120 s est une borne d’erreur distincte et préexistante.

L’écoute comparative n’a pas été effectuée ; la validité des réglages ne démontre pas une amélioration musicale. Les lecteurs d’écran, le tactile et les autres systèmes ne sont pas validés par cet audit.
