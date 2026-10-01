/** État affiché pour l’indicateur de rebake mix (lecture production). */
export type MixBakeStatusPhase = "hidden" | "pending" | "done" | "error";

/**
 * Transition lors d’un changement de `pending` / `failed` (testable sans React).
 * `done` et `error` restent affichés jusqu’à `resetMixBakeDonePhase` / nouveau pending.
 */
export function mixBakeStatusPhaseOnPendingChange(
  phase: MixBakeStatusPhase,
  pending: boolean,
  failed: boolean,
): MixBakeStatusPhase {
  if (pending) return "pending";
  if (failed) return "error";
  if (phase === "pending") return "done";
  if (phase === "error") return "error";
  return phase === "done" ? "done" : "hidden";
}

export function resetMixBakeDonePhase(phase: MixBakeStatusPhase): MixBakeStatusPhase {
  if (phase === "done" || phase === "error") return "hidden";
  return phase;
}
