import {
  createMixProductionToolkit,
  type AutomationPoint,
  type EffectKind,
  type MixProductionToolkit,
  type SidechainRoute,
  type TrackEffectSlot,
} from "@song-maker/mix-production";

const STORAGE_PREFIX = "song-maker:production:";

/** Effects exposed in the UI — reverb is intentionally omitted (DSP no-op). */
export const UI_EFFECT_KINDS = ["limiter", "compressor", "eq"] as const;
export type UiEffectKind = (typeof UI_EFFECT_KINDS)[number];

export type ProductionOverlay = {
  mixId: string;
  volumePointsByTrack: Record<string, AutomationPoint[]>;
  panPointsByTrack: Record<string, AutomationPoint[]>;
  effectsByTrack: Record<string, TrackEffectSlot[]>;
  sidechainRoutes: SidechainRoute[];
};

type Listener = () => void;

let overlay: ProductionOverlay | null = null;
let toolkit: MixProductionToolkit = createMixProductionToolkit();
const listeners = new Set<Listener>();

function notify() {
  for (const fn of listeners) fn();
}

function storageKey(mixId: string): string {
  return `${STORAGE_PREFIX}${mixId}`;
}

function emptyOverlay(mixId: string): ProductionOverlay {
  return {
    mixId,
    volumePointsByTrack: {},
    panPointsByTrack: {},
    effectsByTrack: {},
    sidechainRoutes: [],
  };
}

function isUiEffectKind(kind: string): kind is UiEffectKind {
  return (UI_EFFECT_KINDS as readonly string[]).includes(kind);
}

function normalizeEffect(raw: unknown): TrackEffectSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.kind !== "string") return null;
  if (!isUiEffectKind(o.kind)) return null;
  return {
    id: o.id,
    kind: o.kind as EffectKind,
    enabled: Boolean(o.enabled),
    params:
      o.params && typeof o.params === "object"
        ? (o.params as Record<string, number | string | boolean>)
        : {},
  };
}

function normalizeRoute(raw: unknown): SidechainRoute | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.sourceTrackId !== "string" ||
    typeof o.destinationTrackId !== "string"
  ) {
    return null;
  }
  return {
    id: o.id,
    sourceTrackId: o.sourceTrackId,
    destinationTrackId: o.destinationTrackId,
    thresholdDb:
      typeof o.thresholdDb === "number" && Number.isFinite(o.thresholdDb)
        ? o.thresholdDb
        : -24,
    ratio:
      typeof o.ratio === "number" && Number.isFinite(o.ratio) ? o.ratio : 4,
    enabled: Boolean(o.enabled),
  };
}

function normalizePoints(raw: unknown): AutomationPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: AutomationPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    if (typeof o.timeMs !== "number" || typeof o.value !== "number") continue;
    if (!Number.isFinite(o.timeMs) || !Number.isFinite(o.value)) continue;
    out.push({ timeMs: o.timeMs, value: o.value });
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

export function normalizeProductionOverlay(
  raw: unknown,
  mixId: string,
): ProductionOverlay {
  const base = emptyOverlay(mixId);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;

  const volumePointsByTrack: Record<string, AutomationPoint[]> = {};
  if (o.volumePointsByTrack && typeof o.volumePointsByTrack === "object") {
    for (const [k, v] of Object.entries(
      o.volumePointsByTrack as Record<string, unknown>,
    )) {
      volumePointsByTrack[k] = normalizePoints(v);
    }
  }

  const panPointsByTrack: Record<string, AutomationPoint[]> = {};
  if (o.panPointsByTrack && typeof o.panPointsByTrack === "object") {
    for (const [k, v] of Object.entries(
      o.panPointsByTrack as Record<string, unknown>,
    )) {
      panPointsByTrack[k] = normalizePoints(v);
    }
  }

  const effectsByTrack: Record<string, TrackEffectSlot[]> = {};
  if (o.effectsByTrack && typeof o.effectsByTrack === "object") {
    for (const [k, v] of Object.entries(
      o.effectsByTrack as Record<string, unknown>,
    )) {
      if (!Array.isArray(v)) continue;
      effectsByTrack[k] = v
        .map(normalizeEffect)
        .filter((e): e is TrackEffectSlot => e != null);
    }
  }

  // Legacy boolean flags → per-track effects / default sidechain route.
  const legacyTrackIds = [
    "trk-vocals",
    "trk-drums",
    "trk-bass",
    "trk-other",
    "trk-guitar",
    "trk-piano",
    ...Object.keys(volumePointsByTrack),
  ];
  if (o.compressorEnabled === true) {
    for (const trackId of legacyTrackIds) {
      const list = effectsByTrack[trackId] ?? [];
      if (!list.some((e) => e.kind === "compressor")) {
        list.push({
          id: `comp-${trackId}`,
          kind: "compressor",
          enabled: true,
          params: { thresholdDb: -18, ratio: 3, makeupDb: 0 },
        });
      }
      effectsByTrack[trackId] = list;
    }
  }
  if (o.limiterEnabled === true) {
    for (const trackId of legacyTrackIds) {
      const list = effectsByTrack[trackId] ?? [];
      if (!list.some((e) => e.kind === "limiter")) {
        list.push({
          id: `lim-${trackId}`,
          kind: "limiter",
          enabled: true,
          params: { ceilingDb: -1 },
        });
      }
      effectsByTrack[trackId] = list;
    }
  }

  let sidechainRoutes: SidechainRoute[] = [];
  if (Array.isArray(o.sidechainRoutes)) {
    sidechainRoutes = o.sidechainRoutes
      .map(normalizeRoute)
      .filter((r): r is SidechainRoute => r != null);
  } else if (o.sidechainEnabled === true) {
    sidechainRoutes = [
      {
        id: "sc-drums-other",
        sourceTrackId: "trk-drums",
        destinationTrackId: "trk-other",
        thresholdDb: -24,
        ratio: 4,
        enabled: true,
      },
    ];
  }

  return {
    mixId,
    volumePointsByTrack,
    panPointsByTrack,
    effectsByTrack,
    sidechainRoutes,
  };
}

