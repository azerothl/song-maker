# Inventaire `btn primary`

**34 usages** dans le code produit (`src/`, hors bancs et maquettes HTML) + **1 scénario harnais** (ligne 35, inatteignable en prod) = **35 lignes de suivi**.

Preuves Playwright : `captures-react/` (`VITE_CAPTURE=1`).

| Statut | Nombre |
|--------|--------|
| Vérifié (capture + métriques) | **13** |
| Partiel (harnais forcé uniquement) | **1** |
| Non vérifié | **21** |

**Désactivé réel** (`:disabled` ou `busy` harnais, 3 seulement) : Créer `Générer`, Exporter déclencheur, Exporter popin.  
**Désactivé forcé** (`btn.disabled = true` dans le script, **9** scénarios) + **1** `n/a` (Bibliothèque) + **3** **réels** = **13** lignes vérifiées.  
**Sans preuve désactivé réelle** : **31** usages (**34** − **3** réels ; les **21** non vérifiés + **9** forcés + **1** n/a).

| # | Fichier:ligne | Libellé | Statut | Désactivé | Preuve |
|---|---------------|---------|--------|-----------|--------|
| 1 | `LibraryScreen.tsx:71` | Nouveau morceau | vérifié | n/a (pas de `disabled` au source) | `bibliotheque-primary-{normal,hover,focus}-*` |
| 2 | `CreateWorkspace.tsx:213` | Générer | vérifié | **réel** (`busy`) | `creer-primary-*` (clip bouton ±14/22 px ; anneau rogné sur `creer-primary-focus-*`) |
| 3 | `CreateWorkspace.tsx:538` | Générer (avancé) | non vérifié | — | autre vue |
| 4 | `RecordTrackPanel.tsx:864` | Armer | vérifié* | forcé | `production-armer-primary-*` (*`normal` : voir `normalInViewport` dans `metrics.json`) |
| 5 | `RecordTrackPanel.tsx:874` | Démarrer | non vérifié | — | — |
| 6 | `RecordTrackPanel.tsx:911` | Reprendre | non vérifié | — | — |
| 7 | `RecordTrackPanel.tsx:925` | Garder les prises | non vérifié | — | — |
| 8 | `Phase3MixPanel.tsx:1571` | Mesurer le mix rendu | vérifié | forcé | `production-mesurer-primary-*` |
| 9 | `ExportWizard.tsx:77` | Créer l’archive ZIP | vérifié | forcé | `production-zip-primary-*` |
| 10 | `ExportDialog.tsx:178` | Exporter (déclencheur) | vérifié | **réel** (`busy`) | `production-exporter-primary-*` ; I3 barre mix : `production-exporter-bar-focus-i3-*` |
| 11 | `ExportDialog.tsx:375` | Exporter (popin) | vérifié | **réel** (`busy`) | `production-export-popin-primary-*` |
| 12 | `ProductionWorkspace.tsx:316` | Séparer les pistes | non vérifié | — | `hasAiStems` démo |
| 13 | `RegenerationGate.tsx:162` | Capturer et générer | vérifié | forcé | `confirmation-regeneration-gate-primary-*` |
| 14 | `RegenerationGate.tsx:186` | Garder (post_check ok) | non vérifié | — | phase non montée |
| 15 | `RegenerationGate.tsx:215` | Garder (violations) | non vérifié | — | phase non montée |
| 16 | `InvariantPanel.tsx:94` | Vérifier | vérifié | forcé | `confirmation-invariant-panel-primary-*` |
| 17 | `RemoteGenerateConfirm.tsx:66` | Consentir et envoyer | vérifié | forcé | `confirmation-remote-generate-primary-*` |
| 18 | `SeparationRecommendDialog.tsx:493` | Lancer la séparation | vérifié | forcé | `confirmation-separation-recommend-primary-*` |
| 19 | `UpdateNotice.tsx:54` | Mettre à jour | vérifié | forcé | `confirmation-update-notice-primary-*` |
| 20 | `Phase3SettingsPanel.tsx:655` | Télécharger LoRA | vérifié | forcé | `reglages-lora-primary-*` |
| 21 | `Phase4SettingsPanel.tsx:565` | LoRA phase 4 | non vérifié | — | — |
| 22 | `MixAssistPanel.tsx:314` | Appliquer le preset | non vérifié | — | — |
| 23 | `MixAssistPanel.tsx:339` | Analyser l’équilibre | non vérifié | — | — |
| 24 | `MixAssistPanel.tsx:415` | Confirmer l’équilibre | non vérifié | — | — |
| 25 | `ProductionAssistPanel.tsx:296` | Analyser (copilote) | non vérifié | — | — |
| 26 | `ProductionAssistPanel.tsx:366` | Confirmer (copilote) | non vérifié | — | — |
| 27 | `MidiInstrumentPanel.tsx:376` | MIDI armer | non vérifié | — | — |
| 28 | `MidiInstrumentPanel.tsx:442` | MIDI stop | non vérifié | — | — |
| 29 | `ScorePanel.tsx:288` | Quantifier | non vérifié | — | — |
| 30 | `ScorePanel.tsx:311` | Importer un MIDI | non vérifié | — | — |
| 31 | `ScoreBranchPanel.tsx:370` | Branche partition | non vérifié | — | — |
| 32 | `PianoRoll.tsx:523` | Quantifier (bannière) | non vérifié | — | — |
| 33 | `ClipTimeline.tsx:1245` | Activer prise | non vérifié | — | — |
| 34 | `SheetSage2Panel.tsx:574` | Sheet Sage | non vérifié | — | — |
| 35 | `regen-gate-capture.html` (harnais) | Gate bloqué forcé | **partiel** | `aria-disabled` (pas `:disabled`) | `regeneration-gate-blocked-primary-*` — **inatteignable** (`SongScreen.tsx:339`) |

Hors tableau : `scoreTabBenchApp.tsx`, `sepExportA11yCaptureMain.tsx`, maquettes `create-stemforge-captures.html`.

## Non testé (honnête)

- WebKitGTK (Chromium / Playwright uniquement)
- Lecteur d’écran (NVDA, Orca, VoiceOver)
- `forced-colors` (décision produit)
- `aria-disabled` du popin Exporter quand aucune piste n’est cochée (preuve popin = primaire `:disabled` via `busy`)
- Garde cyan : échec attendu sur PNG sans pixels cyan (non couvert par un test automatisé)

## Points ouverts (sans correctif CSS)

- **I2** — Popin export désactivé natif : bordure tirets **1,60:1** sur la page, **1,27:1** sur le fond du popin ; ΔE00 face / ghost **~1,51**.
- **I3** — Anneau focus rogné (barre Exporter, bas popin) — `production-exporter-bar-focus-i3-1280x720.png`.
