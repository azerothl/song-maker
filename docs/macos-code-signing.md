# Signature et notarisation macOS

Le workflow de release exige désormais une identité **Developer ID Application** et les informations de notarisation Apple. L’identité ad hoc `-` est refusée pour les releases. Le build transmet les identifiants à Tauri, puis vérifie signature, ticket de notarisation agrafé et acceptation Gatekeeper avant que le job puisse réussir.

Cette configuration ne signe pas les releases déjà publiées. Aucune release notariée n’est attestée dans ce lot de corrections ; [#332](https://github.com/azerothl/song-maker/issues/332) reste ouverte.

## Configuration GitHub

Ajouter les secrets suivants dans le dépôt :

| Secret | Contenu |
|---|---|
| `APPLE_CERTIFICATE` | Certificat Developer ID Application exporté en `.p12`, encodé en base64 |
| `APPLE_CERTIFICATE_PASSWORD` | Mot de passe de cet export |
| `APPLE_SIGNING_IDENTITY` | Nom de l’identité Developer ID Application |
| `APPLE_ID` | Compte Apple autorisé à notarier |
| `APPLE_PASSWORD` | Mot de passe spécifique à l’application, créé pour la notarisation |
| `APPLE_TEAM_ID` | Équipe Apple Developer du projet |

Les clés de signature de mise à jour Tauri restent distinctes. Les valeurs privées ne doivent apparaître ni dans le dépôt ni dans les logs.

## Validation à conserver

Pour chaque architecture, conserver le tag et les empreintes des artefacts, la réussite des contrôles `codesign`, `stapler validate` et `spctl`, puis une ouverture du téléchargement sur un Mac avec la quarantaine appliquée. Une CI réussie ne remplace pas cette dernière vérification.

Configuration vérifiée sur la [documentation officielle Tauri](https://v2.tauri.app/distribute/sign/macos/). Le workflow n’a pas été exécuté avec un certificat dans cette session Windows.
