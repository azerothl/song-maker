import type { ProductionDensityPreference } from "../lib/productionTrackLayout";

export type CaptureHashPrefs = {
  trackCount: number;
  densityPreference: ProductionDensityPreference;
  rythmiqueCollapsed: boolean;
  /** Lecture en cours (capture midplay / stems). */
  midPlayback: boolean;
  /** Position 0–1 dans le morceau. */
  progressRatio: number;
  productionView: "mix" | "clips" | "tools";
  recordOpen: boolean;
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
  } else if (hash.includes("midplay") || hash.includes("playing")) {
    progressRatio = 0.5;
  }

  const midPlayback = progressRatio > 0;

  let productionView: CaptureHashPrefs["productionView"] = "mix";
  if (hash.includes("view-clips") || hash.includes("clips-view")) {
    productionView = "clips";
  } else if (hash.includes("view-tools") || hash.includes("tools-view")) {
    productionView = "tools";
  }

  const recordOpen = hash.includes("record-open");

  return {
    trackCount,
    densityPreference,
    rythmiqueCollapsed,
    midPlayback,
    progressRatio,
    productionView,
    recordOpen,
  };
}
