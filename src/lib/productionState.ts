import {
  createMixProductionToolkit,
  validateRoutingGraph,
  type AutomationPoint,
  type EffectKind,
  type MixBus,
  type MixProductionToolkit,
  type MixSend,
  type SidechainRoute,
  type TrackEffectSlot,
} from "@song-maker/mix-production";
import { createToolkitFromProductionOverlay } from "./productionToolkitSnapshot";

const STORAGE_PREFIX = "song-maker:production:";
const OVERLAY_UNDO_CAP = 100;

/** Effects exposed in the UI (custom stays host-extension only). */
export const UI_EFFECT_KINDS = [
  "limiter",
  "compressor",
  "gate",
  "eq",
  "parametricEq",
  "filter",
  "delay",
  "reverb",
  "pitch_correct",
] as const;
export type UiEffectKind = (typeof UI_EFFECT_KINDS)[number];

/** Pitch correction is intended for vocal stems only (issue #83). */
export function isPitchCorrectEligibleTrack(role: string): boolean {
  const r = role.trim().toLowerCase();
  return r === "vocals" || r === "vocal" || r.includes("vocal");
}

export type ProductionOverlay = {
  mixId: string;
  volumePointsByTrack: Record<string, AutomationPoint[]>;
  panPointsByTrack: Record<string, AutomationPoint[]>;
  /** Keys: `${trackId}|${target}` for FX / send / bus lanes beyond vol/pan. */
  automationLanes: Record<string, AutomationPoint[]>;
  effectsByTrack: Record<string, TrackEffectSlot[]>;
  sidechainRoutes: SidechainRoute[];
  buses: MixBus[];
  sends: MixSend[];
  /** trackId → group bus id */
  trackGroupIds: Record<string, string | null>;
};

type Listener = () => void;

let overlay: ProductionOverlay | null = null;
let projectScope: string | null = null;
let toolkit: MixProductionToolkit = createMixProductionToolkit();
const listeners = new Set<Listener>();
/** Project tempo for delay sync — optional; invalid → free ms fallback. */
let productionTempoBpm: number | null = null;
const overlayUndo: ProductionOverlay[] = [];
const overlayRedo: ProductionOverlay[] = [];
let diskPersist:
  | ((mixId: string, json: ProductionOverlay) => void)
  | null = null;

function notify() {
  for (const fn of listeners) fn();
}

export function setProductionTempoBpm(bpm: number | null | undefined) {
  productionTempoBpm =
    typeof bpm === "number" && Number.isFinite(bpm) && bpm > 0 ? bpm : null;
}

export function getProductionTempoBpm(): number | null {
  return productionTempoBpm;
}

/** Optional host hook to mirror overlay into the project folder. */
export function setProductionDiskPersist(
  fn: ((mixId: string, json: ProductionOverlay) => void) | null,
) {
  diskPersist = fn;
}

function storageKey(mixId: string): string {
  return projectScope == null ? `${STORAGE_PREFIX}${mixId}`
    : `${STORAGE_PREFIX}project:${encodeURIComponent(projectScope)}:mix:${encodeURIComponent(mixId)}`;
}

/** Mix IDs are local to each project. Never reuse another project's cache or undo. */
export function setProductionProjectScope(projectId: string | null) {
  if (projectScope === projectId) return;
  projectScope = projectId;
  overlay = null;
  overlayUndo.length = 0;
  overlayRedo.length = 0;
  diskPersist = null;
  rebuildToolkit();
  notify();
}

function emptyOverlay(mixId: string): ProductionOverlay {
  return {
    mixId,
    volumePointsByTrack: {},
    panPointsByTrack: {},
    automationLanes: {},
    effectsByTrack: {},
    sidechainRoutes: [],
    buses: [],
    sends: [],
    trackGroupIds: {},
  };
}

function cloneOverlay(o: ProductionOverlay): ProductionOverlay {
  return JSON.parse(JSON.stringify(o)) as ProductionOverlay;
}

