import { useEffect, useState } from "react";
import type { GridMode, MusicalSubdivision } from "./musicalTime";

export type ProductionClipViewPrefs = {
  snapEnabled: boolean;
  gridMode: GridMode;
  subdivision: MusicalSubdivision;
  zoom: number;
};

export const DEFAULT_PRODUCTION_CLIP_VIEW_PREFS: ProductionClipViewPrefs = {
  snapEnabled: true,
  gridMode: "musical",
  subdivision: 4,
  zoom: 1,
};

export const PRODUCTION_MIX_NARROW_MEDIA = "(max-width: 640px)";

export function useProductionMixLayoutNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(PRODUCTION_MIX_NARROW_MEDIA).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(PRODUCTION_MIX_NARROW_MEDIA);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}
