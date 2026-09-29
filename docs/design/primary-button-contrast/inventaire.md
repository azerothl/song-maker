# Inventaire `btn primary` (35 usages)

Regroupement par écran et type d’action. Mesures Playwright : `docs/design/boutons-primaires/captures-react/` (1280×720, harnais React + `VITE_CAPTURE=1`).

Légende : **oui** = capturé et mesuré (voir lien) ; **non vérifié** = pas de preuve automatisée dans ce dépôt.

## Actions (lancer / confirmer)

| Groupe | Fichier:ligne | Libellé (FR) | Capturé / mesuré |
|--------|---------------|--------------|------------------|
| Enregistrement | `RecordTrackPanel.tsx:864` | Armer | non vérifié — panneau enregistrement absent du harnais capture |
| Enregistrement | `RecordTrackPanel.tsx:874` | Démarrer | non vérifié |
| Enregistrement | `RecordTrackPanel.tsx:911` | Reprendre | non vérifié |
| Enregistrement | `RecordTrackPanel.tsx:925` | Garder les prises | non vérifié |
| Mix phase 3 | `Phase3MixPanel.tsx:1571` | Mesurer le mix rendu | non vérifié — bouton présent mais masqué (scroll / panneau replié) dans `production-capture.html` |
| Export outils | `ExportWizard.tsx:77` | Créer l’archive ZIP | non vérifié — `ExportWizard` hors harnais Production |
| Séparation (maquette) | `create-stemforge-captures.html:129` | Lancer la séparation | non vérifié — HTML statique, hors harnais React |
| Séparation (reco) | `SeparationRecommendDialog.tsx:386` | Confirmer séparation | non vérifié — hors périmètre PR (#191) |
| Export (maquette) | `create-stemforge-captures.html:176`, `:201` | Exporter | non vérifié — maquette HTML |
| Export (app) | `ExportDialog.tsx:147` | Exporter (déclencheur) | oui — [trigger normal](../boutons-primaires/captures-react/production-export-trigger-normal-1280x720.png), états dans `metrics.json` |
| Export (app) | `ExportDialog.tsx:305` | Exporter (popin) | oui — [popin désactivé](../boutons-primaires/captures-react/production-export-popin-primary-disabled-normal-1280x720.png), ΔE00 dans `metrics.json` |
| Regénération | `RegenerationGate.tsx:146` | Capturer et générer | oui — [modal](../boutons-primaires/captures-react/regeneration-gate-primary-disabled-normal-1280x720.png) |
| Regénération | `RegenerationGate.tsx:163`, `:192` | Garder la nouvelle partition | non vérifié — phases `post_check` / `violations` non montées dans le harnais |
| Génération | `CreateWorkspace.tsx:213` | Générer | oui — [normal](../boutons-primaires/captures-react/creer-primary-normal-1280x720.png) … [focus](../boutons-primaires/captures-react/creer-primary-focus-1280x720.png) |
| Génération | `CreateWorkspace.tsx:538` | Générer (paramètres avancés) | non vérifié — même token CSS, autre vue |
| Génération distante | `RemoteGenerateConfirm.tsx:66` | Confirmer | non vérifié |
| Production | `ProductionWorkspace.tsx:316` | Séparer les pistes (primaire si pas de stems IA) | non vérifié — état `hasAiStems` du démo toujours vrai dans le mix capture |
| Maquette séparation | `create-stemforge-captures.html:97` | Séparer les pistes | non vérifié |

## Navigation / création de contenu

| Groupe | Fichier:ligne | Libellé | Capturé / mesuré |
|--------|---------------|---------|------------------|
| Bibliothèque | `LibraryScreen.tsx:71` | Nouveau | non vérifié (régression #186 possible via `sidebar-capture`, non regénéré dans #193) |
| Partition | `ScorePanel.tsx:288`, `:311` | Actions partition | non vérifié |
| Partition | `ScoreBranchPanel.tsx:370` | Branche partition | non vérifié |
| Partition | `PianoRoll.tsx:523` | Piano roll | non vérifié |
| Partition | `ClipTimeline.tsx:1245` | Activer prise | non vérifié |
| Partition | `SheetSage2Panel.tsx:574` | Sheet Sage | non vérifié |
| Bench | `scoreTabBenchApp.tsx:226` | Bench score | non vérifié — outil bench, pas harnais capture |

## Autres (réglages, assist, maintenance)

| Groupe | Fichier:ligne | Capturé / mesuré |
|--------|---------------|------------------|
| `Phase3SettingsPanel.tsx:655` | non vérifié |
| `Phase4SettingsPanel.tsx:565` | non vérifié |
| `MixAssistPanel.tsx:314`, `:339`, `:415` | non vérifié |
| `ProductionAssistPanel.tsx:296`, `:366` | non vérifié |
| `MidiInstrumentPanel.tsx:376`, `:442` | non vérifié |
| `InvariantPanel.tsx:94` | non vérifié |
| `UpdateNotice.tsx:54` | non vérifié |

## Synthèse (#193)

- **Vérifiés (captures + `metrics.json`)** : Créer (`Générer`), Production/Exporter (déclencheur + popin désactivé), RegenerationGate (primaire désactivé + focus clavier sur Annuler).
- **Priorité action non vérifiée** : Armer, Mesurer le mix rendu, Créer l’archive ZIP (raisons ci-dessus).
- **Total** : 35 occurrences recensées ; **8** liées à des preuves DOM dans cette PR ; **27** non vérifiées.
