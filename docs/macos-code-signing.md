# Signature et notarisation macOS

Les releases avant v1.0.0 ne demandent pas de signature Developer ID ni de notarisation. macOS peut demander une autorisation au premier lancement. À partir de v1.0.0, le workflow exigera certificat Developer ID Application et notarisation Apple, puis vérifiera codesign, le ticket agrafé et Gatekeeper avant publication.

Les signatures de mise à jour Tauri sont distinctes et restent requises pour chaque release.

## Configuration GitHub pour v1.0.0+

Ajouter les secrets suivants au dépôt :

| Secret | Contenu |
|---|---|
| APPLE_CERTIFICATE | Certificat Developer ID Application exporté en .p12 et encodé en base64 |
| APPLE_CERTIFICATE_PASSWORD | Mot de passe de cet export |
| APPLE_SIGNING_IDENTITY | Nom de l’identité Developer ID Application |
| APPLE_ID | Compte Apple autorisé à notarier |
| APPLE_PASSWORD | Mot de passe dédié à la notarisation |
| APPLE_TEAM_ID | Équipe Apple Developer du projet |

Les clés privées ne doivent apparaître ni dans le dépôt ni dans les logs.

## Preuves à conserver

Pour chaque architecture, conserver le tag et les empreintes des artefacts, les contrôles codesign, stapler validate et spctl, puis vérifier l’ouverture sur un Mac avec la quarantaine appliquée. Une CI réussie ne remplace pas ce dernier contrôle.

Guide technique : documentation officielle Tauri sur la signature macOS.