function pushOverlayUndo(prev: ProductionOverlay | null) {
  if (!prev) return;
  overlayUndo.push(cloneOverlay(prev));
  if (overlayUndo.length > OVERLAY_UNDO_CAP) overlayUndo.shift();
  overlayRedo.length = 0;
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

  const automationLanes: Record<string, AutomationPoint[]> = {};
  if (o.automationLanes && typeof o.automationLanes === "object") {
    for (const [k, v] of Object.entries(
      o.automationLanes as Record<string, unknown>,
    )) {
      automationLanes[k] = normalizePoints(v);
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

  const busesRaw = Array.isArray(o.buses) ? o.buses : [];
  const buses: MixBus[] = [];
  for (const rawBus of busesRaw) {
    if (!rawBus || typeof rawBus !== "object") continue;
    const b = rawBus as Record<string, unknown>;
    if (typeof b.id !== "string") continue;
    if (b.kind !== "group" && b.kind !== "aux") continue;
    buses.push({
      id: b.id,
      kind: b.kind,
      name: typeof b.name === "string" ? b.name : b.kind,
      gainDb: typeof b.gainDb === "number" ? b.gainDb : 0,
      pan: typeof b.pan === "number" ? b.pan : 0,
      mute: Boolean(b.mute),
      solo: Boolean(b.solo),
      parentGroupId:
        typeof b.parentGroupId === "string" ? b.parentGroupId : null,
    });
  }

  const sendsRaw = Array.isArray(o.sends) ? o.sends : [];
  const sends: MixSend[] = [];
  for (const rawSend of sendsRaw) {
    if (!rawSend || typeof rawSend !== "object") continue;
    const s = rawSend as Record<string, unknown>;
    if (
      typeof s.id !== "string" ||
      typeof s.fromTrackId !== "string" ||
      typeof s.toBusId !== "string"
    ) {
      continue;
    }
    sends.push({
      id: s.id,
      fromTrackId: s.fromTrackId,
      toBusId: s.toBusId,
      gainDb: typeof s.gainDb === "number" ? s.gainDb : -6,
      preFader: Boolean(s.preFader),
      enabled: s.enabled !== false,
    });
  }

  const trackGroupIds: Record<string, string | null> = {};
  if (o.trackGroupIds && typeof o.trackGroupIds === "object") {
    for (const [k, v] of Object.entries(
      o.trackGroupIds as Record<string, unknown>,
    )) {
      trackGroupIds[k] = typeof v === "string" ? v : null;
    }
  }

  const validated = validateRoutingGraph({
    tracks: Object.keys({
      ...volumePointsByTrack,
      ...effectsByTrack,
      ...trackGroupIds,
    }).map((id) => ({ id, groupId: trackGroupIds[id] ?? null })),
    buses,
    sends,
  });

  return {
    mixId,
    volumePointsByTrack,
    panPointsByTrack,
    automationLanes,
    effectsByTrack,
    sidechainRoutes,
    buses: validated.recovered.buses,
    sends: validated.recovered.sends,
    trackGroupIds: {
      ...trackGroupIds,
      ...validated.recovered.trackGroupIds,
    },
  };
}

function persistOverlay(next: ProductionOverlay | null) {
  if (!next) return;
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(storageKey(next.mixId), JSON.stringify(next));
    } catch {
      // Quota / private mode — ignore.
    }
  }
  if (diskPersist) {
    try {
      diskPersist(next.mixId, next);
    } catch {
      // Host may be offline — localStorage remains.
    }
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
  toolkit = createToolkitFromProductionOverlay(overlay);
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

export function setProductionOverlay(
  next: ProductionOverlay | null,
  opts?: { recordUndo?: boolean },
) {
  if (opts?.recordUndo !== false && overlay) {
    pushOverlayUndo(overlay);
  }
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
  opts?: { recordUndo?: boolean },
) {
  const base: ProductionOverlay =
    overlay?.mixId === patch.mixId
      ? overlay
      : (loadProductionOverlay(patch.mixId) ?? emptyOverlay(patch.mixId));

  if (opts?.recordUndo !== false) {
    pushOverlayUndo(base);
  }

  const nextBuses = patch.buses ?? base.buses;
  const nextSends = patch.sends ?? base.sends;
  const nextGroups = {
    ...base.trackGroupIds,
    ...(patch.trackGroupIds ?? {}),
  };
  const validated = validateRoutingGraph({
    tracks: Object.keys(nextGroups).map((id) => ({
      id,
      groupId: nextGroups[id] ?? null,
    })),
    buses: nextBuses,
    sends: nextSends,
  });

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
    automationLanes: {
      ...base.automationLanes,
      ...(patch.automationLanes ?? {}),
    },
    effectsByTrack: {
      ...base.effectsByTrack,
      ...(patch.effectsByTrack ?? {}),
    },
    sidechainRoutes: patch.sidechainRoutes ?? base.sidechainRoutes,
    buses: validated.recovered.buses,
    sends: validated.recovered.sends,
    trackGroupIds: {
      ...nextGroups,
      ...validated.recovered.trackGroupIds,
    },
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

export function setAutomationLanePoints(
  mixId: string,
  trackId: string,
  target: string,
  points: AutomationPoint[],
) {
  if (target === "volume") {
    patchProductionOverlay({
      mixId,
      volumePointsByTrack: { [trackId]: points },
    });
    return;
  }
  if (target === "pan") {
    patchProductionOverlay({
      mixId,
      panPointsByTrack: { [trackId]: points },
    });
    return;
  }
  patchProductionOverlay({
    mixId,
    automationLanes: { [`${trackId}|${target}`]: points },
  });
}

export function undoProductionOverlay(): ProductionOverlay | null {
  const prev = overlayUndo.pop();
  if (!prev) return null;
  if (overlay) overlayRedo.push(cloneOverlay(overlay));
  overlay = prev;
  rebuildToolkit();
  persistOverlay(overlay);
  notify();
  return overlay;
}

export function redoProductionOverlay(): ProductionOverlay | null {
  const next = overlayRedo.pop();
  if (!next) return null;
  if (overlay) overlayUndo.push(cloneOverlay(overlay));
  overlay = next;
  rebuildToolkit();
  persistOverlay(overlay);
  notify();
  return overlay;
}

export function productionIsActive(): boolean {
  if (!overlay) return false;
  const hasVol = Object.values(overlay.volumePointsByTrack).some(
    (p) => p.length > 0,
  );
  const hasPan = Object.values(overlay.panPointsByTrack).some(
    (p) => p.length > 0,
  );
  const hasExtraAuto = Object.values(overlay.automationLanes).some(
    (p) => p.length > 0,
  );
  const hasFx = Object.values(overlay.effectsByTrack).some((fx) =>
    fx.some((e) => e.enabled && isUiEffectKind(e.kind)),
  );
  const hasSc = overlay.sidechainRoutes.some((r) => r.enabled);
  const hasRouting =
    overlay.buses.length > 0 ||
    overlay.sends.length > 0 ||
    Object.values(overlay.trackGroupIds).some((g) => Boolean(g));
  return hasVol || hasPan || hasExtraAuto || hasFx || hasSc || hasRouting;
}

export function defaultEffectParams(
  kind: UiEffectKind,
): Record<string, number | string | boolean> {
  switch (kind) {
    case "limiter":
      return { ceilingDb: -1 };
    case "compressor":
      return {
        thresholdDb: -18,
        ratio: 3,
        makeupDb: 0,
        attackMs: 10,
        releaseMs: 100,
        kneeDb: 6,
      };
    case "gate":
      return {
        thresholdDb: -40,
        ratio: 10,
        attackMs: 5,
        releaseMs: 80,
        rangeDb: 60,
      };
    case "eq":
      return { gainDb: 0 };
    case "parametricEq":
      return {
        bandCount: 4,
        band0Type: "lowshelf",
        band0Freq: 100,
        band0Gain: 0,
        band0Q: 0.7,
        band0Enabled: true,
        band1Type: "peak",
        band1Freq: 1000,
        band1Gain: 0,
        band1Q: 1,
        band1Enabled: true,
        band2Type: "peak",
        band2Freq: 3000,
        band2Gain: 0,
        band2Q: 1,
        band2Enabled: true,
        band3Type: "highshelf",
        band3Freq: 8000,
        band3Gain: 0,
        band3Q: 0.7,
        band3Enabled: true,
      };
    case "filter":
      return { mode: "highpass", frequencyHz: 80, slopeDbPerOct: 12 };
    case "delay":
      return {
        delayMs: 350,
        sync: false,
        division: "1/4",
        tempoBpm: 0,
        feedback: 0.35,
        mix: 0.35,
      };
    case "reverb":
      return { mix: 0.35, roomSize: 0.55, damping: 0.45, width: 1 };
    case "pitch_correct":
      return {
        mode: "chromatic",
        tonic: 0,
        scale: "major",
        intensity: 0.7,
        speed: 0.55,
        formantPreserve: true,
      };
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
