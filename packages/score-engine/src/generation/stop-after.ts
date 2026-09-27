import { ScoreEngineError } from "../types/errors.js";
import type { CotProfile } from "../types/score-document.js";

/**
 * `stop_after=abc` — produce score without WAV (audio.cpp ≥ v0.8.2).
 * Gated until the option is wired into the local generation request.
 * @see docs/yue2-ameliorations.md item 2
 * @see packages/score-engine/STOP_AFTER_ABC.md
 */
export type StopAfterStage = "abc" | "semantic" | "audio";

/**
 * Feature flag — keep false until the command is wired and exercised end to end.
 * Do not flip this without updating pins.rs and verifying Phase 1 CUDA.
 */
export const STOP_AFTER_ABC_ENABLED = false;

export const STOP_AFTER_ABC_MIN_TAG = "v0.8.2";

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
  /** True only when the pin supports stop_after and the flag is on. */
  isEnabled(): boolean;
}

function validateStopAfterAbc(request: StopAfterAbcRequest): void {
  if (request.stopAfter !== "abc") {
    throw new ScoreEngineError(
      "validation_failed",
      `stop_after=${request.stopAfter} hors contrat (abc seulement)`,
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
}

/**
 * Gated client: validates inputs, then refuses until the pin + flag allow it.
 */
export class GatedStopAfterAbcClient implements StopAfterAbcClient {
  constructor(private readonly enabled: boolean = STOP_AFTER_ABC_ENABLED) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  async run(request: StopAfterAbcRequest): Promise<StopAfterAbcResult> {
    validateStopAfterAbc(request);
    if (!this.enabled) {
      throw new ScoreEngineError(
        "not_implemented",
        `stop_after=abc gated: option non câblée dans la commande desktop (audio.cpp ${STOP_AFTER_ABC_MIN_TAG}). ` +
          "La commande doit aussi conserver le score sans attendre de WAV.",
      );
    }
    throw new ScoreEngineError(
      "not_implemented",
      "stop_after=abc : drapeau actif mais câblage serveur non branché — " +
        "passer stop_after dans options de POST /v1/tasks/run",
    );
  }
}

/** @deprecated Prefer GatedStopAfterAbcClient. */
export class StubStopAfterAbcClient extends GatedStopAfterAbcClient {}

export function createStopAfterAbcClient(): StopAfterAbcClient {
  return new GatedStopAfterAbcClient(STOP_AFTER_ABC_ENABLED);
}
