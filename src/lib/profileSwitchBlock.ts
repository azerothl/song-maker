import type { JobStatus } from "./types";

export type ProfileSwitchBlockKind = "generation" | "separation" | "export";

export type ProfileSwitchBlock =
  | { blocked: false }
  | {
      blocked: true;
      kind: ProfileSwitchBlockKind;
      /** French user-facing sentence (i18n key wired in UI). */
      messageFr: string;
    };

/** Active GPU queue states only (not terminal `generated` / `score_only`). */
const GENERATION_STATES = new Set(["queued", "preparing", "generating"]);

const SEPARATION_STATES = new Set(["separating", "importing_tracks"]);

export function profileSwitchBlockReason(
  job: JobStatus | null | undefined,
  exportBusy: boolean,
): ProfileSwitchBlock {
  if (exportBusy) {
    return {
      blocked: true,
      kind: "export",
      messageFr:
        "Impossible de changer de profil pendant un export. Attendez la fin ou annulez l'opération.",
    };
  }
  const state = job?.state?.trim().toLowerCase() ?? "idle";
  if (state === "idle" || state === "failed" || state === "cancelled") {
    return { blocked: false };
  }
  if (SEPARATION_STATES.has(state)) {
    return {
      blocked: true,
      kind: "separation",
      messageFr:
        "Impossible de changer de profil pendant une séparation. Attendez la fin ou annulez l'opération.",
    };
  }
  if (GENERATION_STATES.has(state)) {
    return {
      blocked: true,
      kind: "generation",
      messageFr:
        "Impossible de changer de profil pendant une génération. Attendez la fin ou annulez l'opération.",
    };
  }
  return { blocked: false };
}
