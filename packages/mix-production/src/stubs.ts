import type {
  AutomationLane,
  AutomationTarget,
  LoudnessMeter,
  LoudnessReport,
  LoudnessStandard,
  MixAutomationEngine,
  MixProductionToolkit,
  SidechainRoute,
  SidechainRouter,
  TrackEffectSlot,
  TrackEffectsRack,
} from "./types.js";

function notImplemented(feature: string): never {
  throw new Error(
    `${feature} is a phase-3 stub (spec §10.3). No DSP ships in this package.`,
  );
}

export class StubMixAutomationEngine implements MixAutomationEngine {
  private readonly lanes = new Map<string, AutomationLane[]>();

  listLanes(mixId: string): AutomationLane[] {
    return [...(this.lanes.get(mixId) ?? [])];
  }

  setLane(mixId: string, lane: AutomationLane): void {
    const existing = this.lanes.get(mixId) ?? [];
    const next = existing.filter(
      (l) => !(l.trackId === lane.trackId && l.target === lane.target),
    );
    next.push(lane);
    this.lanes.set(mixId, next);
  }

  sampleAt(
    _mixId: string,
    _trackId: string,
    _target: AutomationTarget,
    _timeMs: number,
  ): number {
    return notImplemented("MixAutomationEngine.sampleAt");
  }
}

export class StubTrackEffectsRack implements TrackEffectsRack {
  private readonly racks = new Map<string, TrackEffectSlot[]>();

  list(trackId: string): TrackEffectSlot[] {
    return [...(this.racks.get(trackId) ?? [])];
  }

  insert(trackId: string, effect: TrackEffectSlot): void {
    const list = this.racks.get(trackId) ?? [];
    list.push(effect);
    this.racks.set(trackId, list);
  }

  remove(trackId: string, effectId: string): void {
    const list = this.racks.get(trackId) ?? [];
    this.racks.set(
      trackId,
      list.filter((e) => e.id !== effectId),
    );
  }

  process(_trackId: string, _pcm: Float32Array): Float32Array {
    return notImplemented("TrackEffectsRack.process");
  }
}

export class StubSidechainRouter implements SidechainRouter {
  private readonly routes = new Map<string, SidechainRoute[]>();

  listRoutes(mixId: string): SidechainRoute[] {
    return [...(this.routes.get(mixId) ?? [])];
  }

  upsert(mixId: string, route: SidechainRoute): void {
    const list = (this.routes.get(mixId) ?? []).filter((r) => r.id !== route.id);
    list.push(route);
    this.routes.set(mixId, list);
  }

  remove(mixId: string, routeId: string): void {
    const list = this.routes.get(mixId) ?? [];
    this.routes.set(
      mixId,
      list.filter((r) => r.id !== routeId),
    );
  }
}

export class StubLoudnessMeter implements LoudnessMeter {
  async measure(
    audioPath: string,
    standard: LoudnessStandard,
  ): Promise<LoudnessReport> {
    if (standard === "none") {
      return {
        standard,
        integratedLufs: null,
        truePeakDbfs: null,
        measuredAt: new Date(0).toISOString(),
      };
    }
    void audioPath;
    return notImplemented("LoudnessMeter.measure");
  }
}

export function createStubMixProductionToolkit(): MixProductionToolkit {
  return {
    automation: new StubMixAutomationEngine(),
    effects: new StubTrackEffectsRack(),
    sidechain: new StubSidechainRouter(),
    loudness: new StubLoudnessMeter(),
  };
}
