/** Hauteur verticale estimée par mesure avant calibration abcjs. */
export const DEFAULT_PX_PER_BAR = 52;

/** Marge de mesures rendues hors viewport pour éviter les trous au défilement. */
export const OVERSCAN_BARS = 16;

/** Taille minimale d'une fenêtre de rendu (ouverture rapide). */
export const MIN_RENDER_BARS = 20;

/** Plafond de mesures composées d'un coup (scroll / lecture). */
export const MAX_RENDER_BARS = 56;

export type StaffScrollWindow = {
  renderStart: number;
  renderCount: number;
};

export function playbackBarIndex(
  seconds: number,
  barDurationSeconds: number,
): number {
  if (!Number.isFinite(seconds) || barDurationSeconds <= 0) return 0;
  return Math.max(0, Math.floor(seconds / barDurationSeconds));
}

/**
 * Calcule quelle tranche de mesures composer pour un scrollTop donné.
 * Les bornes gardent le coût abcjs indépendant de la longueur totale du morceau.
 */
export function computeStaffScrollWindow(opts: {
  scrollTop: number;
  viewportHeight: number;
  barCount: number;
  pxPerBar: number;
  overscanBars?: number;
  minRenderBars?: number;
  maxRenderBars?: number;
}): StaffScrollWindow {
  const barCount = Math.max(0, opts.barCount);
  if (barCount === 0) {
    return { renderStart: 0, renderCount: 0 };
  }

  const pxPerBar = Math.max(12, opts.pxPerBar);
  const overscan = opts.overscanBars ?? OVERSCAN_BARS;
  const minRender = opts.minRenderBars ?? MIN_RENDER_BARS;
  const maxRender = opts.maxRenderBars ?? MAX_RENDER_BARS;

  const firstVisible = Math.floor(Math.max(0, opts.scrollTop) / pxPerBar);
  const visibleBars = Math.ceil(Math.max(0, opts.viewportHeight) / pxPerBar) + 1;

  let renderCount = Math.max(minRender, visibleBars + 2 * overscan);
  renderCount = Math.min(maxRender, renderCount, barCount);

  let renderStart = Math.max(0, firstVisible - overscan);
  if (renderStart + renderCount > barCount) {
    renderStart = Math.max(0, barCount - renderCount);
  }

  renderCount = Math.min(renderCount, barCount - renderStart);
  return {
    renderStart,
    renderCount: Math.max(1, renderCount),
  };
}

/** Fusionne une nouvelle mesure calibrée avec l'estimation courante. */
export function blendPxPerBar(
  current: number,
  measured: number,
  renderedBars: number,
): number {
  if (!Number.isFinite(measured) || measured <= 0 || renderedBars <= 0) {
    return current;
  }
  const weight = Math.min(0.45, renderedBars / 80);
  return current * (1 - weight) + measured * weight;
}
