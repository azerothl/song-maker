import type {
  MixDoc,
  MixMarker,
  MixMeterEvent,
  MixTempoEvent,
  Meter,
} from "./types";

/** Default arrangement tempo when a mix has no tempo map (issue #94). */
export const DEFAULT_ARRANGEMENT_BPM = 120;

/** Default meter when a mix has no time-signature map. */
export const DEFAULT_ARRANGEMENT_METER: Meter = {
  numerator: 4,
  denominator: 4,
};

export type GridMode = "time" | "musical";

/** Musical snap subdivision relative to a quarter note (1 = quarter, 2 = eighth, 4 = 16th). */
export type MusicalSubdivision = 1 | 2 | 4 | 8;

export type MusicalPosition = {
  bar: number;
  beat: number;
  sub: number;
  ms: number;
};

export type RulerMark = {
  ms: number;
  label: string;
  major: boolean;
};

function sortedTempo(map: MixTempoEvent[]): MixTempoEvent[] {
  const list =
    map.length > 0
      ? [...map]
      : [{ startMs: 0, quarterBpm: DEFAULT_ARRANGEMENT_BPM }];
  list.sort((a, b) => a.startMs - b.startMs);
  if (list[0]!.startMs > 0) {
    list.unshift({ startMs: 0, quarterBpm: DEFAULT_ARRANGEMENT_BPM });
  }
  return list;
}

function sortedMeter(map: MixMeterEvent[]): MixMeterEvent[] {
  const list =
    map.length > 0
      ? [...map]
      : [
          {
            startMs: 0,
            numerator: DEFAULT_ARRANGEMENT_METER.numerator,
            denominator: DEFAULT_ARRANGEMENT_METER.denominator,
          },
        ];
  list.sort((a, b) => a.startMs - b.startMs);
  if (list[0]!.startMs > 0) {
    list.unshift({
      startMs: 0,
      numerator: DEFAULT_ARRANGEMENT_METER.numerator,
      denominator: DEFAULT_ARRANGEMENT_METER.denominator,
    });
  }
  return list;
}

export function beatDurationMs(quarterBpm: number): number {
  const bpm = quarterBpm > 0 ? quarterBpm : DEFAULT_ARRANGEMENT_BPM;
  return 60_000 / bpm;
}

export function barDurationMs(
  quarterBpm: number,
  numerator: number,
  denominator: number,
): number {
  const beatMs = beatDurationMs(quarterBpm);
  const beatsPerBar = numerator * (4 / Math.max(1, denominator));
  return beatMs * beatsPerBar;
}

function tempoAt(ms: number, map: MixTempoEvent[]): MixTempoEvent {
  const list = sortedTempo(map);
  let current = list[0]!;
  for (const ev of list) {
    if (ev.startMs > ms) break;
    current = ev;
  }
  return current;
}

function meterAt(ms: number, map: MixMeterEvent[]): MixMeterEvent {
  const list = sortedMeter(map);
  let current = list[0]!;
  for (const ev of list) {
    if (ev.startMs > ms) break;
    current = ev;
  }
  return current;
}

/**
 * Convert absolute ms → bar/beat/sub using the mix tempo + meter maps.
 * Bars and beats are 1-indexed. Does not rewrite clip positions.
 */
export function msToMusical(
  ms: number,
  tempoMap: MixTempoEvent[],
  meterMap: MixMeterEvent[],
  subdivision: MusicalSubdivision = 4,
): MusicalPosition {
  const t = Math.max(0, ms);
  let cursor = 0;
  let bar = 1;
  const tempos = sortedTempo(tempoMap);
  const meters = sortedMeter(meterMap);

  // Walk bar by bar until we pass t.
  let guard = 0;
  while (guard++ < 100_000) {
    const tempo = tempoAt(cursor, tempos);
    const meter = meterAt(cursor, meters);
    const barMs = barDurationMs(
      tempo.quarterBpm,
      meter.numerator,
      meter.denominator,
    );
    if (cursor + barMs > t + 1e-6) {
      const into = t - cursor;
      const beatMs = beatDurationMs(tempo.quarterBpm);
      const subMs = beatMs / subdivision;
      const beatIndex = Math.floor(into / beatMs);
      const intoBeat = into - beatIndex * beatMs;
      const sub = Math.floor(intoBeat / subMs);
      return {
        bar,
        beat: beatIndex + 1,
        sub,
        ms: t,
      };
    }
    cursor += barMs;
    bar += 1;
  }
  return { bar, beat: 1, sub: 0, ms: t };
}

