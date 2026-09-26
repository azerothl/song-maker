# @song-maker/score-engine

Moteur d’édition musicale **phase 2** : `ScoreDocument`, import MIDI, export ABC YuE2, validation de dialecte.

**Ce paquet n’est pas appelé par le premier build (phase 1).** Il peut fusionner sans réécrire l’UI Tauri.

## Rôle

| Module | Contrat |
|---|---|
| `ScoreDocument` + événements | Spec §7.1 |
| Import MIDI → `ScoreDocument` | Spec §7.2 |
| Export `full` / `melody` → ABC YuE2 | Spec §7.3–7.6 |
| Validation / refus « hors dialecte YuE2 » | Spec §7.4–7.6 |
| Stubs clips (fondu, trim, move…) | Spec §10.5 / §21.3 |
| Comparateur multi-candidats | Spec §8.6 / phase 2 |
| `stop_after=abc` | Piste YuE2 (audio.cpp ≥ 0.8.2) |
| Vocal → Ins (instrumental sans LoRA) | Skill yue2-music 1.2.0 |
| `semantic_prefix` | Piste YuE2 mid-song |

PPQ interne : **960**. Fixtures ABC : `tests/fixtures/{melody,score,score-jazz}.abc` (YuE `bd90e4cc`).

## Brancher plus tard depuis la phase 1

1. Ajouter le workspace / dépendance `@song-maker/score-engine` sans importer depuis le shell UI phase 1.
2. Quand l’écran partition existe :
   - `importMidiToScoreDocument(bytes)` → stocker `scores/score-vNNN.json` ;
   - `validateForAbcExport(doc, { cot })` avant génération ;
   - `exportToYuE2Abc(doc, { cot: "full" | "melody" })` → écrire le fichier ABC exact envoyé ;
   - passer `abcPath` dans `request.json` (aujourd’hui `null` en phase 1).
3. Ne pas activer `validating_score` tant que ce flux n’est pas branché.
4. Clips : réutiliser le type `Clip` déjà dans le mix phase 1 ; appeler `createClipEditor()` seulement quand l’UI expose fondus / trim.
5. `stop_after` / `semantic_prefix` : exigent une épingle audio.cpp ≥ `v0.8.2` — hors premier build.

```ts
import {
  importMidiToScoreDocument,
  validateForAbcExport,
  exportToYuE2Abc,
} from "@song-maker/score-engine";

const { document, issues } = importMidiToScoreDocument(midiBytes);
const check = validateForAbcExport(document, { cot: "full" });
if (!check.ok) throw new Error(check.issues[0]?.message);
const { abc } = exportToYuE2Abc(document, { cot: "full" });
```

## Scripts

```bash
cd packages/score-engine
npm install
npm test
npm run build
```

## Hors scope

Pas d’app desktop, pas de piano roll UI, pas d’appel GPU, pas d’élargissement du premier build.
