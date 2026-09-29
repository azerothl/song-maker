/** Mesures DOM + canvas des couleurs stem (pastille = waveform). */

import {
  STEM_CONTRAST_ROLES,
  TRACK_ROLE_COLORS,
  WAVE_UNPLAYED_ALPHA,
  WAVE_PLAYED_VS_UNPLAYED_MIN,
  WCAG_UI_CONTRAST_MIN,
  blendOverBackground,
  contrastRatio,
  parseCssColor,
  playedStemColorHsl,
} from "../lib/trackRoleColors";

function rgbToHex(rgb: string): string | null {
  const parsed = parseCssColor(rgb);
  if (!parsed) return null;
  return `#${[parsed.r, parsed.g, parsed.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function readCanvasPixel(canvas: HTMLCanvasElement, x: number, y: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const dpr = canvas.width / (canvas.clientWidth || 1);
  const px = Math.floor(x * dpr);
  const py = Math.floor(y * dpr);
  const d = ctx.getImageData(px, py, 1, 1).data;
  return { r: d[0]!, g: d[1]!, b: d[2]! };
}

export type StemDomMetrics = {
  role: string;
  stripHex: string | null;
  waveVarRaw: string;
  waveBaseHex: string | null;
  stripMatchesWave: boolean;
  canvasBgHex: string | null;
  unplayedPixelHex: string | null;
  playedPixelHex: string | null;
  unplayedContrastOnBg: number;
  playedVsUnplayedContrast: number;
  upcomingPass: boolean;
  playedVsUnplayedPass: boolean;
  importedTrackName?: string;
};

function metricsForRow(row: Element, role: string): StemDomMetrics | null {
  const strip = row.querySelector(".production-mix-strip");
  const canvas = row.querySelector(".production-mix-wave .waveform-canvas") as
    | HTMLCanvasElement
    | null;
  if (!strip || !canvas) return null;

  const rowStyle = getComputedStyle(row);
  const stripStyle = getComputedStyle(strip);
  const canvasStyle = getComputedStyle(canvas);

  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;width:1px;height:1px;pointer-events:none;background:var(--track-wave)";
  row.appendChild(probe);
  const waveBaseHex = rgbToHex(getComputedStyle(probe).backgroundColor);
  probe.remove();

  const stripHex = rgbToHex(stripStyle.backgroundColor);
  const frame = canvas.closest(".waveform-frame");
  const frameBg = frame ? getComputedStyle(frame).backgroundColor : "";
  const canvasBgHex =
    rgbToHex(frameBg) ?? rgbToHex(canvasStyle.backgroundColor) ?? "#171320";
  const bg = canvasBgHex;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const progress = Number(canvas.getAttribute("aria-valuenow") ?? "0");
  const duration = Number(canvas.getAttribute("aria-valuemax") ?? "1");
  const ratio = duration > 0 ? progress / duration : 0.5;
  const playX = Math.max(4, Math.min(w - 4, w * ratio));

  const sampleY = Math.max(4, h * 0.35);
  const unplayedPx = readCanvasPixel(canvas, Math.max(2, playX - 16), sampleY);
  const playedPx = readCanvasPixel(canvas, Math.max(2, playX - 6), sampleY);

  const unplayedPixelHex = unplayedPx
    ? `#${[unplayedPx.r, unplayedPx.g, unplayedPx.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`
    : null;
  const playedPixelHex = playedPx
    ? `#${[playedPx.r, playedPx.g, playedPx.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`
    : null;

  const base = waveBaseHex ?? TRACK_ROLE_COLORS[role] ?? null;
  const upcomingComposite =
    base != null ? blendOverBackground(base, bg, WAVE_UNPLAYED_ALPHA) : bg;
  const playedExpected = base != null ? playedStemColorHsl(base) : bg;

  const theoreticalUpcomingContrast = contrastRatio(upcomingComposite, bg);
  const pixelUpcomingContrast =
    unplayedPixelHex != null ? contrastRatio(unplayedPixelHex, bg) : 0;
  const unplayedContrastOnBg = Math.max(theoreticalUpcomingContrast, pixelUpcomingContrast);

  const theoreticalPlayedContrast = contrastRatio(playedExpected, upcomingComposite);
  const pixelPlayedContrast =
    playedPixelHex && unplayedPixelHex
      ? contrastRatio(playedPixelHex, unplayedPixelHex)
      : 0;
  const playedVsUnplayedContrast = Math.max(theoreticalPlayedContrast, pixelPlayedContrast);

  const label = row.querySelector(".production-mix-track-label");
  const importedTrackName = label?.textContent?.trim();

  return {
    role,
    stripHex,
    waveVarRaw: rowStyle.getPropertyValue("--track-wave").trim(),
    waveBaseHex,
    stripMatchesWave: Boolean(stripHex && waveBaseHex && stripHex === waveBaseHex),
    canvasBgHex,
    unplayedPixelHex,
    playedPixelHex,
    unplayedContrastOnBg: Math.round(unplayedContrastOnBg * 100) / 100,
    playedVsUnplayedContrast: Math.round(playedVsUnplayedContrast * 100) / 100,
    upcomingPass: unplayedContrastOnBg >= WCAG_UI_CONTRAST_MIN,
    playedVsUnplayedPass: playedVsUnplayedContrast >= WAVE_PLAYED_VS_UNPLAYED_MIN,
    importedTrackName,
  };
}

export function measureProductionStemColors(): {
  bg0: string;
  stems: StemDomMetrics[];
  collapsedGroupSample: StemDomMetrics | null;
} {
  const bg0 =
    rgbToHex(
      getComputedStyle(document.documentElement).getPropertyValue("--bg0").trim() ||
        getComputedStyle(document.documentElement).backgroundColor,
    ) ?? "#0c0e18";

  const stems: StemDomMetrics[] = [];
  for (const role of STEM_CONTRAST_ROLES) {
    const row = document.querySelector(`.production-mix-row[data-role="${role}"]`);
    if (!row) continue;
    const m = metricsForRow(row, role);
    if (m) stems.push(m);
  }

  const pianoRow = document.querySelector('.production-mix-row[data-role="piano"]');
  const guitarRow = document.querySelector('.production-mix-row[data-role="guitar"]');
  if (pianoRow && !stems.some((s) => s.role === "piano")) {
    const m = metricsForRow(pianoRow, "piano");
    if (m) stems.push(m);
  }
  if (guitarRow && !stems.some((s) => s.role === "guitar")) {
    const m = metricsForRow(guitarRow, "guitar");
    if (m) stems.push(m);
  }

  let collapsedGroupSample: StemDomMetrics | null = null;
  const hiddenGroup = document.querySelector(
    ".production-mix-group-tracks[hidden] .production-mix-row",
  );
  if (hiddenGroup) {
    collapsedGroupSample = metricsForRow(hiddenGroup, hiddenGroup.getAttribute("data-role") ?? "other");
  }

  return { bg0, stems, collapsedGroupSample };
}
