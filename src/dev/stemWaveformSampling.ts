/** Positions d’échantillonnage canvas (partie lue / à venir) pour métriques #159. */

const MIN_PLAYHEAD_CLEARANCE_PX = 28;

export function stemWaveformSampleClientXs(
  clientWidth: number,
  progress: number,
  duration: number,
  peakCount: number,
  clearancePx = MIN_PLAYHEAD_CLEARANCE_PX,
): { playheadX: number; playedSampleX: number; unplayedSampleX: number } {
  const w = Math.max(1, clientWidth);
  const peaks = Math.max(1, peakCount);
  const ratio =
    duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0.5;
  const playheadX = ratio * w;
  const barW = w / peaks;
  const inset = barW * 0.42;

  let playedBar = Math.floor((playheadX - clearancePx) / barW);
  while (playedBar >= 0 && (playedBar + 1) * barW > playheadX - 2) {
    playedBar -= 1;
  }
  if (playedBar < 0) playedBar = 0;

  let unplayedBar = Math.ceil((playheadX + clearancePx) / barW);
  while (unplayedBar < peaks && unplayedBar * barW <= playheadX + 2) {
    unplayedBar += 1;
  }
  if (unplayedBar >= peaks) unplayedBar = peaks - 1;

  return {
    playheadX,
    playedSampleX: playedBar * barW + inset,
    unplayedSampleX: unplayedBar * barW + inset,
  };
}

export function rgbDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

/** Cherche un pixel de barre (couleur ≠ fond) à l’abscisse donnée. */
export function pickSolidBarPixelY(
  readPixel: (x: number, y: number) => { r: number; g: number; b: number } | null,
  sampleX: number,
  clientHeight: number,
  bg: { r: number; g: number; b: number },
  minDistance = 18,
): { x: number; y: number; rgb: { r: number; g: number; b: number } } | null {
  const h = Math.max(1, clientHeight);
  const mid = h / 2;
  const order: number[] = [];
  for (let d = 0; d <= mid; d += 1) {
    order.push(mid - d, mid + d);
  }
  for (const y of order) {
    if (y < 0 || y >= h) continue;
    const rgb = readPixel(sampleX, y);
    if (!rgb) continue;
    if (rgbDistance(rgb, bg) >= minDistance) {
      return { x: sampleX, y, rgb };
    }
  }
  return null;
}
