import {
  createMixProductionToolkit,
  type AutomationPoint,
  type MixProductionToolkit,
  type SidechainRoute,
  type TrackEffectSlot,
} from "@song-maker/mix-production";

export type ProductionOverlay = {
  mixId: string;
  volumePointsByTrack: Record<string, AutomationPoint[]>;
  /** Soft peak limiter on every track when enabled. */
  limiterEnabled: boolean;
  /** Light compressor on every track when enabled. */
  compressorEnabled: boolean;
  /** Duck accompaniment (trk-other) from drums when both exist. */
  sidechainEnabled: boolean;
};

type Listener = () => void;

let overlay: ProductionOverlay | null = null;
let toolkit: MixProductionToolkit = createMixProductionToolkit();
const listeners = new Set<Listener>();

const STEM_IDS = [
  "trk-vocals",
  "trk-drums",
  "trk-bass",
  "trk-other",
  "trk-guitar",
  "trk-piano",
] as const;

function notify() {
  for (const fn of listeners) fn();
}

function rebuildToolkit() {
  toolkit = createMixProductionToolkit();
  if (!overlay) return;
  const mixId = overlay.mixId;
  const trackIds = new Set<string>([
    ...STEM_IDS,
    ...Object.keys(overlay.volumePointsByTrack),
  ]);

  for (const [trackId, points] of Object.entries(overlay.volumePointsByTrack)) {
    if (points.length === 0) continue;
    toolkit.automation.setLane(mixId, {
      trackId,
      target: "volume",
      points,
    });
  }

  for (const trackId of trackIds) {
    if (overlay.compressorEnabled) {
      const slot: TrackEffectSlot = {
        id: `comp-${trackId}`,
        kind: "compressor",
        enabled: true,
        params: { thresholdDb: -18, ratio: 3, makeupDb: 0 },
      };
      toolkit.effects.insert(trackId, slot);
    }
    if (overlay.limiterEnabled) {
      const slot: TrackEffectSlot = {
        id: `lim-${trackId}`,
        kind: "limiter",
        enabled: true,
        params: { ceilingDb: -1 },
      };
      toolkit.effects.insert(trackId, slot);
    }
  }

  if (overlay.sidechainEnabled) {
    const route: SidechainRoute = {
      id: "sc-drums-other",
      sourceTrackId: "trk-drums",
      destinationTrackId: "trk-other",
      thresholdDb: -24,
      ratio: 4,
      enabled: true,
    };
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
  notify();
}

export function patchProductionOverlay(
  patch: Partial<Omit<ProductionOverlay, "mixId">> & { mixId: string },
) {
  const base: ProductionOverlay =
    overlay?.mixId === patch.mixId
      ? overlay
      : {
          mixId: patch.mixId,
          volumePointsByTrack: {},
          limiterEnabled: false,
          compressorEnabled: false,
          sidechainEnabled: false,
        };
  overlay = {
    ...base,
    ...patch,
    volumePointsByTrack: {
      ...base.volumePointsByTrack,
      ...(patch.volumePointsByTrack ?? {}),
    },
  };
  rebuildToolkit();
  notify();
}

export function productionIsActive(): boolean {
  if (!overlay) return false;
  const hasAuto = Object.values(overlay.volumePointsByTrack).some(
    (p) => p.length > 0,
  );
  return (
    hasAuto ||
    overlay.limiterEnabled ||
    overlay.compressorEnabled ||
    overlay.sidechainEnabled
  );
}
