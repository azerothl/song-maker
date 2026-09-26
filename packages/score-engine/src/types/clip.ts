/**
 * Clip model from §10.5 — fields exist from Phase 1 so Phase 2
 * does not invent a second format. Edits are stubs in this package.
 */
export type Clip = {
  id: string;
  trackId: string;
  sourcePath: string;
  sourceSha256: string;
  startMs: number;
  offsetMs: number;
  durationMs: number;
  gainDb: number;
  fadeInMs: number;
  fadeOutMs: number;
};

export type ClipEditKind =
  | "fade"
  | "trim"
  | "move"
  | "cut"
  | "duplicate";

export type ClipEditRequest =
  | {
      kind: "fade";
      clipId: string;
      fadeInMs?: number;
      fadeOutMs?: number;
    }
  | {
      kind: "trim";
      clipId: string;
      offsetMs: number;
      durationMs: number;
    }
  | {
      kind: "move";
      clipId: string;
      startMs: number;
    }
  | {
      kind: "cut";
      clipId: string;
      atMs: number;
    }
  | {
      kind: "duplicate";
      clipId: string;
      /** Absolute timeline position for the copy. */
      startMs: number;
    };
