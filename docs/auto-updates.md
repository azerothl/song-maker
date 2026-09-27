# Mises à jour de Song Maker

Song Maker vérifie les mises à jour au démarrage. Lorsqu’une version plus récente est publiée, l’application affiche ses notes et propose de la télécharger puis de l’installer. L’installation n’est jamais lancée sans action de l’utilisateur.

Les paquets sont signés par Tauri et vérifiés avec la clé publique intégrée à `src-tauri/tauri.conf.json`. Le workflow GitHub Actions utilise les secrets `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` pour signer les builds et publier `latest.json` avec les artefacts de mise à jour. Ne publiez jamais la clé privée. Sa perte ou son remplacement empêche les installations existantes de vérifier les prochaines versions.

Sur la machine de maintenance, la clé privée est conservée sous `%USERPROFILE%\.tauri\song-maker-updater-v2.key` et son mot de passe dans `%USERPROFILE%\.tauri\song-maker-updater-password.dpapi` (chiffré par Windows pour le compte local). Le fichier DPAPI ne se restaure que sous le même compte Windows ; une copie de ce seul fichier n’est pas une sauvegarde portable.

Pour une nouvelle version, augmentez ensemble la version de `package.json` et de `src-tauri/tauri.conf.json`, puis poussez le tag correspondant (`vX.Y.Z`). Le workflow construit les installateurs et leurs signatures pour chaque plateforme, met à jour le manifeste GitHub Releases et publie la release après réussite de tous les builds.

Les installations de Song Maker antérieures à l’activation de ce mécanisme ne contiennent pas sa clé publique. Elles ne peuvent pas se mettre à jour automatiquement vers cette version : leur première mise à niveau vers la version `0.1.1` doit se faire depuis la page des [releases](https://github.com/azerothl/song-maker/releases/latest). Les versions suivantes pourront ensuite se mettre à jour depuis l’application.
