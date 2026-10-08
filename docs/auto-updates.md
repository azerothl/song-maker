# Mises à jour de Song Maker

Au démarrage, Song Maker vérifie les mises à jour. Lorsqu’une version plus récente est publiée, l’application affiche ses notes et propose de la télécharger puis de l’installer. L’installation attend toujours une action de l’utilisateur.

Les paquets de mise à jour sont signés par Tauri et vérifiés avec la clé publique intégrée dans `src-tauri/tauri.conf.json`. Le workflow GitHub Actions utilise `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` pour signer les artefacts et publier `latest.json`. Ne publiez jamais la clé privée. Sa perte ou son remplacement empêche les installations existantes de vérifier les prochaines versions.

Sur la machine de maintenance, la clé privée est conservée sous `%USERPROFILE%\.tauri\song-maker-updater-v2.key` et son mot de passe dans `%USERPROFILE%\.tauri\song-maker-updater-password.dpapi`. Le fichier DPAPI ne se restaure que sous le même compte Windows.

Pour préparer une version, aligner `package.json`, `website/package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` et l’entrée locale de `src-tauri/Cargo.lock`. Ajouter les notes bilingues dans `docs/releases/vX.Y.Z.md` et mettre à jour les pages Nouveautés. Vérifier le workflow et CI avant de pousser le tag `vX.Y.Z`. Le workflow crée un brouillon, construit les artefacts des plateformes puis publie seulement si chaque build réussit.

Les releases avant v1.0.0 ne requièrent pas Authenticode ni notarisation macOS. Ces deux contrôles deviennent obligatoires à partir de v1.0.0. Les signatures Tauri de mise à jour restent obligatoires pour toutes les versions.

Les installations antérieures à l’activation du mécanisme de mise à jour n’ont pas la clé publique intégrée. Leur première mise à niveau doit se faire depuis la page des Releases ; les suivantes peuvent utiliser le mécanisme intégré.
