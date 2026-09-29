import type { ProductionDensityPreference } from "../lib/productionTrackLayout";

export type CaptureHashPrefs = {
  trackCount: number;
  densityPreference: ProductionDensityPreference;
  rythmiqueCollapsed: boolean;
  /** Position de lecture au milieu (capture curseur). */
  midPlayback: boolean;
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
  const midPlayback = hash.includes("midplay") || hash.includes("playing");

  return { trackCount, densityPreference, rythmiqueCollapsed, midPlayback };
}
