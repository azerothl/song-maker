import {
  DEFAULT_WAVE_COLOR,
  PRODUCTION_WAVE_TRACK_BG,
  resolveWaveFillColors,
  roleWaveColor,
  WAVE_PLAYHEAD_OUTLINE,
  WAVE_PLAYHEAD_STROKE,
} from "../lib/trackRoleColors";

export type WaveformDrawColors = { unplayed: string; played: string };

export type WaveformFrameParams = {
  peaks: Float32Array;
  progress: number;
  duration: number;
  heightCss: number;
  widthCss: number;
  colors: WaveformDrawColors;
  backdrop: string;
};

export function readCssWaveColors(el: Element | null): {
  wave: string | null;
  played: string | null;
} {
  if (!el) return { wave: null, played: null };
  const style = getComputedStyle(el);
  const wave = style.getPropertyValue("--track-wave").trim();
  const played = style.getPropertyValue("--track-wave-played").trim();
  return {
    wave: wave || null,
    played: played || null,
  };
}

export function readCanvasBackdrop(canvas: HTMLCanvasElement): string {
  const frame = canvas.closest(".waveform-frame");
  if (frame) {
    const bg = getComputedStyle(frame).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      return bg;
    }
  }
  const canvasBg = getComputedStyle(canvas).backgroundColor;
  if (canvasBg && canvasBg !== "rgba(0, 0, 0, 0)" && canvasBg !== "transparent") {
    return canvasBg;
  }
  return PRODUCTION_WAVE_TRACK_BG;
}

export function resolveDrawColors(
  el: Element | null,
  opts: { color?: string; playedColor?: string; role?: string },
): WaveformDrawColors {
  const css = readCssWaveColors(el);
  if (opts.color || opts.playedColor) {
    const base = opts.color ?? css.wave ?? roleWaveColor(opts.role);
    const fills = resolveWaveFillColors(base);
    if (opts.playedColor) {
      return { unplayed: fills.unplayed, played: opts.playedColor };
    }
    return fills;
  }
  if (css.wave) {
    const fills = resolveWaveFillColors(css.wave);
    if (css.played && css.played !== css.wave) {
      return { unplayed: fills.unplayed, played: css.played };
    }
    return fills;
  }
  if (opts.role) {
    return resolveWaveFillColors(roleWaveColor(opts.role));
  }
  return resolveWaveFillColors(DEFAULT_WAVE_COLOR);
}

export function resolveMutedDrawColors(): WaveformDrawColors {
  return {
    unplayed: "rgba(120,120,130,0.35)",
    played: "rgba(160,160,170,0.75)",
  };
}

/** Rendu historique (main) — référence pour les tests de parité pixel. */
export function renderWaveformReferenceFrame(
  canvas: HTMLCanvasElement,
  params: WaveformFrameParams,
): void {
  const dpr = window.devicePixelRatio || 1;
  const width = params.widthCss;
  const height = params.heightCss;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = params.backdrop;
  ctx.fillRect(0, 0, width, height);

  const { peaks, progress, duration, colors } = params;
  const mid = height / 2;
  const barW = width / peaks.length;
  const playedRatio =
    duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const playedX = playedRatio * width;

  ctx.fillStyle = colors.unplayed;
  for (let i = 0; i < peaks.length; i++) {
    const amp = Math.max(1, peaks[i]! * mid * 0.92);
    const x = i * barW;
    ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
  }

  ctx.fillStyle = colors.played;
  for (let i = 0; i < peaks.length; i++) {
    const x = i * barW;
    if (x > playedX) break;
    const amp = Math.max(1, peaks[i]! * mid * 0.92);
    ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
  }

  const playheadX = playedX + 0.5;
  ctx.strokeStyle = WAVE_PLAYHEAD_OUTLINE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();
  ctx.strokeStyle = WAVE_PLAYHEAD_STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, height);
  ctx.stroke();
}

