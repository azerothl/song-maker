# Inventaire `btn primary`

**39 usages** produit (`src/`, hors `src/dev` et `src/bench`) + **1 harnais** (`regen-gate-capture.html`) = **40 lignes**.

Régénéré depuis `rg 'className=.*btn primary|btn primary'` sur `src/` (hors dev/bench) au **HEAD de la PR** ; captures Playwright : voir `metrics.json` → `captureGitSha` (commit au moment de `capture.mts`, sans circularité avec le SHA de tête).

| Statut capture | Nombre |
|----------------|--------|
| Vérifié (scénario Playwright + métriques) | **15** scénarios → **22** usages couverts (voir tableau) |
| Partiel (harnais forcé) | **1** |
| Non vérifié écran par écran | **17** usages |

Légende preuves : **[M]** mesuré (DOM / PNG / `metrics.json`) · **[C]** calculé (même règle `.btn.primary`, non rejoué sur l’écran) · **[—]** non testé.

Ratios actifs **[C]** (tous les primaires non surchargés) : normal **6,47:1** · survol **7,12:1** · focus texte **6,47:1**. Désactivé I2 **[M/C]** : **#848ba0** / **#12151f** → **5,36:1** (`:disabled` natif et `aria-disabled="true"`).

## Tableau écran × bouton × état

