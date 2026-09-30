# Inventaire `btn primary` (35 usages)

Regroupement par écran et type d’action. Preuves Playwright : `captures-react/` (1280×720, `VITE_CAPTURE=1`).

Légende : **vérifié** = capturé (normal / survol / focus Tab / désactivé selon le cas) + entrée dans `metrics.json` ; **non vérifié** = pas de preuve automatisée dans ce dépôt.

| # | Fichier:ligne | Libellé (FR) | Statut | Preuve |
|---|---------------|--------------|--------|--------|
| 1 | `LibraryScreen.tsx:71` | Nouveau morceau | vérifié | `bibliotheque-primary-*` |
| 2 | `CreateWorkspace.tsx:213` | Générer | vérifié | `creer-primary-*` (désactivé via `busy` harnais) |
| 3 | `CreateWorkspace.tsx:538` | Générer (paramètres avancés) | non vérifié | même token, autre vue |
| 4 | `RecordTrackPanel.tsx:864` | Armer | vérifié | `production-armer-primary-*` |
| 5 | `RecordTrackPanel.tsx:874` | Démarrer | non vérifié | panneau enregistrement |
| 6 | `RecordTrackPanel.tsx:911` | Reprendre | non vérifié | panneau enregistrement |
| 7 | `RecordTrackPanel.tsx:925` | Garder les prises | non vérifié | panneau enregistrement |
| 8 | `Phase3MixPanel.tsx:1571` | Mesurer le mix rendu | vérifié | `production-mesurer-primary-*` |
| 9 | `ExportWizard.tsx:77` | Créer l’archive ZIP | vérifié | `production-zip-primary-*` |
| 10 | `ExportDialog.tsx:178` | Exporter (déclencheur) | vérifié | `production-exporter-primary-*` (désactivé via `busy`) |
| 11 | `ExportDialog.tsx:375` | Exporter (popin) | vérifié | `production-export-popin-primary-*` (désactivé natif `busy`) |
| 12 | `ProductionWorkspace.tsx:316` | Séparer les pistes | non vérifié | état `hasAiStems` du mix démo |
| 13 | `RegenerationGate.tsx:162` | Capturer et générer (actif) | vérifié | `confirmation-regeneration-gate-primary-*` |
| 14 | `RegenerationGate.tsx:162` | Capturer et générer (bloqué) | vérifié partiel | `regeneration-gate-blocked-primary-*` — `aria-disabled`, pas `:disabled` |
| 15 | `RegenerationGate.tsx:186` | Garder (post_check ok) | non vérifié | phase non montée |
| 16 | `RegenerationGate.tsx:215` | Garder (violations) | non vérifié | phase non montée |
| 17 | `InvariantPanel.tsx:94` | Vérifier | vérifié | `confirmation-invariant-panel-primary-*` |
| 18 | `RemoteGenerateConfirm.tsx:66` | Consentir et envoyer | vérifié | `confirmation-remote-generate-primary-*` |
| 19 | `SeparationRecommendDialog.tsx:493` | Lancer la séparation | vérifié | `confirmation-separation-recommend-primary-*` |
| 20 | `UpdateNotice.tsx:54` | Mettre à jour | vérifié | `confirmation-update-notice-primary-*` |
| 21 | `Phase3SettingsPanel.tsx:655` | Télécharger LoRA | vérifié | `reglages-lora-primary-*` |
| 22 | `Phase4SettingsPanel.tsx:565` | LoRA (phase 4) | non vérifié | hors harnais |
| 23 | `MixAssistPanel.tsx:314` | Assist mix | non vérifié | hors harnais |
| 24 | `MixAssistPanel.tsx:339` | Assist mix | non vérifié | hors harnais |
| 25 | `MixAssistPanel.tsx:415` | Assist mix | non vérifié | hors harnais |
| 26 | `ProductionAssistPanel.tsx:296` | Assist prod | non vérifié | hors harnais |
| 27 | `ProductionAssistPanel.tsx:366` | Assist prod | non vérifié | hors harnais |
| 28 | `MidiInstrumentPanel.tsx:376` | MIDI armer | non vérifié | hors harnais |
| 29 | `MidiInstrumentPanel.tsx:442` | MIDI stop | non vérifié | hors harnais |
| 30 | `ScorePanel.tsx:288` | Partition | non vérifié | hors harnais |
| 31 | `ScorePanel.tsx:311` | Partition | non vérifié | hors harnais |
| 32 | `ScoreBranchPanel.tsx:370` | Branche partition | non vérifié | hors harnais |
| 33 | `PianoRoll.tsx:523` | Piano roll | non vérifié | hors harnais |
| 34 | `ClipTimeline.tsx:1245` | Activer prise | non vérifié | hors harnais |
| 35 | `SheetSage2Panel.tsx:574` | Sheet Sage | non vérifié | hors harnais |

Hors inventaire produit (non comptés dans les 35 parcours app) : `scoreTabBenchApp.tsx`, `sepExportA11yCaptureMain.tsx`, maquettes `create-stemforge-captures.html`.

## Synthèse

| | Nombre |
|---|--------|
| Occurrences recensées | 35 |
| Vérifiées (capture + métriques) | 16 |
| Vérifiées partiellement | 1 (`regeneration-gate-blocked`, `aria-disabled`) |
| Non vérifiées | 18 |

Sur **24** boutons primaires pouvant apparaître désactivés dans l’app, **4** ont une preuve de désactivé natif (`:disabled`) dans cette livraison (Créer `busy`, Exporter déclencheur `busy`, Exporter popin `busy`, captures forcées pour les autres scénarios listés comme « style désactivé » via `disabled` injecté). Les **20** restants restent **non vérifiés** pour l’état désactivé réel.

## Points ouverts (Alphonse, sans correctif CSS dans cette PR)

- **I2** — Popin export : ΔE00 face primaire désactivé / ghost **~1,51** (`metrics.json`) ; bordure tirets vs ghost **ΔE00 0** (même `#303550`, styles différents) ; contraste bordure / fond **~1,6:1** (cible ~3:1, ex. `#6b7290`).
- **I3** — Anneau `:focus-visible` parfois coupé en haut/bas (barre Exporter, bas de popin) — vérifier sur les PNG `*-focus-*`.
