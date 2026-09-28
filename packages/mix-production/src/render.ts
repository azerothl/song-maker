import { dbToLinear } from "./dsp.js";
import {
  effectParamTarget,
  parseAutomationTarget,
} from "./automationTargets.js";
import {
  topoSortGroupBuses,
  validateRoutingGraph,
  type MixBus,
  type MixSend,
} from "./routing.js";
import type {
  MixAutomationEngine,
  SidechainRouter,
  TrackEffectSlot,
  TrackEffectsRack,
} from "./types.js";

export type MixTrackRenderInput = {
  trackId: string;
  /** Planar left channel (−1…1). */
  left: Float32Array;
  /** Planar right channel (−1…1); may alias left for mono. */
  right: Float32Array;
  gainDb: number;
  /** Constant pan −1…1 when no pan automation. */
  pan: number;
  mute: boolean;
  solo: boolean;
  clipGainDb?: number;
};

export type MixRenderInput = {
  mixId: string;
  sampleRate: number;
  masterGainDb: number;
  peakCeilingDb: number;
  tracks: MixTrackRenderInput[];
  /** When set, volume automation (dB) replaces track gain per sample. */
  automation?: MixAutomationEngine;
  effects?: TrackEffectsRack;
  sidechain?: SidechainRouter;
  /** Optional project tempo for tempo-synced delay (safe fallback when absent). */
  tempoBpm?: number | null;
  /** Group / aux buses (#98). */
  buses?: MixBus[];
  /** Pre/post-fader sends to aux buses. */
  sends?: MixSend[];
  /** trackId → group bus id (post-fader feed). */
  trackGroupIds?: Record<string, string | null | undefined>;
};

export type MixRenderResult = {
  /** Interleaved stereo float32. */
  pcm: Float32Array;
  /** Planar left after mix (pre-interleave convenience). */
  left: Float32Array;
  /** Planar right after mix. */
  right: Float32Array;
  frameCount: number;
  peakTrimDb: number;
  /**
   * `phase1` = gain/pan/mute/solo/master/ceiling only.
   * `production` = automation / effects / sidechain / routing also applied.
   */
  path: "phase1" | "production";
};

const FX_AUTO_BLOCK = 2048;

function panGains(pan: number): [number, number] {
  const p = Math.max(-1, Math.min(1, pan));
  const angle = (p + 1) * (Math.PI / 4);
  return [Math.cos(angle), Math.sin(angle)];
}

function toInterleaved(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.max(left.length, right.length);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = left[i] ?? 0;
    out[i * 2 + 1] = right[i] ?? 0;
  }
  return out;
}

function fromInterleaved(
  pcm: Float32Array,
  frameCount: number,
): { left: Float32Array; right: Float32Array } {
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    left[i] = pcm[i * 2] ?? 0;
    right[i] = pcm[i * 2 + 1] ?? 0;
  }
  return { left, right };
}

function padInterleaved(pcm: Float32Array, frameCount: number): Float32Array {
  if (pcm.length >= frameCount * 2) return pcm;
  const out = new Float32Array(frameCount * 2);
  out.set(pcm);
  return out;
}

function sampleLane(
  automation: MixAutomationEngine | undefined,
  mixId: string,
  trackId: string,
  target: string,
  timeMs: number,
  fallback: number,
): number {
  if (!automation) return fallback;
  const has = automation
    .listLanes(mixId)
    .some((l) => l.trackId === trackId && l.target === target);
  if (!has) return fallback;
  return automation.sampleAt(mixId, trackId, target, timeMs);
}

function patchSlotsForTime(
  slots: TrackEffectSlot[],
  automation: MixAutomationEngine | undefined,
  mixId: string,
  trackId: string,
  timeMs: number,
): TrackEffectSlot[] {
  if (!automation) return slots;
  return slots.map((slot) => {
    const params = { ...slot.params };
    let changed = false;
    for (const key of Object.keys(slot.params)) {
      const target = effectParamTarget(slot.id, key);
      const has = automation
        .listLanes(mixId)
        .some((l) => l.trackId === trackId && l.target === target);
      if (!has) continue;
      params[key] = automation.sampleAt(mixId, trackId, target, timeMs);
      changed = true;
    }
    return changed ? { ...slot, params } : slot;
  });
}

