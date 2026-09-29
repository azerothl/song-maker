/** Mesures DOM + canvas des couleurs stem (pastille = waveform). */

import {
  STEM_CONTRAST_ROLES,
  WAVE_PLAYED_VS_UNPLAYED_MIN,
  WCAG_UI_CONTRAST_MIN,
  contrastRatio,
  parseCssColor,
} from "../lib/trackRoleColors";
import {
  pickSolidBarPixelY,
  stemWaveformSampleClientXs,
} from "./stemWaveformSampling";

function rgbToHex(rgb: string): string | null {
  const parsed = parseCssColor(rgb);
  if (!parsed) return null;
  return `#${[parsed.r, parsed.g, parsed.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function rgbObjToHex(rgb: { r: number; g: number; b: number }): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
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
  /** Pixel barre pleine — partie à venir (à droite du curseur). */
  unplayedPixelHex: string | null;
  /** Pixel barre pleine — partie lue (à gauche du curseur). */
  playedPixelHex: string | null;
  /** Contraste partie à venir (pixel) sur fond canvas. */
  upcomingContrastOnBg: number;
  /** Contraste pixel lue vs pixel à venir. */
  playedVsUnplayedContrast: number;
  upcomingPass: boolean;
  playedVsUnplayedPass: boolean;
  importedTrackName?: string;
  groupFamily?: string;
};

function parseBgRgb(hexOrCss: string): { r: number; g: number; b: number } {
  const parsed = parseCssColor(hexOrCss);
  return parsed ?? { r: 23, g: 19, b: 32 };
}

function metricsForRow(row: Element, role: string, extra?: Partial<StemDomMetrics>): StemDomMetrics | null {
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
  const bgRgb = parseBgRgb(canvasBgHex);

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const progress = Number(canvas.getAttribute("aria-valuenow") ?? "0");
  const duration = Number(canvas.getAttribute("aria-valuemax") ?? "1");
  const peakCount = Number(canvas.getAttribute("data-peak-count") ?? "0") || 200;
  const { playedSampleX, unplayedSampleX } = stemWaveformSampleClientXs(
    w,
    progress,
    duration,
    peakCount,
  );

  const readAt = (x: number, y: number) => readCanvasPixel(canvas, x, y);

  const unplayedPick = pickSolidBarPixelY(readAt, unplayedSampleX, h, bgRgb);
  const playedPick = pickSolidBarPixelY(readAt, playedSampleX, h, bgRgb);

  const unplayedPixelHex = unplayedPick ? rgbObjToHex(unplayedPick.rgb) : null;
  const playedPixelHex = playedPick ? rgbObjToHex(playedPick.rgb) : null;

  const upcomingContrastOnBg =
    unplayedPixelHex != null
      ? Math.round(contrastRatio(unplayedPixelHex, canvasBgHex) * 100) / 100
      : 0;

  const playedVsUnplayedContrast =
    playedPixelHex && unplayedPixelHex
      ? Math.round(contrastRatio(playedPixelHex, unplayedPixelHex) * 100) / 100
      : 0;

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
    upcomingContrastOnBg,
    playedVsUnplayedContrast,
    upcomingPass: upcomingContrastOnBg >= WCAG_UI_CONTRAST_MIN,
    playedVsUnplayedPass: playedVsUnplayedContrast >= WAVE_PLAYED_VS_UNPLAYED_MIN,
    importedTrackName,
    ...extra,
  };
}

function measureCollapsedRythmiqueRow(): StemDomMetrics | null {
  const collapsedTracks =
    document.querySelector(
      "#production-group-rythmique.production-mix-group-tracks--measure-offscreen",
    ) ??
    document.querySelector("#production-group-rythmique.production-mix-group-tracks[hidden]");
  const row = collapsedTracks?.querySelector(".production-mix-row[data-role]");
  if (!row) return null;
  const role = row.getAttribute("data-role") ?? "drums";
  return metricsForRow(row, role, { groupFamily: "rythmique" });
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

  function visibleRoleRow(role: string): Element | null {
    const rows = Array.from(
      document.querySelectorAll(`.production-mix-row[data-role="${role}"]`),
    );
    for (const row of rows) {
      if (!row.closest("[hidden]")) return row;
    }
    return null;
  }

  const stems: StemDomMetrics[] = [];
  for (const role of STEM_CONTRAST_ROLES) {
    const row = visibleRoleRow(role);
    if (!row) continue;
    const m = metricsForRow(row, role);
    if (m) stems.push(m);
  }

  const pianoRow = visibleRoleRow("piano");
  const guitarRow = visibleRoleRow("guitar");
  if (pianoRow && !stems.some((s) => s.role === "piano")) {
    const m = metricsForRow(pianoRow, "piano");
    if (m) stems.push(m);
  }
  if (guitarRow && !stems.some((s) => s.role === "guitar")) {
    const m = metricsForRow(guitarRow, "guitar");
    if (m) stems.push(m);
  }

  const collapsedGroupSample = measureCollapsedRythmiqueRow();

  return { bg0, stems, collapsedGroupSample };
}