function persistOverlay(next: ProductionOverlay | null) {
  if (typeof localStorage === "undefined") return;
  if (!next) return;
  try {
    localStorage.setItem(storageKey(next.mixId), JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore.
  }
}

export function loadProductionOverlay(mixId: string): ProductionOverlay | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(mixId));
    if (!raw) return null;
    return normalizeProductionOverlay(JSON.parse(raw), mixId);
  } catch {
    return null;
  }
}

function rebuildToolkit() {
  toolkit = createMixProductionToolkit();
  if (!overlay) return;
  const mixId = overlay.mixId;

  for (const [trackId, points] of Object.entries(overlay.volumePointsByTrack)) {
    if (points.length === 0) continue;
    toolkit.automation.setLane(mixId, {
      trackId,
      target: "volume",
      points,
    });
  }

  for (const [trackId, points] of Object.entries(overlay.panPointsByTrack)) {
    if (points.length === 0) continue;
    toolkit.automation.setLane(mixId, {
      trackId,
      target: "pan",
      points,
    });
  }

  for (const [trackId, effects] of Object.entries(overlay.effectsByTrack)) {
    for (const slot of effects) {
      if (!isUiEffectKind(slot.kind)) continue;
      toolkit.effects.insert(trackId, slot);
    }
  }

  for (const route of overlay.sidechainRoutes) {
    if (route.sourceTrackId === route.destinationTrackId) continue;
    toolkit.sidechain.upsert(mixId, route);
  }
}

export function getProductionToolkit(): MixProductionToolkit {
  return toolkit;
}

export function getProductionOverlay(): ProductionOverlay | null {
  return overlay;
}

export function subscribeProduction(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setProductionOverlay(next: ProductionOverlay | null) {
  overlay = next;
  rebuildToolkit();
  persistOverlay(next);
  notify();
}

export function ensureProductionOverlay(mixId: string): ProductionOverlay {
  if (overlay?.mixId === mixId) return overlay;
  const loaded = loadProductionOverlay(mixId);
  const next = loaded ?? emptyOverlay(mixId);
  overlay = next;
  rebuildToolkit();
  notify();
  return next;
}

export function patchProductionOverlay(
  patch: Partial<Omit<ProductionOverlay, "mixId">> & { mixId: string },
) {
  const base: ProductionOverlay =
    overlay?.mixId === patch.mixId
      ? overlay
      : (loadProductionOverlay(patch.mixId) ?? emptyOverlay(patch.mixId));

  overlay = {
    ...base,
    ...patch,
    mixId: patch.mixId,
    volumePointsByTrack: {
      ...base.volumePointsByTrack,
      ...(patch.volumePointsByTrack ?? {}),
    },
    panPointsByTrack: {
      ...base.panPointsByTrack,
      ...(patch.panPointsByTrack ?? {}),
    },
    effectsByTrack: {
      ...base.effectsByTrack,
      ...(patch.effectsByTrack ?? {}),
    },
    sidechainRoutes: patch.sidechainRoutes ?? base.sidechainRoutes,
  };
  rebuildToolkit();
  persistOverlay(overlay);
  notify();
}

/** Replace the full effects list for one track (order = insert order). */
export function setTrackEffects(mixId: string, trackId: string, effects: TrackEffectSlot[]) {
  patchProductionOverlay({
    mixId,
    effectsByTrack: { [trackId]: effects.filter((e) => isUiEffectKind(e.kind)) },
  });
}

export function setSidechainRoutes(mixId: string, routes: SidechainRoute[]) {
  const cleaned = routes.filter((r) => r.sourceTrackId !== r.destinationTrackId);
  patchProductionOverlay({ mixId, sidechainRoutes: cleaned });
}

export function productionIsActive(): boolean {
  if (!overlay) return false;
  const hasVol = Object.values(overlay.volumePointsByTrack).some(
    (p) => p.length > 0,
  );
  const hasPan = Object.values(overlay.panPointsByTrack).some(
    (p) => p.length > 0,
  );
  const hasFx = Object.values(overlay.effectsByTrack).some((fx) =>
    fx.some((e) => e.enabled && isUiEffectKind(e.kind)),
  );
  const hasSc = overlay.sidechainRoutes.some((r) => r.enabled);
  return hasVol || hasPan || hasFx || hasSc;
}

export function defaultEffectParams(kind: UiEffectKind): Record<string, number> {
  switch (kind) {
    case "limiter":
      return { ceilingDb: -1 };
    case "compressor":
      return { thresholdDb: -18, ratio: 3, makeupDb: 0 };
    case "eq":
      return { gainDb: 0 };
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function newEffectId(kind: UiEffectKind): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return `${kind}-${c.randomUUID()}`;
  }
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
