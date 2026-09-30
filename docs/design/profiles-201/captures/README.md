# Captures profils #201

Génération (Chromium Playwright, **mesuré** sur cette VM) :

```bash
node --import tsx docs/design/profiles-201/captures/capture.mts
```

Fichiers : `profils-*-1280x720.png` et `profils-*-1280x768.png`.

| Fichier | Contenu |
|---------|---------|
| `profils-onboarding-hobby-*` | Écran choix/création, Commercial visible désactivé |
| `profils-commercial-disabled-*` | Même écran (focus texte indisponibilité) |
| `profils-selector-ferme-*` | Pastille profil fermée |
| `profils-selector-ouvert-*` | Menu profils ouvert |
| `profils-selector-replie-*` | Barre latérale repliée (icône + infobulle) |
| `profils-switch-confirm-*` | Modale changement de profil |
| `profils-switch-bloque-generation-*` | Alerte blocage dans le menu |
| `profils-moteurs-commercial-fixture-*` | **Fixture de test** — liste grisée, aucun moteur branché en production |
| `profils-migration-banner-*` | Bandeau migration |

**Calculé** : contraste anneau cyan 2 px (`--accent-cyan`) reprend la règle globale `:focus-visible` de `App.css`.

**Non testé** : Tauri natif, WebKitGTK, lecteur d’écran, polices si Fraunces/Source Sans absentes (repli système).
