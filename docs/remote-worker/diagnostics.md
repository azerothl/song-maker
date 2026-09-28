# Remote GPU worker — diagnostic (#65)

## Symptômes → causes

| Symptôme | Vérifier |
|---|---|
| Probe `rejected_local_only` | Opt-in distant désactivé (attendu si off) |
| Probe `rejected_unauthorized` | Jeton Paramètres / `SONG_MAKER_REMOTE_WORKER_TOKEN` |
| Probe `TLS requis` | URL non-https hors localhost |
| Health HTTP 401 on `/v1/jobs` but health OK | Normal : health public, jobs protégés |
| `decrypt_failed` | Client et worker n’ont pas le **même** jeton (HKDF) |
| `checksum_mismatch` | Payload altéré en transit |
| `payload_too_large` | Augmenter `SONG_MAKER_REMOTE_WORKER_MAX_BYTES` ou réduire le brief |
| `artifact_corrupt` | Fichier disque worker modifié — ne pas importer |
| Job `cancelled` | `POST …/cancel` ou annulation UI |
| Poll timeout / réseau | Reprendre le poll avec le même `job id` ; pas de repli local auto |
| Simulate WAV très court | `AUDIOCPP_URL` non défini — mode contrat, pas GPU |

## Logs sans secrets

Le worker journalise : `job id`, `kind`, `simulate`, `audioSha` tronqué.  
Jamais : Bearer, ciphertext, paroles en clair après decrypt (seulement `request.json` sur disque worker sous le dossier data, rétention limitée).

## Checklist e2e

1. Health OK avec jeton configuré côté client  
2. Auth refusée (mauvais jeton) → 401  
3. Génération simulate ou audiocpp → `succeeded` + import local  
4. Couper le réseau pendant le poll → erreur explicite, pas de succès local  
5. Cancel pendant `queued`/`running`  
6. Reprendre le poll après interruption réseau  
7. Corrompre `audio.wav` sur le worker → `artifact_corrupt`
