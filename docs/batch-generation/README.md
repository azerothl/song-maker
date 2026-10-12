# Génération par lots (#368)

Le mode batch importe un JSON UTF-8 de plusieurs morceaux, valide son contenu et affiche un aperçu avant le lancement. Il crée un projet par morceau, regroupe les prises dans Versions et conserve la file et l’état des tâches sur disque. Voir [l’issue #368](https://github.com/azerothl/song-maker/issues/368) pour le besoin et le suivi des vérifications.

- Schéma : [`batch.schema.json`](./batch.schema.json)
- Exemple : [`example.batch.json`](./example.batch.json) (3 + 2 prises = 5 tâches)
- Dans l’application : **Créer → Générer plusieurs morceaux**

## Capacité et simultanéité

La capacité admise est prudente : une génération tant qu’aucune mesure compatible n’existe pour la demande. `allowReduction` permet alors de lancer à cette capacité réduite ; `requireRequested` bloque si la capacité demandée n’est pas disponible.

L’utilisateur peut demander à l’application de vérifier le chevauchement de deux inférences YuE2 réelles avant le lancement. Une mesure réussie n’admet que deux prises pour la durée de la session et pour le même contenu de génération et les mêmes réglages, profil, GPU et fichiers de modèle vérifiés. La capacité ne s’étend pas à des durées, paroles, paramètres ou modèles différents. Si le profil, les réglages ou les fichiers changent, la preuve doit être renouvelée. Il ne s’agit pas d’une estimation générale du nombre de générations que le GPU peut supporter.

Les lots utilisent des workers `audio.cpp` isolés. Le parallélisme est limité par la capacité admise ; les résultats et paramètres de chaque prise restent distincts. Après redémarrage, une file interrompue ne relance pas automatiquement les inférences.

## Commandes Tauri

`validate_batch_import`, `start_batch`, `list_batches`, `get_batch_status`, `pause_batch` / `resume_batch` / `cancel_batch`, `retry_batch_tasks`, `export_batch_results`.

Le contrôle `verify_batch_parallelism` exécute la mesure réelle de deux prises avant un lancement concurrent. Les projets et le manifeste du lot sont écrits au lancement. Une reprise conserve les tâches terminées et ne relance que le travail restant ou explicitement relancé.

## Vérification de livraison

L’import, l’aperçu, la génération, l’écoute des résultats, la reprise après redémarrage, l’export, l’annulation, la poursuite après un échec isolé et un chevauchement réel de deux prises ont été vérifiés dans l’application Windows de développement. Le parcours complet reste à refaire dans un installeur Windows publié ; ce critère est suivi dans l’issue #368.
