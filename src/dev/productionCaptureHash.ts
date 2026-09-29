import type { ProductionDensityPreference } from "../lib/productionTrackLayout";

export type CaptureHashPrefs = {
  trackCount: number;
  densityPreference: ProductionDensityPreference;
  rythmiqueCollapsed: boolean;
  /** Fraction 0–1 of song duration for waveform playhead (default 0). */
  progressRatio: number;
};

export function parseCaptureHash(hashRaw: string): CaptureHashPrefs {
  const hash = hashRaw.replace(/^#/, "").toLowerCase();
  const trackCount = hash.includes("16")
    ? 16
    : hash.includes("6")
      ? 6
      : hash.includes("12")
        ? 12
        : 12;

  let densityPreference: ProductionDensityPreference = "auto";
  if (hash.includes("compact")) densityPreference = "compact";
  else if (hash.includes("confortable")) densityPreference = "confortable";
  else if (hash.includes("auto")) densityPreference = "auto";

  const rythmiqueCollapsed = hash.includes("collapsed");

  let progressRatio = 0;
  const mid = hash.match(/(?:midplay|progress)(?:=|:)([\d.]+)/);
  if (mid) {
    progressRatio = Math.max(0, Math.min(1, Number(mid[1])));
  } else if (hash.includes("midplay")) {
    progressRatio = 0.45;
  }

  return { trackCount, densityPreference, rythmiqueCollapsed, progressRatio };
}
