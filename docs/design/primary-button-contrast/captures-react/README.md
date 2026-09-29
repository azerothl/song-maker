# Captures React — contraste boutons primaires (#186)

Captures **1280×720** de l’application réelle (harness Vite + mock Tauri), mesures via `getComputedStyle` (couleur du texte + stops `rgb()` du `background-image` calculé).

## Génération

```bash
pnpm exec tsx docs/design/primary-button-contrast/captures-react/capture.mts
```

Produit les PNG `primary-btn-*-1280x720.png` et `metrics.json`.

## Usages `btn primary` dans `src/` (36 composants)

| Fichier | Occurrences |
|---------|-------------|
| `src/bench/scoreTabBenchApp.tsx` | 1 |
| `src/screens/song/ProductionWorkspace.tsx` | 1 |
| `src/screens/song/CreateWorkspace.tsx` | 2 |
| `src/screens/LibraryScreen.tsx` | 1 |
| `src/components/RecordTrackPanel.tsx` | 4 |
| `src/components/ExportDialog.tsx` | 2 |
| `src/components/InvariantPanel.tsx` | 1 |
| `src/components/Phase3SettingsPanel.tsx` | 1 |
| `src/components/ClipTimeline.tsx` | 1 |
| `src/components/RegenerationGate.tsx` | 3 |
| `src/components/ProductionAssistPanel.tsx` | 2 |
| `src/components/SeparationRecommendDialog.tsx` | 1 |
| `src/components/ScoreBranchPanel.tsx` | 1 |
| `src/components/ScorePanel.tsx` | 2 |
| `src/components/MidiInstrumentPanel.tsx` | 2 |
| `src/components/SheetSage2Panel.tsx` | 1 |
| `src/components/UpdateNotice.tsx` | 1 |
| `src/components/ExportWizard.tsx` | 2 |
| `src/components/MixAssistPanel.tsx` | 3 |
| `src/components/PianoRoll.tsx` | 1 |
| `src/components/Phase3MixPanel.tsx` | 1 |
| `src/components/Phase4SettingsPanel.tsx` | 1 |
| `src/components/RemoteGenerateConfirm.tsx` | 1 |

## Couverture des écrans

| Scénario capture | Composants / écrans couverts |
|------------------|------------------------------|
| bibliotheque | `LibraryScreen` |
| creer | `CreateWorkspace` |
| score | `ScorePanel`, `SheetSage2Panel`, `PianoRoll`, `MidiInstrumentPanel`, `ScoreBranchPanel` (selon sous-mode) |
| production-mix | `Phase3MixPanel`, `MixAssistPanel`, `ExportDialog`, `ExportWizard`, `ProductionWorkspace`, copilote, etc. |
| production-clips | `ClipTimeline` |
| production-tools | `ProductionAssistPanel` |
| production-enregistrement | `RecordTrackPanel` |
| reglages-separation | `Phase3SettingsPanel` |
| reglages-distance / reglages-hote | `Phase4SettingsPanel` |

### Non capturés (harness / runtime)

- `RegenerationGate`, `InvariantPanel`, `RemoteGenerateConfirm`, `SeparationRecommendDialog` : modales conditionnelles (flux génération / séparation) — non reproduites sans scénario backend complet.
- `UpdateNotice` : bandeau mise à jour Tauri (`plugin-updater`).
- `scoreTabBenchApp` : banc de perf dev, pas un écran produit.

Voir `contrastes.md` pour le détail calculé vs mesuré DOM.