| # | Fichier:ligne | Libellé | Cond. | normal | survol | focus | `:disabled` | `aria-disabled` |
|---|---------------|---------|-------|--------|--------|-------|-------------|-----------------|
| 1 | `LibraryScreen.tsx:75` | Nouveau morceau | | [M] 6,47 | [M] 7,12 | [M] 6,47 | n/a | n/a |
| 2 | `CreateWorkspace.tsx:213` | Générer | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (`busy`) | n/a |
| 3 | `CreateWorkspace.tsx:538` | Générer (avancé) | | [—] | [—] | [—] | [—] | [—] |
| 4 | `RecordTrackPanel.tsx:864` | Armer | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 5 | `RecordTrackPanel.tsx:874` | Démarrer | | [—] | [—] | [—] | [—] | [—] |
| 6 | `RecordTrackPanel.tsx:911` | Reprendre | | [—] | [—] | [—] | [—] | [—] |
| 7 | `RecordTrackPanel.tsx:925` | Garder les prises | | [—] | [—] | [—] | [—] | [—] |
| 8 | `Phase3MixPanel.tsx:1571` | Mesurer le mix rendu | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 9 | `ExportWizard.tsx:77` | Créer l’archive ZIP | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 10 | `ExportDialog.tsx:178` | Exporter (déclencheur) | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (`busy`) | n/a |
| 11 | `ExportDialog.tsx:375` | Exporter (popin) | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (`busy`) | [M] 5,36 (0 piste) |
| 12 | `ProductionWorkspace.tsx:316` | Séparer les pistes | oui `hasAiStems` | [C] 6,47 | [C] 7,12 | [C] 6,47 | [—] | [—] |
| 13 | `RegenerationGate.tsx:162` | Capturer et générer | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | [M] 5,36 (harnais) |
| 14 | `RegenerationGate.tsx:186` | Garder (post_check ok) | | [—] | [—] | [—] | [—] | [—] |
| 15 | `RegenerationGate.tsx:215` | Garder (violations) | | [—] | [—] | [—] | [—] | [—] |
| 16 | `InvariantPanel.tsx:94` | Vérifier | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 17 | `RemoteGenerateConfirm.tsx:66` | Consentir et envoyer | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 18 | `SeparationRecommendDialog.tsx:682` | Lancer la séparation | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | [C] 5,36 (modèle indisponible) |
| 19 | `UpdateNotice.tsx:54` | Mettre à jour | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 20 | `Phase3SettingsPanel.tsx:655` | Télécharger LoRA | | [M] 6,47 | [M] 7,12 | [M] 6,47 | [M] 5,36 (forcé) | n/a |
| 21 | `Phase4SettingsPanel.tsx:565` | LoRA phase 4 | | [—] | [—] | [—] | [—] | [—] |
| 22 | `MixAssistPanel.tsx:314` | Appliquer le preset | | [C] 6,47 | [C] 7,12 | [C] 6,47 | [—] | [—] |
| 23 | `MixAssistPanel.tsx:339` | Analyser l’équilibre | | [C] 6,47 | [C] 7,12 | [C] 6,47 | [—] | [—] |
| 24 | `MixAssistPanel.tsx:415` | Confirmer l’équilibre | | [—] | [—] | [—] | [—] | [—] |
| 25 | `ProductionAssistPanel.tsx:296` | Analyser (copilote) | | [C] 6,47 | [C] 7,12 | [C] 6,47 | [—] | [—] |
| 26 | `ProductionAssistPanel.tsx:366` | Confirmer (copilote) | | [—] | [—] | [—] | [—] | [—] |
| 27 | `MidiInstrumentPanel.tsx:376` | MIDI armer | | [—] | [—] | [—] | [—] | [—] |
| 28 | `MidiInstrumentPanel.tsx:442` | MIDI stop | | [—] | [—] | [—] | [—] | [—] |
| 29 | `ScorePanel.tsx:288` | Quantifier | | [—] | [—] | [—] | [—] | [—] |
| 30 | `ScorePanel.tsx:311` | Importer un MIDI | | [—] | [—] | [—] | [—] | [—] |
| 31 | `ScoreBranchPanel.tsx:370` | Branche partition | | [—] | [—] | [—] | [—] | [—] |
| 32 | `PianoRoll.tsx:523` | Quantifier (bannière) | | [—] | [—] | [—] | [—] | [—] |
| 33 | `ClipTimeline.tsx:1139` | Activer prise | oui `takeActive` | [—] | [—] | [—] | [—] | [—] |
| 34 | `SheetSage2Panel.tsx:574` | Sheet Sage | | [—] | [—] | [—] | [—] | [—] |
| 35 | `ProfileOnboardingScreen.tsx:193` | Ouvrir (dernier profil) | oui `isLastUsed` | [C] 6,47 | [C] 7,12 | [C] 6,47 | [—] | [—] |
| 36 | `ProfileOnboardingScreen.tsx:269` | Créer le profil | | [C] 6,47 | [C] 7,12 | [C] 6,47 | [C] 5,36 (natif vide) | n/a |
| 37 | `ProfileRenameDialog.tsx:96` | Renommer | | [—] | [—] | [—] | [—] | [—] |
| 38 | `ProfileCommercialCreateConfirmDialog.tsx:43` | Création commerciale | | [—] | [—] | [—] | [—] | [—] |
| 39 | `ProfileSwitchConfirmDialog.tsx:71` | Confirmer le switch | | [C] 6,47 | [C] 7,12 | [C] 6,47 | [—] | [—] |
| 40 | `regen-gate-capture.html` | Gate bloqué (harnais) | | [M] 5,36 | [M] 5,36 | [M] 5,36 | n/a | [M] 5,36 |

Hors tableau : `scoreTabBenchApp.tsx`, `sepExportA11yCaptureMain.tsx`, maquettes HTML.

## I2 / I3 (cette itération)

- **I2** — `.btn.primary:disabled` **et** `.btn.primary[aria-disabled="true"]` : face **#12151f**, tirets **#6a7394**, texte **5,36:1** ; survol désactivé.
- **I3** — Barre mix uniquement : `.production-mix-toolbar-actions > .btn.primary:focus-visible` avec `outline-offset: -2px` + `box-shadow: inset 0 0 0 2px #151827` (anneau deux tons ≥ 3:1). Règle **`.anchored-popin-footer`** retirée (R-2 : aucun rognage démontré sur le pied de popin Exporter).
- **Captures** — Recadrages bouton : suffixe `-clip.png` ; vues 1280×720 plein écran : `-1280x720.png` (R-5).

## Renvoi #212

- Rognages d’anneau préexistants (Créer, Mesurer, etc.).
- `forced-colors` (Windows HC non testé).

## Non testé

WebKitGTK, lecteur d’écran, **17** usages (colonne [—]), garde cyan négative (couvert par tests unitaires + garde pixels `capture.mts`).
