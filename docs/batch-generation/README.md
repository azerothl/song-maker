# Mode batch (#368)

Import JSON UTF-8 de plusieurs morceaux, plan de prises, file persistante. Voir [l’issue](https://github.com/azerothl/song-maker/issues/368) pour la spec V1.

- Schéma : [`batch.schema.json`](./batch.schema.json)
- Exemple : [`example.batch.json`](./example.batch.json) (3 + 2 prises = 5 tâches)

## Capacité GPU

La capacité **admise** est `1` tant qu’aucun chevauchement d’inférence réelle n’a été mesuré sur deux workers `audiocpp` isolés. `allowReduction` lance à 1 ; `requireRequested` bloque si le fichier demande plus. Ce n’est pas un XOR de moteur : le lot utilise le moteur local du profil (YuE2 par défaut).

## Commandes Tauri

`validate_batch_import`, `start_batch`, `list_batches`, `get_batch_status`, `pause_batch` / `resume_batch` / `cancel_batch`, `retry_batch_tasks`, `export_batch_results`.

Les projets (un par morceau) et le manifeste sont écrits au lancement. Après un crash, les lots `running` redeviennent `interrupted` ; aucune inférence n’est relancée toute seule.

## Hors preuve V1

Pas de pool de processus `audiocpp_server` isolés, donc **pas de chevauchement GPU mesuré**. Le parcours n’a pas été vérifié dans l’application Windows installée.
