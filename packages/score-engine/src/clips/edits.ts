import { ScoreEngineError } from "../types/errors.js";
import type { Clip, ClipEditRequest } from "../types/clip.js";

/**
 * Clip edit operations (§21.3 / Phase 2 roadmap).
 * Scaffold interfaces — not called by Phase 1.
 */
export interface ClipEditor {
  apply(clips: Clip[], request: ClipEditRequest): Clip[];
}

export class StubClipEditor implements ClipEditor {
  apply(_clips: Clip[], request: ClipEditRequest): Clip[] {
    throw new ScoreEngineError(
      "not_implemented",
      `édition de clip « ${request.kind} » non implémentée (scaffold phase 2)`,
    );
  }
}

export function createClipEditor(): ClipEditor {
  return new StubClipEditor();
}
