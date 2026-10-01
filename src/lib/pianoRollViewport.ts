export const PIANO_ROLL_NOTE_OVERSCAN_PX = 960;

export type PianoNoteLike = {
  id: string;
  startTick: number;
  durationTick: number;
};

export function noteHorizontalSpanPx(
  startTick: number,
  durationTick: number,
  pxPerTick: number,
): { left: number; right: number } {
  const left = startTick * pxPerTick;
  const right = left + Math.max(6, durationTick * pxPerTick);
  return { left, right };
}

export function filterNotesInPianoViewport<T extends PianoNoteLike>(
  notes: T[],
  scrollLeft: number,
  viewportWidth: number,
  pxPerTick: number,
  opts?: {
    selectedId?: string | null;
    focusedId?: string | null;
    overscanPx?: number;
  },
): T[] {
  const overscanPx = opts?.overscanPx ?? PIANO_ROLL_NOTE_OVERSCAN_PX;
  const winLeft = scrollLeft - overscanPx;
  const winRight = scrollLeft + viewportWidth + overscanPx;
  const selectedId = opts?.selectedId ?? null;
  const focusedId = opts?.focusedId ?? null;

  return notes.filter((n) => {
    if (selectedId && n.id === selectedId) return true;
    if (focusedId && n.id === focusedId) return true;
    const { left, right } = noteHorizontalSpanPx(
      n.startTick,
      n.durationTick,
      pxPerTick,
    );
    return right >= winLeft && left <= winRight;
  });
}

export function filterSectionMarkersInPianoViewport<
  T extends { id: string; startTick: number },
>(
  sections: T[],
  scrollLeft: number,
  viewportWidth: number,
  pxPerTick: number,
  overscanPx = PIANO_ROLL_NOTE_OVERSCAN_PX,
): T[] {
  const winLeft = scrollLeft - overscanPx;
  const winRight = scrollLeft + viewportWidth + overscanPx;
  return sections.filter((s) => {
    const x = s.startTick * pxPerTick;
    return x >= winLeft && x <= winRight;
  });
}
