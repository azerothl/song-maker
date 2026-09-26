/**
 * Phase 3 mix-production contracts (§10.3).
 * Stubs only — no DSP, no Web Audio graph, no offline renderer.
 * Phase 1 keeps gain / pan / mute / solo / masterGain only.
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
   * Sample an automated value at a playhead position.
   * Stub: implementations throw until real interpolation exists.
   */
  sampleAt(mixId: string, trackId: string, target: AutomationTarget, timeMs: number): number;
}

export type EffectKind = "eq" | "compressor" | "reverb" | "custom";

export type TrackEffectSlot = {
  id: string;
  kind: EffectKind;
  enabled: boolean;
  /** Opaque params; real schemas land with DSP. */
  params: Record<string, number | string | boolean>;
};

export interface TrackEffectsRack {
  list(trackId: string): TrackEffectSlot[];
  insert(trackId: string, effect: TrackEffectSlot): void;
  remove(trackId: string, effectId: string): void;
  /** Apply rack to a buffer — not implemented in foundations. */
  process(_trackId: string, _pcm: Float32Array): Float32Array;
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
}

export type LoudnessStandard = "itu_bs_1770" | "ebu_r128" | "none";

export type LoudnessReport = {
  standard: LoudnessStandard;
  integratedLufs: number | null;
  truePeakDbfs: number | null;
  measuredAt: string;
};

export interface LoudnessMeter {
  /** Analyze an offline mix render. Stub returns null metrics. */
  measure(audioPath: string, standard: LoudnessStandard): Promise<LoudnessReport>;
}

export type MixProductionToolkit = {
  automation: MixAutomationEngine;
  effects: TrackEffectsRack;
  sidechain: SidechainRouter;
  loudness: LoudnessMeter;
};
