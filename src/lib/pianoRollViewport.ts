export const PIANO_ROLL_NOTE_OVERSCAN_PX = 960;

/** Pas de quantification du scroll : évite un re-render à chaque pixel. */
export const PIANO_ROLL_SCROLL_QUANTUM_PX = 240;

export type PianoNoteLike = {
  id: string;
  startTick: number;
  durationTick: number;
};

export type PianoNotesIndex<T extends PianoNoteLike> = {
  /** Notes triées par `startTick` croissant. */
  byStart: T[];
  /** Largeur max d’une note (px) pour le bornage binaire. */
  maxSpanPx: number;
  pxPerTick: number;
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

export function buildPianoNotesIndex<T extends PianoNoteLike>(
  notes: T[],
  pxPerTick: number,
): PianoNotesIndex<T> {
  const byStart = notes.slice().sort((a, b) => a.startTick - b.startTick);
  let maxSpanPx = 6;
  for (const n of byStart) {
    const span = Math.max(6, n.durationTick * pxPerTick);
    if (span > maxSpanPx) maxSpanPx = span;
  }
  return { byStart, maxSpanPx, pxPerTick };
}

/** Arrondit le scroll pour ne changer la fenêtre que par pas de quantum. */
export function quantizePianoScrollLeft(
  scrollLeft: number,
  quantumPx = PIANO_ROLL_SCROLL_QUANTUM_PX,
): number {
  if (quantumPx <= 0) return scrollLeft;
  return Math.floor(scrollLeft / quantumPx) * quantumPx;
}

/**
 * Décide si le viewport a assez bougé pour justifier un re-filtre React.
 * Les grands sauts (trackpad / seek) forcent toujours la sync.
 */
export function shouldSyncPianoScrollViewport(
  prev: { left: number; width: number },
  nextLeft: number,
  nextWidth: number,
  opts?: { quantumPx?: number; overscanPx?: number },
): boolean {
  if (nextWidth !== prev.width) return true;
  const overscanPx = opts?.overscanPx ?? PIANO_ROLL_NOTE_OVERSCAN_PX;
  const quantumPx = opts?.quantumPx ?? PIANO_ROLL_SCROLL_QUANTUM_PX;
  if (Math.abs(nextLeft - prev.left) >= overscanPx) return true;
  return (
    quantizePianoScrollLeft(nextLeft, quantumPx) !==
    quantizePianoScrollLeft(prev.left, quantumPx)
  );
}

function lowerBoundByStartPx<T extends PianoNoteLike>(
  byStart: T[],
  winLeft: number,
  pxPerTick: number,
  maxSpanPx: number,
): number {
  const threshold = winLeft - maxSpanPx;
  let lo = 0;
  let hi = byStart.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const left = byStart[mid]!.startTick * pxPerTick;
    if (left < threshold) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function filterNotesInPianoViewportIndexed<T extends PianoNoteLike>(
  index: PianoNotesIndex<T>,
  scrollLeft: number,
  viewportWidth: number,
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
  const { byStart, maxSpanPx, pxPerTick } = index;

  const start = lowerBoundByStartPx(byStart, winLeft, pxPerTick, maxSpanPx);
  const out: T[] = [];
  const pinned = new Set<string>();
  if (selectedId) pinned.add(selectedId);
  if (focusedId) pinned.add(focusedId);

  for (let i = start; i < byStart.length; i++) {
    const n = byStart[i]!;
    const left = n.startTick * pxPerTick;
    if (left > winRight) break;
    const right = left + Math.max(6, n.durationTick * pxPerTick);
    if (right >= winLeft) {
      out.push(n);
      pinned.delete(n.id);
    }
  }

  if (pinned.size > 0) {
    for (const n of byStart) {
      if (pinned.has(n.id)) out.push(n);
    }
  }
  return out;
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
  return filterNotesInPianoViewportIndexed(
    buildPianoNotesIndex(notes, pxPerTick),
    scrollLeft,
    viewportWidth,
    opts,
  );
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
