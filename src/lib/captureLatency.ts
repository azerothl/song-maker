/**
 * WebView capture latency estimate + stability tradeoffs (issue #93).
 *
 * Native WASAPI / ASIO exclusive paths are still out of scope — cpal shared
 * WASAPI (Win) / ALSA / Core Audio sit behind the same UI as a native engine.
 */

export type CaptureLatencyPreference = "stable" | "balanced" | "low";

export type CaptureLatencyReading = {
  preference: CaptureLatencyPreference;
  /** AudioContext.baseLatency (seconds), if available. */
  baseLatencySec: number | null;
  /** AudioContext.outputLatency (seconds), if available. */
  outputLatencySec: number | null;
  /** Estimated round-trip monitoring latency in ms. */
  roundTripMs: number | null;
  /** Suggested monitor delay compensation in ms (same as round-trip when known). */
  compensationMs: number | null;
  sampleRate: number | null;
};

const PREFERENCE_HINT: Record<
  CaptureLatencyPreference,
  AudioContextLatencyCategory
> = {
  stable: "playback",
  balanced: "balanced",
  low: "interactive",
};

export function latencyHintForPreference(
  preference: CaptureLatencyPreference,
): AudioContextLatencyCategory {
  return PREFERENCE_HINT[preference];
}

export function readCaptureLatency(
  ctx: AudioContext | null | undefined,
  preference: CaptureLatencyPreference,
): CaptureLatencyReading {
  if (!ctx) {
    return {
      preference,
      baseLatencySec: null,
      outputLatencySec: null,
      roundTripMs: null,
      compensationMs: null,
      sampleRate: null,
    };
  }
  const base =
    typeof ctx.baseLatency === "number" && Number.isFinite(ctx.baseLatency)
      ? ctx.baseLatency
      : null;
  const output =
    typeof (ctx as AudioContext & { outputLatency?: number }).outputLatency ===
      "number" &&
    Number.isFinite((ctx as AudioContext & { outputLatency?: number }).outputLatency)
      ? ((ctx as AudioContext & { outputLatency?: number }).outputLatency as number)
      : null;
  let roundTripMs: number | null = null;
  if (base != null || output != null) {
    roundTripMs = Math.round(((base ?? 0) + (output ?? 0)) * 1000);
  }
  return {
    preference,
    baseLatencySec: base,
    outputLatencySec: output,
    roundTripMs,
    compensationMs: roundTripMs,
    sampleRate: ctx.sampleRate || null,
  };
}

/** Format for UI: "12 ms (base 5 + out 7)" or unavailable. */
export function formatLatencyReading(reading: CaptureLatencyReading): string {
  if (reading.roundTripMs == null) {
    return "—";
  }
  const parts: string[] = [];
  if (reading.baseLatencySec != null) {
    parts.push(`base ${Math.round(reading.baseLatencySec * 1000)}`);
  }
  if (reading.outputLatencySec != null) {
    parts.push(`sortie ${Math.round(reading.outputLatencySec * 1000)}`);
  }
  if (parts.length === 0) {
    return `${reading.roundTripMs} ms`;
  }
  return `${reading.roundTripMs} ms (${parts.join(" + ")} ms)`;
}
