import { ScoreEngineError } from "../types/errors.js";
import type { CotProfile } from "../types/score-document.js";

/**
 * Semantic prefix continuation for mid-song style change.
 * Requires audio.cpp export_semantic / semantic_prefix (≥ v0.8.2).
 *
 * score-engine validates parent artefacts and plans the options fragment;
 * the desktop Tauri command `start_generation` (with `continuationGenerationId`)
 * resolves the absolute `semantic_prefix_file` and runs the GPU job.
 *
 * @see packages/score-engine/SEMANTIC_PREFIX.md
 * @see docs/yue2-ameliorations.md item 3
 */
export const SEMANTIC_PREFIX_ENABLED = true;

export const SEMANTIC_PREFIX_MIN_TAG = "v0.8.2";

/** Cadence of YuE2 semantic frames (1 frame ≈ 40 ms). */
export const SEMANTIC_HZ = 25;

export const SEMANTIC_MAX_DURATION_SEC = 900;

export const SEMANTIC_TOKEN_CEILING = SEMANTIC_MAX_DURATION_SEC * SEMANTIC_HZ;

/**
 * Snapshot of the parent generation the desktop already loaded from disk.
 * score-engine does not touch the filesystem.
 */
export type ParentGenerationSemanticState = {
  generationId: string;
  /** From parent `result.json`. */
  semanticTruncated: boolean;
  /**
   * Absolute or project-relative path to `semantic.json`.
   * `null` when the file is missing.
   */
  semanticJsonPath: string | null;
  /** Number of u32 frames parsed from `semantic.json` (0 if missing/invalid). */
  frameCount: number;
  /** Parent `score.abc` exists (required when `cot !== "off"`). */
  hasScoreAbc: boolean;
};

export type SemanticPrefixFrames = {
  /** 25 Hz codec frames from export_semantic. */
  frames: number[][];
  sampleRateHintHz: 25;
};

export type SemanticPrefixRequest = {
  style: string;
  lyrics: string;
  cot: CotProfile;
  seed: number;
  parent: ParentGenerationSemanticState;
  /**
   * Absolute path the desktop will pass to audio.cpp.
   * Defaults to `parent.semanticJsonPath` when omitted.
   */
  semanticPrefixFile?: string;
};

/** Options fragment for POST /v1/tasks/run `request.options`. */
export type SemanticPrefixTaskOptions = {
  semantic_prefix_file: string;
  export_semantic: true;
};

export type SemanticPrefixResult = {
  jobKind: "continuation";
  parentGenerationId: string;
  /** Relative artefact under the parent generation folder. */
  semanticPrefixRelativePath: "semantic.json";
  /** Merge into the audio.cpp task options before calling the server. */
  taskOptions: SemanticPrefixTaskOptions;
  frameCount: number;
  tokenCeiling: number;
  /** GPU work stays in the desktop command — never invent a WAV path here. */
  audioPath: null;
};

export interface SemanticPrefixClient {
  continueFromPrefix(request: SemanticPrefixRequest): Promise<SemanticPrefixResult>;
  /** True when the pin supports semantic_prefix and the desktop path is wired. */
  isEnabled(): boolean;
}

function assertParentGenerationId(generationId: string): void {
  const suffix = generationId.startsWith("gen-")
    ? generationId.slice("gen-".length)
    : "";
  if (!suffix || !/^\d+$/.test(suffix)) {
    throw new ScoreEngineError(
      "validation_failed",
      "Identifiant de génération parent invalide.",
    );
  }
}

/**
 * Validates that a truncated parent generation can be continued.
 * Mirrors the desktop gate in `start_generation`.
 */
export function validateSemanticPrefixContinuation(
  request: SemanticPrefixRequest,
): void {
  if (!request.style.trim()) {
    throw new ScoreEngineError("validation_failed", "style requis");
  }
  if (!request.lyrics.trim()) {
    throw new ScoreEngineError("validation_failed", "paroles requises");
  }
  assertParentGenerationId(request.parent.generationId);

  if (!request.parent.semanticJsonPath) {
    throw new ScoreEngineError(
      "validation_failed",
      "Cette génération n’a pas d’artefact sémantique utilisable pour continuer.",
    );
  }
  if (!request.parent.semanticTruncated) {
    throw new ScoreEngineError(
      "validation_failed",
      "La continuation est réservée aux générations tronquées.",
    );
  }
  if (request.parent.frameCount <= 0) {
    throw new ScoreEngineError(
      "validation_failed",
      "Tokens de continuation invalides : préfixe sémantique vide",
    );
  }
  if (request.parent.frameCount >= SEMANTIC_TOKEN_CEILING) {
    throw new ScoreEngineError(
      "validation_failed",
      "Cette prise a déjà atteint la durée maximale prévue pour YuE2.",
    );
  }
  if (request.cot !== "off" && !request.parent.hasScoreAbc) {
    throw new ScoreEngineError(
      "validation_failed",
      "Cette continuation en mode mélodie nécessite le score ABC de la prise source.",
    );
  }
}

/**
 * Builds the validated options plan for a mid-song continuation.
 * Side-effect free — GPU work stays in the desktop Tauri command.
 */
export function planSemanticPrefixContinuation(
  request: SemanticPrefixRequest,
): SemanticPrefixResult {
  validateSemanticPrefixContinuation(request);
  const semanticPrefixFile =
    request.semanticPrefixFile?.trim() ||
    request.parent.semanticJsonPath ||
    "";
  if (!semanticPrefixFile) {
    throw new ScoreEngineError(
      "validation_failed",
      "Cette génération n’a pas d’artefact sémantique utilisable pour continuer.",
    );
  }
  return {
    jobKind: "continuation",
    parentGenerationId: request.parent.generationId,
    semanticPrefixRelativePath: "semantic.json",
    taskOptions: {
      semantic_prefix_file: semanticPrefixFile,
      export_semantic: true,
    },
    frameCount: request.parent.frameCount,
    tokenCeiling: SEMANTIC_TOKEN_CEILING,
    audioPath: null,
  };
}

/**
 * Client: validates parent artefacts; when enabled returns a real options plan
 * for the desktop to send to `/v1/tasks/run` via `continuationGenerationId`.
 */
export class DesktopSemanticPrefixClient implements SemanticPrefixClient {
  constructor(private readonly enabled: boolean = SEMANTIC_PREFIX_ENABLED) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  async continueFromPrefix(
    request: SemanticPrefixRequest,
  ): Promise<SemanticPrefixResult> {
    if (!this.enabled) {
      validateSemanticPrefixContinuation(request);
      throw new ScoreEngineError(
        "not_implemented",
        `semantic_prefix gated: option non câblée dans la commande desktop (audio.cpp ${SEMANTIC_PREFIX_MIN_TAG}).`,
      );
    }
    return planSemanticPrefixContinuation(request);
  }
}

/** @deprecated Prefer DesktopSemanticPrefixClient — alias kept for older imports. */
export class StubSemanticPrefixClient extends DesktopSemanticPrefixClient {}

export function createSemanticPrefixClient(): SemanticPrefixClient {
  return new DesktopSemanticPrefixClient(SEMANTIC_PREFIX_ENABLED);
}
