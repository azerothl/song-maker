# Captures profils #201

Génération (Chromium Playwright, **mesuré** sur cette VM) depuis le **vrai** `<App/>` (pas `profiles-capture.html`) :

```bash
node --import tsx docs/design/profiles-201/captures/capture.mts
```

Page harness : `profiles-app-capture.html` → `src/dev/profilesAppCaptureMain.tsx` (mock Tauri + seed store, même shell que l’app).

Fichiers : `profils-L1-*-1280x720.png` et `profils-L1-*-1280x768.png` (18 images). Le script refuse les captures blanches ou dupliquées (hash SHA-256).

| Fichier | Contenu |
|---------|---------|
| `profils-L1-01-creation-profil-commercial-desactive-*` | Onboarding : Commercial visible, désactivé, raison affichée |
| `profils-L1-03-six-profils-sur-six-*` | Onboarding : limite 6/6 |
| `profils-L1-04-selecteur-ferme-badge-titre-*` | Sélecteur fermé + badge titre chanson |
| `profils-L1-05-selecteur-menu-ouvert-*` | Menu profils ouvert |
| `profils-L1-06-changement-de-profil-confirmation-*` | Modale changement de profil |
| `profils-L1-07-selecteur-desactive-generation-infobulle-*` | Verrou génération (alerte menu) |
| `profils-L1-09-barre-repliee-icone-infobulle-*` | Barre latérale repliée |
| `profils-L1-11-migration-profil-hobby-par-defaut-*` | Bandeau migration |
| `profils-L1-13-moteurs-non-proposes-commercial-*` | Réglages → moteurs (profil Commercial) |

**Calculé** : contraste anneau cyan 2 px (`--accent-cyan`) sur éléments `.profile-focusable`.

**Verrou profil (génération / séparation / export)**  
- **Génération & séparation** : état `JobQueue` (`queued`, `preparing`, `generating`, `separating`, `importing_tracks`) lu par `get_job_status` côté UI et par `profile_switch_blocked` dans `activate_profile` / `create_profile`.  
- **Export** : drapeau `AppState.profile_export_busy` pendant `export_project_package`, `export_audio` et `export_pcm_audio` (`with_profile_export_busy`).  
- **UI** : `profileSwitchBlockReason(job, profileOperationBusy)` ; création onboarding inclut le verrou.

**Non testé** : Tauri natif, WebKitGTK, lecteur d’écran, polices si Fraunces/Source Sans absentes (repli système).