/** Convert 1-indexed bar/beat/sub → ms. */
export function musicalToMs(
  bar: number,
  beat: number,
  sub: number,
  tempoMap: MixTempoEvent[],
  meterMap: MixMeterEvent[],
  subdivision: MusicalSubdivision = 4,
): number {
  const targetBar = Math.max(1, Math.floor(bar));
  const targetBeat = Math.max(1, Math.floor(beat));
  const targetSub = Math.max(0, Math.floor(sub));
  let cursor = 0;
  for (let b = 1; b < targetBar; b++) {
    const tempo = tempoAt(cursor, tempoMap);
    const meter = meterAt(cursor, meterMap);
    cursor += barDurationMs(
      tempo.quarterBpm,
      meter.numerator,
      meter.denominator,
    );
  }
  const tempo = tempoAt(cursor, tempoMap);
  const beatMs = beatDurationMs(tempo.quarterBpm);
  const subMs = beatMs / subdivision;
  return Math.max(
    0,
    Math.round(cursor + (targetBeat - 1) * beatMs + targetSub * subMs),
  );
}

export function snapMs(
  ms: number,
  options: {
    enabled: boolean;
    mode: GridMode;
    tempoMap: MixTempoEvent[];
    meterMap: MixMeterEvent[];
    subdivision: MusicalSubdivision;
    /** Fallback time snap when mode is "time". */
    timeSnapMs?: number;
  },
): number {
  if (!options.enabled) return Math.max(0, Math.round(ms));
  if (options.mode === "time") {
    const step = options.timeSnapMs && options.timeSnapMs > 0 ? options.timeSnapMs : 50;
    return Math.max(0, Math.round(ms / step) * step);
  }
  const pos = msToMusical(
    ms,
    options.tempoMap,
    options.meterMap,
    options.subdivision,
  );
  const tempo = tempoAt(ms, options.tempoMap);
  const beatMs = beatDurationMs(tempo.quarterBpm);
  const subMs = beatMs / options.subdivision;
  // Snap to nearest subdivision grid point around ms.
  const candidates: number[] = [];
  for (let dBar = -1; dBar <= 1; dBar++) {
    for (let dBeat = -2; dBeat <= 2; dBeat++) {
      for (let dSub = -options.subdivision; dSub <= options.subdivision; dSub++) {
        const bar = pos.bar + dBar;
        const beat = pos.beat + dBeat;
        const sub = pos.sub + dSub;
        if (bar < 1) continue;
        candidates.push(
          musicalToMs(
            bar,
            Math.max(1, beat),
            Math.max(0, sub),
            options.tempoMap,
            options.meterMap,
            options.subdivision,
          ),
        );
      }
    }
  }
  // Also snap using linear subdivision from local tempo for density.
  const localOrigin = musicalToMs(
    pos.bar,
    1,
    0,
    options.tempoMap,
    options.meterMap,
    options.subdivision,
  );
  for (let i = -32; i <= 32; i++) {
    candidates.push(Math.max(0, Math.round(localOrigin + i * subMs)));
  }
  let best = candidates[0] ?? 0;
  let bestDist = Math.abs(best - ms);
  for (const c of candidates) {
    const d = Math.abs(c - ms);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return Math.max(0, best);
}

export function buildRulerMarks(
  timelineMs: number,
  mode: GridMode,
  tempoMap: MixTempoEvent[],
  meterMap: MixMeterEvent[],
  subdivision: MusicalSubdivision,
): RulerMark[] {
  const end = Math.max(1, timelineMs);
  if (mode === "time") {
    const marks: RulerMark[] = [];
    const step = end > 120_000 ? 10_000 : end > 60_000 ? 5_000 : 1_000;
    for (let ms = 0; ms <= end + 1; ms += step) {
      const s = ms / 1000;
      const m = Math.floor(s / 60);
      const rest = (s % 60).toFixed(ms % 1000 === 0 ? 0 : 1);
      marks.push({
        ms,
        label: `${m}:${String(rest).padStart(ms % 1000 === 0 ? 2 : 4, "0")}`,
        major: ms % (step * 5) === 0 || ms === 0,
      });
    }
    return marks;
  }

  const marks: RulerMark[] = [];
  let cursor = 0;
  let bar = 1;
  let guard = 0;
  while (cursor <= end + 1 && guard++ < 50_000) {
    const tempo = tempoAt(cursor, tempoMap);
    const meter = meterAt(cursor, meterMap);
    const barMs = barDurationMs(
      tempo.quarterBpm,
      meter.numerator,
      meter.denominator,
    );
    const beatMs = beatDurationMs(tempo.quarterBpm);
    marks.push({ ms: cursor, label: `${bar}`, major: true });
    const beatsInBar = Math.max(
      1,
      Math.round(meter.numerator * (4 / Math.max(1, meter.denominator))),
    );
    for (let b = 1; b < beatsInBar; b++) {
      const beatPos = cursor + b * beatMs;
      if (beatPos > end) break;
      marks.push({ ms: beatPos, label: "", major: false });
      if (subdivision > 1) {
        const subMs = beatMs / subdivision;
        for (let s = 1; s < subdivision; s++) {
          const subPos = beatPos - beatMs + s * subMs;
          if (subPos <= cursor || subPos >= beatPos) continue;
          // skip — only draw beat lines for density; major bars already added
        }
      }
    }
    // Finer subdivision ticks within first beat of each bar for visual density.
    if (subdivision >= 2) {
      const subMs = beatMs / subdivision;
      for (let s = 1; s < subdivision * beatsInBar; s++) {
        if (s % subdivision === 0) continue;
        const subPos = cursor + s * subMs;
        if (subPos >= cursor + barMs || subPos > end) break;
        marks.push({ ms: subPos, label: "", major: false });
      }
    }
    cursor += barMs;
    bar += 1;
  }
  return marks;
}

export function formatMusical(pos: MusicalPosition): string {
  return `${pos.bar}.${pos.beat}.${pos.sub}`;
}

/**
 * Ensure mix arrangement fields exist. Never rewrites clip start/offset/duration.
 * Prefer project tempo/meter hints when provided; else 120 / 4/4.
 */
export function ensureMixArrangement(
  mix: MixDoc,
  projectTempoBpm?: number | null,
  projectMeter?: Meter | null,
): MixDoc {
  const bpm =
    projectTempoBpm && projectTempoBpm > 0
      ? Math.round(projectTempoBpm)
      : DEFAULT_ARRANGEMENT_BPM;
  const meter = projectMeter ?? DEFAULT_ARRANGEMENT_METER;
  const tempoMap =
    mix.tempoMap && mix.tempoMap.length > 0
      ? mix.tempoMap
      : [{ startMs: 0, quarterBpm: bpm }];
  const timeSignatures =
    mix.timeSignatures && mix.timeSignatures.length > 0
      ? mix.timeSignatures
      : [
          {
            startMs: 0,
            numerator: meter.numerator,
            denominator: meter.denominator,
          },
        ];
  const markers = mix.markers ?? [];
  if (
    mix.tempoMap === tempoMap &&
    mix.timeSignatures === timeSignatures &&
    mix.markers === markers
  ) {
    return mix;
  }
  return { ...mix, tempoMap, timeSignatures, markers };
}

/** Shift clip startMs at/after fromMs by deltaMs; never touch offsetMs (source read). */
export function shiftClipsFromMs(
  mix: MixDoc,
  fromMs: number,
  deltaMs: number,
): MixDoc {
  if (deltaMs === 0) return mix;
  return {
    ...mix,
    tracks: mix.tracks.map((tr) => ({
      ...tr,
      clips: tr.clips.map((c) => {
        if (c.startMs < fromMs) return c;
        return {
          ...c,
          startMs: Math.max(0, Math.round(c.startMs + deltaMs)),
        };
      }),
    })),
  };
}

export function upsertMixMarker(
  mix: MixDoc,
  marker: MixMarker,
  options?: { shiftClips?: boolean; previousStartMs?: number },
): MixDoc {
  const markers = [...(mix.markers ?? [])];
  const idx = markers.findIndex((m) => m.id === marker.id);
  const prev = idx >= 0 ? markers[idx] : null;
  if (idx >= 0) markers[idx] = marker;
  else markers.push(marker);
  markers.sort((a, b) => a.startMs - b.startMs);
  let next: MixDoc = { ...mix, markers };
  if (options?.shiftClips && prev) {
    const from = options.previousStartMs ?? prev.startMs;
    const delta = marker.startMs - from;
    next = shiftClipsFromMs(next, from, delta);
  }
  return next;
}

export function removeMixMarker(mix: MixDoc, markerId: string): MixDoc {
  return {
    ...mix,
    markers: (mix.markers ?? []).filter((m) => m.id !== markerId),
  };
}

export function upsertTempoEvent(
  mix: MixDoc,
  event: MixTempoEvent,
): MixDoc {
  let tempoMap = [...(mix.tempoMap ?? [])];
  if (tempoMap.length === 0) {
    tempoMap.push({ startMs: 0, quarterBpm: DEFAULT_ARRANGEMENT_BPM });
  }
  const idx = tempoMap.findIndex((e) => e.startMs === event.startMs);
  if (idx >= 0) tempoMap[idx] = event;
  else tempoMap.push(event);
  tempoMap.sort((a, b) => a.startMs - b.startMs);
  return { ...mix, tempoMap };
}

export function removeTempoEvent(mix: MixDoc, startMs: number): MixDoc {
  if (startMs === 0) return mix;
  return {
    ...mix,
    tempoMap: (mix.tempoMap ?? []).filter((e) => e.startMs !== startMs),
  };
}

export function newMarkerId(): string {
  return `mk-${crypto.randomUUID()}`;
}
