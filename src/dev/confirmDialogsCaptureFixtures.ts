import { INTERNAL_PPQ } from "@song-maker/score-engine";
import type { ScoreDocument } from "../lib/score";
import { createEmptyScoreDocument } from "../lib/score";
import { captureInvariantBaseline } from "../lib/invariants";

export const CONFIRM_CAPTURE_PROJECT_ID = "capture-confirm-dialogs";

export function captureRegenerationBefore(): ScoreDocument {
  const doc = createEmptyScoreDocument({ id: "capture-regen-before" });
  const voice = doc.voices[0];
  if (!voice) throw new Error("Voix capture absente");
  voice.notes = [
    {
      id: "n1",
      pitch: 60,
      startTick: 0,
      durationTick: INTERNAL_PPQ,
      velocity: 90,
    },
  ];
  return doc;
}

export function prepareRegenerationBaseline(before: ScoreDocument): void {
  captureInvariantBaseline(before, {
    projectId: CONFIRM_CAPTURE_PROJECT_ID,
    level: "pitches_and_rhythms",
  });
}