export type WaveformLayerBitmap = {
  unplayed: HTMLCanvasElement;
  widthCss: number;
  heightCss: number;
  deviceWidth: number;
  deviceHeight: number;
  peaks: Float32Array;
  colors: WaveformDrawColors;
};

function paintUnplayedLayer(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  widthCss: number,
  heightCss: number,
  backdrop: string,
  fill: string,
): void {
  const mid = heightCss / 2;
  const barW = widthCss / peaks.length;
  ctx.clearRect(0, 0, widthCss, heightCss);
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, widthCss, heightCss);
  ctx.fillStyle = fill;
  for (let i = 0; i < peaks.length; i++) {
    const amp = Math.max(1, peaks[i]! * mid * 0.92);
    const x = i * barW;
    ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
  }
}

export function buildWaveformLayers(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  heightCss: number,
  colors: WaveformDrawColors,
  backdrop: string,
): WaveformLayerBitmap | null {
  const dpr = window.devicePixelRatio || 1;
  const widthCss = canvas.clientWidth || 300;
  if (widthCss <= 0 || heightCss <= 0) return null;

  const deviceWidth = Math.floor(widthCss * dpr);
  const deviceHeight = Math.floor(heightCss * dpr);

  const makeLayer = () => {
    const layer = document.createElement("canvas");
    layer.width = deviceWidth;
    layer.height = deviceHeight;
    const ctx = layer.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { layer, ctx };
  };

  const unplayed = makeLayer();
  if (!unplayed) return null;

  paintUnplayedLayer(
    unplayed.ctx,
    peaks,
    widthCss,
    heightCss,
    backdrop,
    colors.unplayed,
  );

  return {
    unplayed: unplayed.layer,
    widthCss,
    heightCss,
    deviceWidth,
    deviceHeight,
    peaks,
    colors,
  };
}

export function paintWaveformProgress(
  canvas: HTMLCanvasElement,
  layers: WaveformLayerBitmap,
  progress: number,
  duration: number,
): void {
  const dpr = window.devicePixelRatio || 1;
  const { widthCss, heightCss, deviceWidth, deviceHeight, peaks, colors } =
    layers;
  canvas.width = deviceWidth;
  canvas.height = deviceHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const playedRatio =
    duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const playedX = playedRatio * widthCss;
  const mid = heightCss / 2;
  const barW = widthCss / peaks.length;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layers.unplayed, 0, 0);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors.played;
  for (let i = 0; i < peaks.length; i++) {
    const x = i * barW;
    if (x > playedX) break;
    const amp = Math.max(1, peaks[i]! * mid * 0.92);
    ctx.fillRect(x, mid - amp, Math.max(1, barW * 0.85), amp * 2);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const playheadX = playedX + 0.5;
  ctx.strokeStyle = WAVE_PLAYHEAD_OUTLINE;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, heightCss);
  ctx.stroke();
  ctx.strokeStyle = WAVE_PLAYHEAD_STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playheadX, 0);
  ctx.lineTo(playheadX, heightCss);
  ctx.stroke();
}

export function countImageDataDiff(
  a: ImageData,
  b: ImageData,
  channelTolerance = 0,
): { differingPixels: number; maxChannelDelta: number } {
  if (a.width !== b.width || a.height !== b.height) {
    return { differingPixels: a.width * a.height, maxChannelDelta: 255 };
  }
  let differingPixels = 0;
  let maxChannelDelta = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i]! - b.data[i]!);
    const dg = Math.abs(a.data[i + 1]! - b.data[i + 1]!);
    const db = Math.abs(a.data[i + 2]! - b.data[i + 2]!);
    const da = Math.abs(a.data[i + 3]! - b.data[i + 3]!);
    const max = Math.max(dr, dg, db, da);
    if (max > maxChannelDelta) maxChannelDelta = max;
    if (max > channelTolerance) differingPixels += 1;
  }
  return { differingPixels, maxChannelDelta };
}
