import { ScoreEngineError } from "../types/errors.js";
import type { CotProfile } from "../types/score-document.js";

/**
 * `stop_after=abc` — produce score without WAV (audio.cpp ≥ v0.8.2, Phase 2).
 * Requires cot=melody|full and no external ABC.
 * @see docs/yue2-ameliorations.md item 2
 */
export type StopAfterStage = "abc" | "semantic" | "audio";

export type StopAfterAbcRequest = {
  style: string;
  lyrics: string;
  cot: CotProfile;
  seed: number;
  /** Must be "abc" for score-only. */
  stopAfter: StopAfterStage;
  /** External ABC is forbidden with stop_after=abc. */
  abcPath?: string | null;
};

export type StopAfterAbcResult = {
  scoreAbcPath: string;
  audioPath: null;
};

export interface StopAfterAbcClient {
  run(request: StopAfterAbcRequest): Promise<StopAfterAbcResult>;
}

export class StubStopAfterAbcClient implements StopAfterAbcClient {
  async run(request: StopAfterAbcRequest): Promise<StopAfterAbcResult> {
    if (request.stopAfter !== "abc") {
      throw new ScoreEngineError(
        "validation_failed",
        `stop_after=${request.stopAfter} hors contrat de ce stub (abc seulement)`,
      );
    }
    if (request.cot === "off") {
      throw new ScoreEngineError(
        "abc_with_cot_off",
        "stop_after=abc exige cot=melody|full",
      );
    }
    if (request.abcPath) {
      throw new ScoreEngineError(
        "validation_failed",
        "stop_after=abc refuse un ABC externe",
      );
    }
    throw new ScoreEngineError(
      "not_implemented",
      "stop_after=abc : stub phase 2 — câbler audio.cpp ≥ v0.8.2 plus tard",
    );
  }
}

export function createStopAfterAbcClient(): StopAfterAbcClient {
  return new StubStopAfterAbcClient();
}
