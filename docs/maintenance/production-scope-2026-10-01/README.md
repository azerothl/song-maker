# Isolation des réglages de Production — #287

Le cache local et l'état actif utilisaient uniquement `mixId`. Ces identifiants sont locaux aux projets : deux morceaux peuvent tous deux utiliser `mix-v001`. Quand le second n'avait pas de fichier de réglages sur disque, le repli récupérait les réglages du premier. Une reproduction du vrai module avec un stockage mémoire a retrouvé `effectsByTrack` du projet A dans le projet B.

SongScreen définit maintenant le projet actif avant les effets de chargement de ses enfants. Les clés locales contiennent projet et mix. Un changement de projet vide l'état actif et les deux historiques, et retire l'ancien rappel d'écriture disque. Changer vers le même projet conserve l'historique.

Les fichiers `.production.json` présents sur disque restent chargés normalement, puis alimentent le cache de leur projet. Les anciennes clés sans propriétaire restent intactes : elles ne sont pas attribuées automatiquement à un morceau, car cette attribution serait ambiguë. Une ancienne sauvegarde uniquement locale et sans fichier disque nécessite donc de déterminer son projet avant récupération.

Tests du module : deux projets avec le même ID de mix, rechargement de chacun, absence d'annulation d'un projet dans l'autre, conservation de l'ancienne clé, restauration depuis le disque, retrait de l'ancien rappel d'écriture et conservation de l'historique dans le même projet. La suite complète précédant le dernier test additionnel passe (423 tests) ; le test additionnel est vérifié séparément.

Observation native complémentaire : dans le projet synthétique d'audit, un point Volume à 0 ms / −6 dB est bien affiché dans Tauri et enregistré dans son propre `mix-v001.production.json`. Cette observation ne constitue pas un parcours natif comparatif entre deux projets ; cette isolation est vérifiée par les tests du module.
