# @song-maker/score-engine

Moteur d’édition musicale **phase 2** : `ScoreDocument`, import MIDI, export ABC YuE2, validation de dialecte.

Branché dans l’app desktop (écran morceau) : import MIDI, piano roll, aperçu ABC, envoi `abc` / `abcPath` à la génération, continuation mid-song.

## Rôle

| Module | Contrat |
|---|---|
| `ScoreDocument` + événements | Spec §7.1 |
| Import MIDI → `ScoreDocument` | Spec §7.2 |
| Export `full` / `melody` → ABC YuE2 | Spec §7.3–7.6 |
| Validation / refus « hors dialecte YuE2 » | Spec §7.4–7.6 |
| Éditeur de clips (fondu, trim, move, cut, duplicate) | Spec §10.5 / §21.3 — **réel** ; `StubClipEditor` = alias |
| Comparateur multi-candidats (sans gagnant auto) | Spec §8.6 — **réel** ; `StubCandidateComparer` = alias |
| `stop_after=abc` | **Activé** — plan d’options + commande desktop ; voir `STOP_AFTER_ABC.md` |
| Vocal → Ins (instrumental sans LoRA) | Skill yue2-music 1.2.0 |
| `semantic_prefix` | **Activé** — plan d’options + `continuationGenerationId` desktop ; voir `SEMANTIC_PREFIX.md` |

PPQ interne : **960**. Fixtures ABC : `tests/fixtures/{melody,score,score-jazz}.abc` (YuE `bd90e4cc`).

## Branchement desktop

1. Dépendance `@song-maker/score-engine` depuis l’UI morceau.
2. Partition : `importMidiToScoreDocument` → `scores/score-vNNN.json` ; `validateForAbcExport` ; `exportToYuE2Abc` → ABC envoyé via `abc` / `abcPath`.
3. Clips : `createClipEditor()` sur la timeline mix.
4. `stop_after` : `planStopAfterAbc` côté paquet ; `start_generation` + chemin score-only (voir `STOP_AFTER_ABC.md`).
5. Continuation : `planSemanticPrefixContinuation` côté paquet ; `start_generation` avec `continuationGenerationId` + `semantic_prefix_file` (voir `SEMANTIC_PREFIX.md`). Le GPU ne passe **pas** par un client `not_implemented`.

```ts
import {
  importMidiToScoreDocument,
  validateForAbcExport,
  exportToYuE2Abc,
  planSemanticPrefixContinuation,
} from "@song-maker/score-engine";

const { document, issues } = importMidiToScoreDocument(midiBytes);
const check = validateForAbcExport(document, { cot: "full" });
if (!check.ok) throw new Error(check.issues[0]?.message);
const { abc } = exportToYuE2Abc(document, { cot: "full" });

const plan = planSemanticPrefixContinuation({
  style: "pop",
  lyrics: "[Verse]\nSuite",
  cot: "full",
  seed: 1,
  parent: {
    generationId: "gen-001",
    semanticTruncated: true,
    semanticJsonPath: ".../generations/gen-001/semantic.json",
    frameCount: 750,
    hasScoreAbc: true,
  },
});
// plan.taskOptions → fusionné par la commande Tauri avant /v1/tasks/run
```

## Scripts

```bash
cd packages/score-engine
npm install
npm test
npm run build
```

## Hors scope

Pas de serveur GPU dans ce paquet : l’appel audio.cpp reste dans Tauri.
