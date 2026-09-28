/**
 * Phase 3 mix-production contracts (§10.3).
 * Real subset: gain automation sampling, soft limiter / compressor / stereo
 * reverb process, optional registered custom DSP, sidechain ducking, and
 * offline loudness (true peak + integrated estimate).
 * Phase 1 still uses constant gain/pan/mute/solo/masterGain only.
 */

export type AutomationTarget = "volume" | "pan";

export type AutomationPoint = {
  /** Milliseconds from project start. */
  timeMs: number;
  value: number;
};

export type AutomationLane = {
  trackId: string;
  target: AutomationTarget;
  points: AutomationPoint[];
};

/**
 * Volume and pan automation over time. Phase 1 has constant gain/pan only.
 */
export interface MixAutomationEngine {
  listLanes(mixId: string): AutomationLane[];
  setLane(mixId: string, lane: AutomationLane): void;
  /**
   * Sample an automated value at a playhead position (linear interpolation).
   */
  sampleAt(
    mixId: string,
    trackId: string,
    target: AutomationTarget,
    timeMs: number,
  ): number;
}

export type EffectKind = "eq" | "compressor" | "reverb" | "limiter" | "custom";

export type TrackEffectSlot = {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  /**
   * Effect params.
   * - limiter: `ceilingDb`
   * - compressor: `thresholdDb`, `ratio`, `makeupDb`
   * - eq: `gainDb`
   * - reverb: `mix`, `roomSize`, `damping`, `width` (all 0…1 except documented)
   * - custom: **required** `processorId` (string) naming a registered extension
   */
  params: Record<string, number | string | boolean>;
};

/**
 * Host-registered DSP for `kind: "custom"`.
 * `params.processorId` must match the id passed to `registerCustomProcessor`.
 * Returning a longer buffer is allowed (same contract as reverb tails).
 */
export type CustomEffectProcessor = (
  pcm: Float32Array,
  params: Record<string, number | string | boolean>,
  sampleRate: number,
) => Float32Array;

export interface TrackEffectsRack {
  list(trackId: string): TrackEffectSlot[];
  /**
   * Insert an effect. Refuses enabled `custom` slots without a registered
   * `processorId` — no silent no-op.
   */
  insert(trackId: string, effect: TrackEffectSlot): void;
  remove(trackId: string, effectId: string): void;
  /** Register a DSP extension for `kind: "custom"` + matching `processorId`. */
  registerCustomProcessor(
    processorId: string,
    processor: CustomEffectProcessor,
  ): void;
  unregisterCustomProcessor(processorId: string): void;
  listCustomProcessors(): string[];
  /**
   * Apply enabled effects to interleaved stereo float32 PCM (−1…1).
   * Reverb may extend the buffer by its documented decay tail.
   * Enabled custom without a registered processor throws.
   */
  process(
    trackId: string,
    pcm: Float32Array,
    sampleRate?: number,
  ): Float32Array;
}

export type SidechainRoute = {
  id: string;
  sourceTrackId: string;
  destinationTrackId: string;
  /** Threshold / ratio placeholders. */
  thresholdDb: number;
  ratio: number;
  enabled: boolean;
};

export interface SidechainRouter {
  listRoutes(mixId: string): SidechainRoute[];
  upsert(mixId: string, route: SidechainRoute): void;
  remove(mixId: string, routeId: string): void;
  /**
   * Duck destination PCM from source envelope (interleaved stereo).
   * Returns a new buffer; no-op when no enabled route matches.
   */
  applyDucking(
    mixId: string,
    destinationTrackId: string,
    destinationPcm: Float32Array,
    sourcePcmByTrack: ReadonlyMap<string, Float32Array>,
  ): Float32Array;
}

export type LoudnessStandard = "itu_bs_1770" | "ebu_r128" | "none";

export type LoudnessReport = {
  standard: LoudnessStandard;
  integratedLufs: number | null;
  truePeakDbfs: number | null;
  measuredAt: string;
};

export interface LoudnessMeter {
  /**
   * Analyze interleaved stereo float32 (−1…1).
   * Path-based hosts can decode then call `measurePcm`.
   */
  measurePcm(
    pcm: Float32Array,
    sampleRate: number,
    standard: LoudnessStandard,
  ): LoudnessReport;
  /** Analyze an offline mix render path when a decoder is injected. */
  measure(audioPath: string, standard: LoudnessStandard): Promise<LoudnessReport>;
}

export type MixProductionToolkit = {
  automation: MixAutomationEngine;
  effects: TrackEffectsRack;
  sidechain: SidechainRouter;
  loudness: LoudnessMeter;
};

export type WavPcmDecoder = (
  audioPath: string,
) => Promise<{ pcm: Float32Array; sampleRate: number }>;
