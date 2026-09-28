import type {
  AutomationLane,
  AutomationTarget,
  CustomEffectProcessor,
  LoudnessMeter,
  LoudnessReport,
  LoudnessStandard,
  MixAutomationEngine,
  MixProductionToolkit,
  SidechainRoute,
  SidechainRouter,
  TrackEffectSlot,
  TrackEffectsRack,
  WavPcmDecoder,
} from "./types.js";
import {
  applyCompressor,
  applyGainShelf,
  applyPeakLimiter,
  applyReverb,
  applySidechainDuck,
  dbToLinear,
  measureLoudnessFromPcm,
  sampleAutomationPoints,
} from "./dsp.js";

export class MixAutomationEngineImpl implements MixAutomationEngine {
  private readonly lanes = new Map<string, AutomationLane[]>();

  listLanes(mixId: string): AutomationLane[] {
    return [...(this.lanes.get(mixId) ?? [])];
  }

  setLane(mixId: string, lane: AutomationLane): void {
    const existing = this.lanes.get(mixId) ?? [];
    const next = existing.filter(
      (l) => !(l.trackId === lane.trackId && l.target === lane.target),
    );
    next.push({
      ...lane,
      points: [...lane.points].sort((a, b) => a.timeMs - b.timeMs),
    });
    this.lanes.set(mixId, next);
  }

  sampleAt(
    mixId: string,
    trackId: string,
    target: AutomationTarget,
    timeMs: number,
  ): number {
    const lane = (this.lanes.get(mixId) ?? []).find(
      (l) => l.trackId === trackId && l.target === target,
    );
    if (!lane || lane.points.length === 0) {
      return target === "volume" ? 0 : 0;
    }
    return sampleAutomationPoints(lane.points, timeMs);
  }
}

function assertCustomInsertable(
  effect: TrackEffectSlot,
  registry: ReadonlyMap<string, CustomEffectProcessor>,
): void {
  if (effect.kind !== "custom") return;
  const processorId =
    typeof effect.params.processorId === "string"
      ? effect.params.processorId.trim()
      : "";
  if (!processorId) {
    throw new Error(
      "Effet custom refusé : params.processorId est requis (extension DSP enregistrée).",
    );
  }
  if (effect.enabled && !registry.has(processorId)) {
    throw new Error(
      `Effet custom « ${processorId} » non supporté : aucune extension DSP enregistrée sous cet id.`,
    );
  }
}

export class TrackEffectsRackImpl implements TrackEffectsRack {
  private readonly racks = new Map<string, TrackEffectSlot[]>();
  private readonly customProcessors = new Map<string, CustomEffectProcessor>();

  list(trackId: string): TrackEffectSlot[] {
    return [...(this.racks.get(trackId) ?? [])];
  }

  insert(trackId: string, effect: TrackEffectSlot): void {
    assertCustomInsertable(effect, this.customProcessors);
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

  registerCustomProcessor(
    processorId: string,
    processor: CustomEffectProcessor,
  ): void {
    const id = processorId.trim();
    if (!id) {
      throw new Error("registerCustomProcessor : processorId vide.");
    }
    this.customProcessors.set(id, processor);
  }

  unregisterCustomProcessor(processorId: string): void {
    this.customProcessors.delete(processorId.trim());
  }

  listCustomProcessors(): string[] {
    return [...this.customProcessors.keys()].sort();
  }

  process(
    trackId: string,
    pcm: Float32Array,
    sampleRate = 48000,
  ): Float32Array {
    let current = pcm;
    const sr = Math.max(1, sampleRate);
    for (const effect of this.list(trackId)) {
      if (!effect.enabled) continue;
      switch (effect.kind) {
        case "limiter": {
          const ceilingDb =
            typeof effect.params.ceilingDb === "number"
              ? effect.params.ceilingDb
              : -1;
          current = applyPeakLimiter(current, dbToLinear(ceilingDb));
          break;
        }
        case "compressor": {
          const thresholdDb =
            typeof effect.params.thresholdDb === "number"
              ? effect.params.thresholdDb
              : -18;
          const ratio =
            typeof effect.params.ratio === "number" ? effect.params.ratio : 4;
          const makeupDb =
            typeof effect.params.makeupDb === "number"
              ? effect.params.makeupDb
              : 0;
          current = applyCompressor(current, thresholdDb, ratio, makeupDb);
          break;
        }
        case "eq": {
          const gainDb =
            typeof effect.params.gainDb === "number" ? effect.params.gainDb : 0;
          current = applyGainShelf(current, gainDb);
          break;
        }
        case "reverb": {
          current = applyReverb(current, sr, {
            mix:
              typeof effect.params.mix === "number" ? effect.params.mix : 0.35,
            roomSize:
              typeof effect.params.roomSize === "number"
                ? effect.params.roomSize
                : 0.55,
            damping:
              typeof effect.params.damping === "number"
                ? effect.params.damping
                : 0.45,
            width:
              typeof effect.params.width === "number"
                ? effect.params.width
                : 1,
          });
          break;
        }
        case "custom": {
          const processorId =
            typeof effect.params.processorId === "string"
              ? effect.params.processorId.trim()
              : "";
          const processor = processorId
            ? this.customProcessors.get(processorId)
            : undefined;
          if (!processor) {
            throw new Error(
              processorId
                ? `Effet custom « ${processorId} » non supporté : extension absente — aucun traitement appliqué.`
                : "Effet custom sans processorId — traitement refusé (pas de no-op silencieux).",
            );
          }
          current = processor(current, effect.params, sr);
          break;
        }
        default: {
          const _exhaustive: never = effect.kind;
          void _exhaustive;
          throw new Error(
            `Type d’effet non supporté — traitement refusé.`,
          );
        }
      }
    }
    return current;
  }
}

export class SidechainRouterImpl implements SidechainRouter {
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

