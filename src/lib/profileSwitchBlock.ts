import type { JobStatus } from "./types";

export type ProfileSwitchBlockKind = "generation" | "separation" | "export";

export type ProfileSwitchBlock =
  | { blocked: false }
  | {
      blocked: true;
      kind: ProfileSwitchBlockKind;
    };

/** Active GPU queue states only (not terminal `generated` / `score_only`). */
const GENERATION_STATES = new Set(["queued", "preparing", "generating"]);

const SEPARATION_STATES = new Set(["separating", "importing_tracks"]);

export function profileSwitchBlockReason(
  job: JobStatus | null | undefined,
  exportBusy: boolean,
): ProfileSwitchBlock {
  if (exportBusy) {
    return { blocked: true, kind: "export" };
  }
  const state = job?.state?.trim().toLowerCase() ?? "idle";
  if (state === "idle" || state === "failed" || state === "cancelled") {
    return { blocked: false };
  }
  if (SEPARATION_STATES.has(state)) {
    return { blocked: true, kind: "separation" };
  }
  if (GENERATION_STATES.has(state)) {
    return { blocked: true, kind: "generation" };
  }
  return { blocked: false };
}
