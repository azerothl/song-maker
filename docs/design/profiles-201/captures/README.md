# Captures profils #201

Génération (Chromium Playwright, **mesuré** sur cette VM, 2026-09-30) depuis le **vrai** `<App/>` :

```bash
node --import tsx docs/design/profiles-201/captures/capture.mts
```

Page harness : `profiles-app-capture.html` → `src/dev/profilesAppCaptureMain.tsx` (mock Tauri + seed store, même shell que l’app).

Fichiers : `profils-L1-*-1280x720.png` et `profils-L1-*-1280x768.png` (**18 images**, 18 md5 distincts). Le script refuse les captures blanches (écart-type de luminance `< 18` ou `< 2 %` de pixels hors fond), les md5 identiques entre fichiers, et exige **18 md5 distincts**.

### Contrôles qualité (dernière passe)

| Mesure | Valeur |
|--------|--------|
| Écart-type luminance min / max (18 fichiers) | **18,2** / **28,2** |
| Part hors fond min / max | **14,08 %** / **97,24 %** |
| Verrou génération **1280×720** (`L1-07`) | alerte `profile-switch-block-alert` **92 px** de haut ; menu **199 px** de large ; `lumStd=23,3` ; **78,84 %** hors fond |

### Contenu par scène (720 px, luminance mesurée)

| Fichier | Contenu | `lumStd` | hors fond |
|---------|---------|----------|-----------|
| `profils-L1-01-creation-profil-commercial-desactive-*` | Onboarding : Commercial visible, désactivé, raison affichée (**R7** bordure `#8a7430`) | 28,2 | 96,89 % |
| `profils-L1-03-six-profils-sur-six-*` | Onboarding : limite 6/6 | 27,5 | 96,25 % |
| `profils-L1-04-selecteur-ferme-badge-titre-*` | Sélecteur fermé + badge titre ; nom long sur **2 lignes** (**R2**) | 21,5 | 76,33 % |
| `profils-L1-05-selecteur-menu-ouvert-*` | Menu profils ouvert | 22,1 | 76,88 % |
| `profils-L1-06-changement-de-profil-confirmation-*` | Modale changement de profil | 23,3 | 15,02 % |
| `profils-L1-07-selecteur-desactive-generation-infobulle-*` | Verrou génération (alerte menu, voir tableau ci-dessus) | 23,3 | 78,84 % |
| `profils-L1-09-barre-repliee-icone-infobulle-*` | Barre latérale repliée | 18,8 | 85,85 % |
| `profils-L1-11-migration-profil-hobby-par-defaut-*` | Bandeau migration + pastille nom multiligne (**R2**) | 24,1 | 80,80 % |
| `profils-L1-13-moteurs-non-proposes-commercial-*` | Réglages → moteurs (profil Commercial, liens 44 px) | 20,6 | 76,51 % |

**Non testé** : Tauri natif, WebKitGTK, lecteur d’écran, polices si Fraunces/Source Sans absentes (repli système).
