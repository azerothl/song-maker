import { ScoreEngineError } from "../types/errors.js";
import type { Clip, ClipEditRequest } from "../types/clip.js";

/**
 * Clip edit operations (§21.3 / Phase 2).
 * Pure data transforms on the Clip model shared with the mix (§10.5).
 */
export interface ClipEditor {
  apply(clips: Clip[], request: ClipEditRequest): Clip[];
}

/** Browser + Node safe id (no node:crypto — package is aliased into Vite). */
function newClipId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function findClip(clips: Clip[], clipId: string): Clip {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) {
    throw new ScoreEngineError(
      "validation_failed",
      `clip introuvable: ${clipId}`,
    );
  }
  return clip;
}

function clampNonNeg(n: number, label: string): number {
  if (!Number.isFinite(n) || n < 0) {
    throw new ScoreEngineError(
      "validation_failed",
      `${label} doit être ≥ 0`,
    );
  }
  return Math.floor(n);
}

function assertFadeFit(clip: Clip): void {
  if (clip.fadeInMs + clip.fadeOutMs > clip.durationMs) {
    throw new ScoreEngineError(
      "validation_failed",
      `fondus trop longs pour la durée du clip (${clip.id})`,
    );
  }
}

function replaceClip(clips: Clip[], next: Clip): Clip[] {
  return clips.map((c) => (c.id === next.id ? next : c));
}

export class DefaultClipEditor implements ClipEditor {
  apply(clips: Clip[], request: ClipEditRequest): Clip[] {
    switch (request.kind) {
      case "fade": {
        const clip = findClip(clips, request.clipId);
        const next: Clip = {
          ...clip,
          fadeInMs:
            request.fadeInMs !== undefined
              ? clampNonNeg(request.fadeInMs, "fadeInMs")
              : clip.fadeInMs,
          fadeOutMs:
            request.fadeOutMs !== undefined
              ? clampNonNeg(request.fadeOutMs, "fadeOutMs")
              : clip.fadeOutMs,
        };
        assertFadeFit(next);
        return replaceClip(clips, next);
      }
      case "trim": {
        const clip = findClip(clips, request.clipId);
        const offsetMs = clampNonNeg(request.offsetMs, "offsetMs");
        const durationMs = clampNonNeg(request.durationMs, "durationMs");
        if (durationMs === 0) {
          throw new ScoreEngineError(
            "validation_failed",
            "durationMs doit être > 0",
          );
        }
        const next: Clip = {
          ...clip,
          offsetMs,
          durationMs,
          fadeInMs: Math.min(clip.fadeInMs, durationMs),
          fadeOutMs: Math.min(clip.fadeOutMs, durationMs),
        };
        assertFadeFit(next);
        return replaceClip(clips, next);
      }
      case "move": {
        const clip = findClip(clips, request.clipId);
        const next: Clip = {
          ...clip,
          startMs: clampNonNeg(request.startMs, "startMs"),
        };
        return replaceClip(clips, next);
      }
      case "cut": {
        const clip = findClip(clips, request.clipId);
        const atMs = clampNonNeg(request.atMs, "atMs");
        if (atMs <= clip.startMs || atMs >= clip.startMs + clip.durationMs) {
          throw new ScoreEngineError(
            "validation_failed",
            "cut atMs doit être à l’intérieur du clip",
          );
        }
        const leftDur = atMs - clip.startMs;
        const rightDur = clip.durationMs - leftDur;
        const left: Clip = {
          ...clip,
          durationMs: leftDur,
          fadeOutMs: Math.min(clip.fadeOutMs, leftDur),
        };
        assertFadeFit(left);
        const right: Clip = {
          ...clip,
          id: newClipId(),
          startMs: atMs,
          offsetMs: clip.offsetMs + leftDur,
          durationMs: rightDur,
          fadeInMs: Math.min(clip.fadeInMs, rightDur),
          fadeOutMs: Math.min(clip.fadeOutMs, rightDur),
        };
        assertFadeFit(right);
        return clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c]));
      }
      case "duplicate": {
        const clip = findClip(clips, request.clipId);
        const copy: Clip = {
          ...clip,
          id: newClipId(),
          startMs: clampNonNeg(request.startMs, "startMs"),
        };
        return [...clips, copy];
      }
      default: {
        const _exhaustive: never = request;
        throw new ScoreEngineError(
          "validation_failed",
          `édition de clip inconnue: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  }
}

/** @deprecated Prefer DefaultClipEditor — kept as alias for older imports. */
export class StubClipEditor extends DefaultClipEditor {}

export function createClipEditor(): ClipEditor {
  return new DefaultClipEditor();
}