function processTrackEffects(
  effects: TrackEffectsRack,
  trackId: string,
  interleaved: Float32Array,
  sampleRate: number,
  fxContext: { tempoBpm: number | null },
  automation: MixAutomationEngine | undefined,
  mixId: string,
): Float32Array {
  const slots = effects.list(trackId);
  if (slots.length === 0) return interleaved;

  const hasFxAuto = (automation?.listLanes(mixId) ?? []).some((l) => {
    if (l.trackId !== trackId) return false;
    return parseAutomationTarget(l.target).kind === "effectParam";
  });

  if (!hasFxAuto) {
    return effects.process(trackId, interleaved, sampleRate, fxContext);
  }

  const frames = Math.floor(interleaved.length / 2);
  const chunks: Float32Array[] = [];
  for (let start = 0; start < frames; start += FX_AUTO_BLOCK) {
    const end = Math.min(frames, start + FX_AUTO_BLOCK);
    const midMs = (((start + end) / 2) / sampleRate) * 1000;
    const patched = patchSlotsForTime(slots, automation, mixId, trackId, midMs);
    const slice = interleaved.subarray(start * 2, end * 2);
    const chunk = new Float32Array(slice.length);
    chunk.set(slice);
    chunks.push(
      effects.processSlots(patched, chunk, sampleRate, fxContext),
    );
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function trackIsAudible(
  track: MixTrackRenderInput,
  anyTrackSolo: boolean,
): boolean {
  if (track.mute) return false;
  if (anyTrackSolo && !track.solo) return false;
  return true;
}

function applyBusToDestination(
  bus: MixBus,
  buf: { left: Float32Array; right: Float32Array },
  maxLen: number,
  sr: number,
  mixId: string,
  automation: MixAutomationEngine | undefined,
  master: number,
  outL: Float32Array,
  outR: Float32Array,
  busBuffers: Map<string, { left: Float32Array; right: Float32Array }>,
  anyBusSolo: boolean,
): void {
  if (bus.mute) return;
  if (anyBusSolo && !bus.solo && bus.kind === "aux") return;
  if (anyBusSolo && !bus.solo && bus.kind === "group") {
    // Still allow group bus through if it is an ancestor of a soloed group —
    // simplified: skip non-solo groups when any bus solo is active.
    return;
  }

  for (let i = 0; i < maxLen; i++) {
    const timeMs = (i / sr) * 1000;
    const gainDb = sampleLane(
      automation,
      mixId,
      bus.id,
      `bus:${bus.id}:volume`,
      timeMs,
      bus.gainDb,
    );
    const pan = sampleLane(
      automation,
      mixId,
      bus.id,
      `bus:${bus.id}:pan`,
      timeMs,
      bus.pan,
    );
    const g = dbToLinear(gainDb);
    const [panL, panR] = panGains(pan);
    const fl = g * panL * buf.left[i]!;
    const fr = g * panR * buf.right[i]!;
    if (bus.kind === "group" && bus.parentGroupId && busBuffers.has(bus.parentGroupId)) {
      const parent = busBuffers.get(bus.parentGroupId)!;
      parent.left[i]! += fl;
      parent.right[i]! += fr;
    } else {
      outL[i]! += master * fl;
      outR[i]! += master * fr;
    }
  }
}

/**
 * Offline mix renderer shared by Web Audio playback bake and export (§10.5 + §10.3).
 * Same float32 math for both paths — approximate match, not bit-exact with the
 * historical Rust-only exporter or with the live GainNode graph.
 */
export function renderMixOffline(input: MixRenderInput): MixRenderResult {
  const routing = validateRoutingGraph({
    tracks: input.tracks.map((t) => ({
      id: t.trackId,
      groupId: input.trackGroupIds?.[t.trackId] ?? null,
    })),
    buses: input.buses ?? [],
    sends: input.sends ?? [],
  });
  const buses = routing.recovered.buses;
  const sends = routing.recovered.sends.filter((s) => s.enabled);
  const trackGroupIds = routing.recovered.trackGroupIds;

  const anyTrackSolo = input.tracks.some((t) => t.solo);
  const anyBusSolo = buses.some((b) => b.solo);

  let maxLen = 0;
  for (const t of input.tracks) {
    maxLen = Math.max(maxLen, t.left.length, t.right.length);
  }

  const hasAutomation =
    (input.automation?.listLanes(input.mixId).length ?? 0) > 0;
  const hasEffects = input.tracks.some(
    (t) => (input.effects?.list(t.trackId).length ?? 0) > 0,
  ) || buses.some((b) => (input.effects?.list(b.id).length ?? 0) > 0);
  const hasSidechain =
    (input.sidechain?.listRoutes(input.mixId).length ?? 0) > 0;
  const hasRouting = buses.length > 0 || sends.length > 0;
  const path: MixRenderResult["path"] =
    hasAutomation || hasEffects || hasSidechain || hasRouting
      ? "production"
      : "phase1";

  const processed = new Map<string, Float32Array>();
  const sr = Math.max(1, input.sampleRate);
  const fxContext = { tempoBpm: input.tempoBpm ?? null };

  for (const track of input.tracks) {
    const left = new Float32Array(maxLen);
    const right = new Float32Array(maxLen);
    left.set(track.left.subarray(0, Math.min(track.left.length, maxLen)));
    right.set(track.right.subarray(0, Math.min(track.right.length, maxLen)));
    let interleaved = toInterleaved(left, right);
    if (input.effects) {
      interleaved = processTrackEffects(
        input.effects,
        track.trackId,
        interleaved,
        sr,
        fxContext,
        input.automation,
        input.mixId,
      );
    }
    processed.set(track.trackId, interleaved);
  }

  for (const pcm of processed.values()) {
    maxLen = Math.max(maxLen, Math.floor(pcm.length / 2));
  }

  if (input.sidechain) {
    for (const track of input.tracks) {
      let dest = processed.get(track.trackId);
      if (!dest) continue;
      dest = padInterleaved(dest, maxLen);
      processed.set(
        track.trackId,
        input.sidechain.applyDucking(
          input.mixId,
          track.trackId,
          dest,
          processed,
        ),
      );
    }
  }

  for (const [id, pcm] of processed) {
    processed.set(id, padInterleaved(pcm, maxLen));
  }

  const busBuffers = new Map<string, { left: Float32Array; right: Float32Array }>();
  for (const bus of buses) {
    busBuffers.set(bus.id, {
      left: new Float32Array(maxLen),
      right: new Float32Array(maxLen),
    });
  }

  const outL = new Float32Array(maxLen);
  const outR = new Float32Array(maxLen);
  const master = dbToLinear(input.masterGainDb);

  const sendsByTrack = new Map<string, MixSend[]>();
  for (const send of sends) {
    const list = sendsByTrack.get(send.fromTrackId) ?? [];
    list.push(send);
    sendsByTrack.set(send.fromTrackId, list);
  }

  for (const track of input.tracks) {
    const audible = trackIsAudible(track, anyTrackSolo);
    if (!audible) continue;

    const pcm = processed.get(track.trackId);
    if (!pcm) continue;
    const clipLin = dbToLinear(track.clipGainDb ?? 0);
    const groupId = trackGroupIds[track.trackId] ?? null;
    const trackSends = sendsByTrack.get(track.trackId) ?? [];

    for (let i = 0; i < maxLen; i++) {
      const timeMs = (i / sr) * 1000;
      const l = pcm[i * 2] ?? 0;
      const r = pcm[i * 2 + 1] ?? 0;

      for (const send of trackSends) {
        if (!send.preFader) continue;
        const buf = busBuffers.get(send.toBusId);
        if (!buf) continue;
        const sendDb = sampleLane(
          input.automation,
          input.mixId,
          track.trackId,
          `send:${send.id}:gain`,
          timeMs,
          send.gainDb,
        );
        const g = dbToLinear(sendDb);
        buf.left[i]! += g * l;
        buf.right[i]! += g * r;
      }

      const gainDb = sampleLane(
        input.automation,
        input.mixId,
        track.trackId,
        "volume",
        timeMs,
        track.gainDb,
      );
      const gainLin = dbToLinear(gainDb) * clipLin;
      const pan = sampleLane(
        input.automation,
        input.mixId,
        track.trackId,
        "pan",
        timeMs,
        track.pan,
      );
      const [panL, panR] = panGains(pan);
      const fl = gainLin * panL * l;
      const fr = gainLin * panR * r;

      for (const send of trackSends) {
        if (send.preFader) continue;
        const buf = busBuffers.get(send.toBusId);
        if (!buf) continue;
        const sendDb = sampleLane(
          input.automation,
          input.mixId,
          track.trackId,
          `send:${send.id}:gain`,
          timeMs,
          send.gainDb,
        );
        const g = dbToLinear(sendDb);
        buf.left[i]! += g * fl;
        buf.right[i]! += g * fr;
      }

      if (groupId && busBuffers.has(groupId)) {
        const buf = busBuffers.get(groupId)!;
        buf.left[i]! += fl;
        buf.right[i]! += fr;
      } else {
        outL[i]! += master * fl;
        outR[i]! += master * fr;
      }
    }
  }

  // Group buses: apply insert FX then fader, child → parent → master.
  for (const bus of topoSortGroupBuses(buses)) {
    const buf = busBuffers.get(bus.id);
    if (!buf) continue;

    if (input.effects && input.effects.list(bus.id).length > 0) {
      let interleaved = toInterleaved(buf.left, buf.right);
      interleaved = processTrackEffects(
        input.effects,
        bus.id,
        interleaved,
        sr,
        fxContext,
        input.automation,
        input.mixId,
      );
      interleaved = padInterleaved(interleaved, maxLen);
      const planar = fromInterleaved(interleaved, maxLen);
      buf.left = planar.left;
      buf.right = planar.right;
    }

    applyBusToDestination(
      bus,
      buf,
      maxLen,
      sr,
      input.mixId,
      input.automation,
      master,
      outL,
      outR,
      busBuffers,
      anyBusSolo,
    );
  }

  // Aux returns → master (send buffers already filled).
  for (const bus of buses.filter((b) => b.kind === "aux")) {
    const buf = busBuffers.get(bus.id);
    if (!buf) continue;

    if (input.effects && input.effects.list(bus.id).length > 0) {
      let interleaved = toInterleaved(buf.left, buf.right);
      interleaved = processTrackEffects(
        input.effects,
        bus.id,
        interleaved,
        sr,
        fxContext,
        input.automation,
        input.mixId,
      );
      interleaved = padInterleaved(interleaved, maxLen);
      const planar = fromInterleaved(interleaved, maxLen);
      buf.left = planar.left;
      buf.right = planar.right;
    }

    applyBusToDestination(
      bus,
      buf,
      maxLen,
      sr,
      input.mixId,
      input.automation,
      master,
      outL,
      outR,
      busBuffers,
      anyBusSolo,
    );
  }

  let peak = 0;
  for (let i = 0; i < maxLen; i++) {
    peak = Math.max(peak, Math.abs(outL[i]!), Math.abs(outR[i]!));
  }
  const ceiling = dbToLinear(input.peakCeilingDb);
  let peakTrimDb = 0;
  if (peak > ceiling && peak > 0) {
    const trim = ceiling / peak;
    peakTrimDb = 20 * Math.log10(trim);
    for (let i = 0; i < maxLen; i++) {
      outL[i]! *= trim;
      outR[i]! *= trim;
    }
  }

  return {
    pcm: toInterleaved(outL, outR),
    left: outL,
    right: outR,
    frameCount: maxLen,
    peakTrimDb,
    path,
  };
}

/** Split interleaved stereo into planar channels (for AudioBuffer copy). */
export function interleavedToPlanar(
  pcm: Float32Array,
  frameCount?: number,
): { left: Float32Array; right: Float32Array } {
  const n = frameCount ?? Math.floor(pcm.length / 2);
  return fromInterleaved(pcm, n);
}
