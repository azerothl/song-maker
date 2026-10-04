import type {
  AutomationLane,
  AutomationTarget,
  CustomEffectProcessor,
  EffectProcessContext,
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
  applyDelay,
  applyFilter,
  applyGainShelf,
  applyGate,
  applyParametricEq,
  applyPeakLimiter,
  applyReverb,
  applySidechainDuck,
  dbToLinear,
  DELAY_DIVISIONS,
  type DelayDivision,
  measureLoudnessFromPcm,
  parametricBandsFromParams,
  sampleAutomationPoints,
} from "./dsp.js";
import {
  applyPitchCorrect,
  type PitchCorrectMode,
  type PitchCorrectScale,
} from "./pitchCorrect.js";
import { applyVoiceCleanup } from "./voiceCleanup.js";
import { applyVoiceConvert } from "./voiceConvert.js";
import { applyVoiceDenoise } from "./voiceDenoise.js";

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
      return 0;
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

function numParam(
  params: Record<string, number | string | boolean>,
  key: string,
  fallback: number,
): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export class TrackEffectsRackImpl implements TrackEffectsRack {
  private readonly racks = new Map<string, TrackEffectSlot[]>();
  private readonly customProcessors = new Map<string, CustomEffectProcessor>();
  private readonly gainReductionDb = new Map<string, number>();

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
    this.gainReductionDb.delete(`${trackId}:${effectId}`);
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

  getGainReductionDb(trackId: string, effectId: string): number | null {
    const v = this.gainReductionDb.get(`${trackId}:${effectId}`);
    return v == null ? null : v;
  }

  process(
    trackId: string,
    pcm: Float32Array,
    sampleRate = 48000,
    context: EffectProcessContext = {},
  ): Float32Array {
    let current = pcm;
    const sr = Math.max(1, sampleRate);
    for (const effect of this.list(trackId)) {
      if (!effect.enabled) continue;
      switch (effect.kind) {
        case "limiter": {
          const ceilingDb = numParam(effect.params, "ceilingDb", -1);
          current = applyPeakLimiter(
            current,
            dbToLinear(Math.max(-24, Math.min(0, ceilingDb))),
          );
          break;
        }
        case "compressor": {
          const meter = { peakReductionDb: 0 };
          current = applyCompressor(
            current,
            numParam(effect.params, "thresholdDb", -18),
            numParam(effect.params, "ratio", 4),
            numParam(effect.params, "makeupDb", 0),
            {
              attackMs: numParam(effect.params, "attackMs", 10),
              releaseMs: numParam(effect.params, "releaseMs", 100),
              kneeDb: numParam(effect.params, "kneeDb", 0),
              sampleRate: sr,
              meter,
            },
          );
          this.gainReductionDb.set(
            `${trackId}:${effect.id}`,
            meter.peakReductionDb,
          );
          break;
        }
        case "gate": {
          current = applyGate(current, sr, {
            thresholdDb: numParam(effect.params, "thresholdDb", -40),
            ratio: numParam(effect.params, "ratio", 10),
            attackMs: numParam(effect.params, "attackMs", 5),
            releaseMs: numParam(effect.params, "releaseMs", 80),
            rangeDb: numParam(effect.params, "rangeDb", 60),
          });
          break;
        }
        case "eq": {
          current = applyGainShelf(
            current,
            numParam(effect.params, "gainDb", 0),
          );
          break;
        }
        case "parametricEq": {
          current = applyParametricEq(
            current,
            sr,
            parametricBandsFromParams(effect.params),
          );
          break;
        }
        case "filter": {
          const modeRaw = effect.params.mode;
          const mode =
            modeRaw === "lowpass" || modeRaw === "highpass"
              ? modeRaw
              : "highpass";
          current = applyFilter(current, sr, {
            mode,
            frequencyHz: numParam(effect.params, "frequencyHz", 120),
            slopeDbPerOct: numParam(effect.params, "slopeDbPerOct", 12),
          });
          break;
        }
        case "reverb": {
          current = applyReverb(current, sr, {
            mix: numParam(effect.params, "mix", 0.35),
            roomSize: numParam(effect.params, "roomSize", 0.55),
            damping: numParam(effect.params, "damping", 0.45),
            width: numParam(effect.params, "width", 1),
          });
          break;
        }
        case "delay": {
          const divisionRaw = effect.params.division;
          const division =
            typeof divisionRaw === "string" &&
            (DELAY_DIVISIONS as readonly string[]).includes(divisionRaw)
              ? (divisionRaw as DelayDivision)
              : "1/4";
          const paramTempo =
            typeof effect.params.tempoBpm === "number"
              ? effect.params.tempoBpm
              : null;
          const ctxTempo =
            typeof context.tempoBpm === "number" ? context.tempoBpm : null;
          const tempoBpm =
            paramTempo != null && paramTempo > 0
              ? paramTempo
              : ctxTempo != null && ctxTempo > 0
                ? ctxTempo
                : null;
          current = applyDelay(current, sr, {
            delayMs: numParam(effect.params, "delayMs", 350),
            sync: effect.params.sync === true || effect.params.sync === 1,
            division,
            tempoBpm,
            feedback: numParam(effect.params, "feedback", 0.35),
            mix: numParam(effect.params, "mix", 0.35),
          });
          break;
        }
        case "pitch_correct": {
          const mode: PitchCorrectMode =
            effect.params.mode === "scale" ? "scale" : "chromatic";
          const scale: PitchCorrectScale =
            effect.params.scale === "minor" ? "minor" : "major";
          current = applyPitchCorrect(current, sr, {
            mode,
            tonic:
              typeof effect.params.tonic === "number"
                ? effect.params.tonic
                : 0,
            scale,
            intensity:
              typeof effect.params.intensity === "number"
                ? effect.params.intensity
                : 0.7,
            speed:
              typeof effect.params.speed === "number"
                ? effect.params.speed
                : 0.55,
            formantPreserve:
              typeof effect.params.formantPreserve === "boolean"
                ? effect.params.formantPreserve
                : true,
          });
          break;
        }
        case "voice_cleanup": {
          current = applyVoiceCleanup(current, sr, {
            strength:
              typeof effect.params.strength === "number"
                ? effect.params.strength
                : 0.55,
            noiseFloorDb:
              typeof effect.params.noiseFloorDb === "number"
                ? effect.params.noiseFloorDb
                : -48,
            preserveAttack:
              typeof effect.params.preserveAttack === "number"
                ? effect.params.preserveAttack
                : 0.65,
          });
          break;
        }
        case "voice_convert": {
          current = applyVoiceConvert(current, sr, {
            consentOwnVoice: effect.params.consentOwnVoice === true,
            ...(typeof effect.params.targetEnvelope === "string"
              ? { targetEnvelope: effect.params.targetEnvelope }
              : {}),
            mix:
              typeof effect.params.mix === "number" ? effect.params.mix : 0.65,
          });
          break;
        }
        case "voice_denoise": {
          current = applyVoiceDenoise(current, sr, {
            strength:
              typeof effect.params.strength === "number"
                ? effect.params.strength
                : 0.55,
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

  processSlots(
    slots: TrackEffectSlot[],
    pcm: Float32Array,
    sampleRate = 48000,
    context: EffectProcessContext = {},
  ): Float32Array {
    const tempId = `__slots_${Math.random().toString(36).slice(2, 10)}`;
    const prev = this.racks.get(tempId);
    this.racks.set(tempId, slots.map((s) => ({ ...s, params: { ...s.params } })));
    try {
      return this.process(tempId, pcm, sampleRate, context);
    } finally {
      if (prev) this.racks.set(tempId, prev);
      else this.racks.delete(tempId);
    }
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
