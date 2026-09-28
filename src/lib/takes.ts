/**
 * Non-destructive take lanes / simple comping helpers (issue #93).
 */

export type TakeClipFields = {
  takeGroupId?: string | null;
  takeIndex?: number | null;
  takeLabel?: string | null;
  takeActive?: boolean;
};

export function newTakeGroupId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return `takes-${c.randomUUID()}`;
  }
  return `takes-${Date.now().toString(36)}`;
}

/** Activate one take in a group; others stay on the track but silent. */
export function selectActiveTake<T extends TakeClipFields & { id: string }>(
  clips: readonly T[],
  takeGroupId: string,
  activeClipId: string,
): T[] {
  return clips.map((c) => {
    if (c.takeGroupId !== takeGroupId) return c;
    return { ...c, takeActive: c.id === activeClipId };
  });
}

/**
 * Comp region: for clips in the group overlapping [startMs, endMs], keep the
 * chosen take audible in that window by cutting siblings (caller supplies cut).
 * Here we only mark which take should be active globally — region comps are
 * done by cutting clips then selecting active segments.
 */
export function listTakesInGroup<T extends TakeClipFields & { id: string }>(
  clips: readonly T[],
  takeGroupId: string,
): T[] {
  return clips
    .filter((c) => c.takeGroupId === takeGroupId)
    .slice()
    .sort((a, b) => (a.takeIndex ?? 0) - (b.takeIndex ?? 0));
}

export function isAudibleTake(clip: TakeClipFields): boolean {
  if (clip.takeGroupId == null || clip.takeGroupId === "") return true;
  return clip.takeActive !== false;
}