  applyDucking(
    mixId: string,
    destinationTrackId: string,
    destinationPcm: Float32Array,
    sourcePcmByTrack: ReadonlyMap<string, Float32Array>,
  ): Float32Array {
    let current = destinationPcm;
    for (const route of this.listRoutes(mixId)) {
      if (!route.enabled || route.destinationTrackId !== destinationTrackId) {
        continue;
      }
      const source = sourcePcmByTrack.get(route.sourceTrackId);
      if (!source) continue;
      current = applySidechainDuck(
        current,
        source,
        route.thresholdDb,
        route.ratio,
      );
    }
    return current;
  }
}

export class LoudnessMeterImpl implements LoudnessMeter {
  constructor(private readonly decoder?: WavPcmDecoder) {}

  measurePcm(
    pcm: Float32Array,
    sampleRate: number,
    standard: LoudnessStandard,
  ): LoudnessReport {
    if (standard === "none") {
      return {
        standard,
        integratedLufs: null,
        truePeakDbfs: null,
        measuredAt: new Date().toISOString(),
      };
    }
    const { integratedLufs, truePeakDbfs } = measureLoudnessFromPcm(
      pcm,
      sampleRate,
    );
    return {
      standard,
      integratedLufs,
      truePeakDbfs,
      measuredAt: new Date().toISOString(),
    };
  }

  async measure(
    audioPath: string,
    standard: LoudnessStandard,
  ): Promise<LoudnessReport> {
    if (standard === "none") {
      return this.measurePcm(new Float32Array(0), 48000, "none");
    }
    if (!this.decoder) {
      throw new Error(
        "LoudnessMeter.measure requires a WavPcmDecoder, or call measurePcm with decoded buffers.",
      );
    }
    const { pcm, sampleRate } = await this.decoder(audioPath);
    return this.measurePcm(pcm, sampleRate, standard);
  }
}

/** Real phase-3 toolkit (smallest useful DSP subset). */
export function createMixProductionToolkit(
  decoder?: WavPcmDecoder,
): MixProductionToolkit {
  return {
    automation: new MixAutomationEngineImpl(),
    effects: new TrackEffectsRackImpl(),
    sidechain: new SidechainRouterImpl(),
    loudness: new LoudnessMeterImpl(decoder),
  };
}

/** @deprecated Alias — stubs replaced by real implementations. */
export const createStubMixProductionToolkit = createMixProductionToolkit;

/** @deprecated Use MixAutomationEngineImpl */
export const StubMixAutomationEngine = MixAutomationEngineImpl;
/** @deprecated Use TrackEffectsRackImpl */
export const StubTrackEffectsRack = TrackEffectsRackImpl;
/** @deprecated Use SidechainRouterImpl */
export const StubSidechainRouter = SidechainRouterImpl;
/** @deprecated Use LoudnessMeterImpl */
export const StubLoudnessMeter = LoudnessMeterImpl;
