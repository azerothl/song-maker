import type { MixTrack } from "./types";

export type ProductionTrackDensity = "compact" | "confortable";

export type ProductionDensityPreference = "auto" | ProductionTrackDensity;

export type ProductionViewId = "mix" | "clips" | "tools";

export function effectiveDensityFromPreference(
  preference: ProductionDensityPreference,
  autoResolved: ProductionTrackDensity,
): ProductionTrackDensity {
  return preference === "auto" ? autoResolved : preference;
}

/** Marge pour bordures / arrondis avant de basculer l’auto en compact (#150). */
export const AUTO_DENSITY_OVERFLOW_TOLERANCE_PX = 16;

/** Passe en compact auto uniquement si la liste déborde verticalement. */
export function shouldUseCompactForAutoDensity(
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight > clientHeight + AUTO_DENSITY_OVERFLOW_TOLERANCE_PX;
}

/** Vue mix : chrome resserré pour maximiser la hauteur de la liste (#137, #150). */
export function shouldUseProductionTightLayout(
  productionView: ProductionViewId,
  _density: ProductionTrackDensity,
): boolean {
  return productionView === "mix";
}

export type TrackFamilyId = "voix" | "rythmique" | "harmonie";

const DENSITY_STORAGE_KEY = "song-maker:production-track-density";
const COLLAPSED_STORAGE_KEY = "song-maker:production-groups-collapsed";

const FAMILY_ORDER: TrackFamilyId[] = ["voix", "rythmique", "harmonie"];

export type TrackFamilyGroup = {
  family: TrackFamilyId;
  tracks: MixTrack[];
};

/** Stem roles → famille d’affichage (voix / rythmique / harmonie). */
export function trackFamilyForRole(role: string): TrackFamilyId {
  const r = role.trim().toLowerCase();
  if (r === "vocals" || r === "vocal") return "voix";
  if (r === "drums" || r === "bass" || r === "percussion") return "rythmique";
  return "harmonie";
}

/** Regroupe les pistes en conservant l’ordre du mix dans chaque famille. */
export function buildTrackFamilyGroups(tracks: MixTrack[]): TrackFamilyGroup[] {
  const buckets: Record<TrackFamilyId, MixTrack[]> = {
    voix: [],
    rythmique: [],
    harmonie: [],
  };
  for (const tr of tracks) {
    buckets[trackFamilyForRole(tr.role)].push(tr);
  }
  return FAMILY_ORDER
    .filter((family) => buckets[family].length > 0)
    .map((family) => ({ family, tracks: buckets[family] }));
}

export function loadProductionDensityPreference(): ProductionDensityPreference {
  if (typeof localStorage === "undefined") return "auto";
  try {
    const raw = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (raw === "auto" || raw === "confortable" || raw === "compact") return raw;
  } catch {
    /* private mode */
  }
  return "auto";
}

export function saveProductionDensityPreference(
  preference: ProductionDensityPreference,
): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, preference);
  } catch {
    /* quota */
  }
}

/** @deprecated Utiliser loadProductionDensityPreference */
export function loadProductionTrackDensity(): ProductionTrackDensity {
  const pref = loadProductionDensityPreference();
  return pref === "auto" ? "confortable" : pref;
}

/** @deprecated Utiliser saveProductionDensityPreference */
export function saveProductionTrackDensity(density: ProductionTrackDensity): void {
  saveProductionDensityPreference(density);
}

export function loadCollapsedTrackFamilies(): Record<string, boolean> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveCollapsedTrackFamily(family: string, collapsed: boolean): void {
  if (typeof localStorage === "undefined") return;
  const prev = loadCollapsedTrackFamilies();
  const next = { ...prev, [family]: collapsed };
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
}

/** Pistes guitare / piano issues d’une séparation 6 stems (affichage « * »). */
export function isExperimentalStemTrack(track: MixTrack): boolean {
  if (!track.aiSeparated) return false;
  const r = track.role.trim().toLowerCase();
  return r === "guitar" || r === "piano";
}

export function waveHeightForDensity(density: ProductionTrackDensity): number {
  return density === "confortable" ? 58 : 36;
}

export function groupMutePressed(tracks: MixTrack[]): boolean {
  return tracks.length > 0 && tracks.every((tr) => tr.mute);
}

export function groupSoloPressed(tracks: MixTrack[]): boolean {
  return tracks.length > 0 && tracks.every((tr) => tr.solo);
}
