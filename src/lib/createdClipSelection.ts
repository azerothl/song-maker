/** A split can insert its right half before later existing clips. */
export function createdClipId(
  before: readonly { id: string }[],
  after: readonly { id: string; startMs: number }[],
  operation: { kind: "cut"; atMs: number } | { kind: "duplicate" },
): string | null {
  const oldIds = new Set(before.map(clip => clip.id));
  const created = after.filter(clip => !oldIds.has(clip.id));
  return (operation.kind === "cut"
    ? created.find(clip => clip.startMs === operation.atMs)
    : created[created.length-1])?.id ?? null;
}
