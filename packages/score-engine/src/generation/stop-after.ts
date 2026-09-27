import { ScoreEngineError } from "../types/errors.js";
import type { CotProfile } from "../types/score-document.js";

/**
 * `stop_after=abc` — produce score without WAV (audio.cpp ≥ v0.8.2).
 * Enabled against the pinned tag; desktop `start_generation` must pass
 * `stop_after` and accept a score-only result (no WAV required).
 * @see docs/yue2-ameliorations.md item 2
 * @see packages/score-engine/STOP_AFTER_ABC.md
 */
export type StopAfterStage = "abc" | "semantic" | "audio";

/**
 * Feature flag — on when the pin is ≥ {@link STOP_AFTER_ABC_MIN_TAG}
 * and the desktop command accepts score-only jobs.
 */
export const STOP_AFTER_ABC_ENABLED = true;

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

/** Options fragment for POST /v1/tasks/run `request.options`. */
export type StopAfterAbcTaskOptions = {
  stop_after: "abc";
};

export type StopAfterAbcResult = {
  /** Relative artifact name written by the desktop after a successful run. */
  scoreAbcPath: string;
  audioPath: null;
  /** Merge into the audio.cpp task options before calling the server. */
  taskOptions: StopAfterAbcTaskOptions;
};

export interface StopAfterAbcClient {
  run(request: StopAfterAbcRequest): Promise<StopAfterAbcResult>;
  /** True only when the pin supports stop_after and the flag is on. */
  isEnabled(): boolean;
}

export function validateStopAfterAbc(request: StopAfterAbcRequest): void {
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
  if (!request.style.trim()) {
    throw new ScoreEngineError("validation_failed", "style requis");
  }
  if (!request.lyrics.trim()) {
    throw new ScoreEngineError("validation_failed", "paroles requises");
  }
}

/**
 * Builds the validated options plan for a score-only generation.
 * Side-effect free — GPU work stays in the desktop Tauri command.
 */
export function planStopAfterAbc(
  request: StopAfterAbcRequest,
): StopAfterAbcResult {
  validateStopAfterAbc(request);
  return {
    scoreAbcPath: "score.abc",
    audioPath: null,
    taskOptions: { stop_after: "abc" },
  };
}

/**
 * Client: validates inputs; when enabled returns a real options plan
 * for the desktop to send to `/v1/tasks/run`.
 */
export class GatedStopAfterAbcClient implements StopAfterAbcClient {
  constructor(private readonly enabled: boolean = STOP_AFTER_ABC_ENABLED) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  async run(request: StopAfterAbcRequest): Promise<StopAfterAbcResult> {
    if (!this.enabled) {
      validateStopAfterAbc(request);
      throw new ScoreEngineError(
        "not_implemented",
        `stop_after=abc gated: option non câblée dans la commande desktop (audio.cpp ${STOP_AFTER_ABC_MIN_TAG}). ` +
          "La commande doit aussi conserver le score sans attendre de WAV.",
      );
    }
    return planStopAfterAbc(request);
  }
}

/** @deprecated Prefer GatedStopAfterAbcClient. */
export class StubStopAfterAbcClient extends GatedStopAfterAbcClient {}

export function createStopAfterAbcClient(): StopAfterAbcClient {
  return new GatedStopAfterAbcClient(STOP_AFTER_ABC_ENABLED);
}
