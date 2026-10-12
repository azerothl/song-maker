import {
  barDurationMs,
  beatDurationMs,
  snapMs,
  type MusicalSubdivision,
} from "./musicalTime";
import { DEFAULT_PRODUCTION_CLIP_VIEW_PREFS } from "./productionClipViewPrefs";
import type { MixDoc } from "./types";

export type PunchGridOpts = {
  mix?: MixDoc | null;
  snapEnabled?: boolean;
  gridMode?: "time" | "musical";
  subdivision?: MusicalSubdivision;
};

export type PunchTransportAction =
  | "inactive"
  | "waiting"
  | "stop-after-pause"
  | "stop-at-punch-out";

export type PunchStartAction = "record" | "punch" | "missing-transport";

export function punchStartAction(input: {
  enabled: boolean;
  looping: boolean;
  hasTransport: boolean;
}): PunchStartAction {
  if (!input.enabled || input.looping) return "record";
  return input.hasTransport ? "punch" : "missing-transport";
}

export function punchTransportAction(input: {
  enabled: boolean;
  looping: boolean;
  started: boolean;
  playing: boolean;
  currentMs: number;
  punchOutMs: number;
}): PunchTransportAction {
  if (!input.enabled || input.looping || !input.started) return "inactive";
  if (!input.playing) return "stop-after-pause";
  if (input.currentMs >= input.punchOutMs) return "stop-at-punch-out";
  return "waiting";
}

function tempoAtZero(mix?: MixDoc | null): number {
  const bpm = mix?.tempoMap?.[0]?.quarterBpm;
  return bpm && bpm > 0 ? bpm : 120;
}

function meterAtZero(mix?: MixDoc | null): { numerator: number; denominator: number } {
  const m = mix?.timeSignatures?.[0];
  return {
    numerator: m?.numerator && m.numerator > 0 ? m.numerator : 4,
    denominator: m?.denominator && m.denominator > 0 ? m.denominator : 4,
  };
}

export function punchBarDurationMs(mix?: MixDoc | null): number {
  const meter = meterAtZero(mix);
  return barDurationMs(tempoAtZero(mix), meter.numerator, meter.denominator);
}

export function punchBeatDurationMs(mix?: MixDoc | null): number {
  return beatDurationMs(tempoAtZero(mix));
}

/** Snap punch/loop times to the mix grid used in Production. */
export function snapPunchMs(ms: number, opts: PunchGridOpts = {}): number {
  const prefs = DEFAULT_PRODUCTION_CLIP_VIEW_PREFS;
  return snapMs(ms, {
    enabled: opts.snapEnabled ?? true,
    mode: opts.gridMode ?? prefs.gridMode,
    tempoMap: opts.mix?.tempoMap ?? [],
    meterMap: opts.mix?.timeSignatures ?? [],
    subdivision: opts.subdivision ?? prefs.subdivision,
    timeSnapMs: 50,
  });
}

export function snapPunchWindow(
  punchInMs: number,
  punchOutMs: number,
  opts: PunchGridOpts = {},
): { punchInMs: number; punchOutMs: number } {
  const inMs = snapPunchMs(Math.max(0, punchInMs), opts);
  let outMs = snapPunchMs(Math.max(0, punchOutMs), opts);
  if (outMs <= inMs) {
    outMs = inMs + punchBarDurationMs(opts.mix);
  }
  return { punchInMs: inMs, punchOutMs: outMs };
}
