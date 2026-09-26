import { ScoreEngineError } from "../types/errors.js";

/**
 * Semantic prefix continuation for mid-song style change (Phase 2–3).
 * Requires audio.cpp export_semantic / semantic_prefix (≥ v0.8.2).
 * @see docs/yue2-ameliorations.md item 3
 */
export type SemanticPrefixFrames = {
  /** 25 Hz codec frames from export_semantic. */
  frames: number[][];
  sampleRateHintHz: 25;
};

export type SemanticPrefixRequest = {
  style: string;
  lyrics: string;
  cot: "full" | "melody" | "off";
  seed: number;
  /** Force the first N semantic frames. */
  semanticPrefix: SemanticPrefixFrames;
  semanticPrefixFile?: string;
};

export interface SemanticPrefixClient {
  continueFromPrefix(
    request: SemanticPrefixRequest,
  ): Promise<{ audioPath: string }>;
}

export class StubSemanticPrefixClient implements SemanticPrefixClient {
  async continueFromPrefix(
    request: SemanticPrefixRequest,
  ): Promise<{ audioPath: string }> {
    if (
      request.semanticPrefix.frames.length === 0 &&
      !request.semanticPrefixFile
    ) {
      throw new ScoreEngineError(
        "validation_failed",
        "semantic_prefix vide",
      );
    }
    throw new ScoreEngineError(
      "not_implemented",
      "semantic_prefix : stub phase 2 — câbler export_semantic / semantic_prefix plus tard",
    );
  }
}

export function createSemanticPrefixClient(): SemanticPrefixClient {
  return new StubSemanticPrefixClient();
}
