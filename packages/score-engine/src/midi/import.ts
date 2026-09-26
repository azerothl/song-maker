import { createHash } from "node:crypto";
import { INTERNAL_PPQ } from "../constants.js";
import {
  ScoreEngineError,
  type ScoreIssue,
} from "../types/errors.js";
import type { ScoreDocument, ScoreVoice } from "../types/score-document.js";

export type MidiImportWarningCode =
  | "overlapping_notes"
  | "ambiguous_channel"
  | "tempo_changes"
  | "ambiguous_melody"
  | "quantization_suggested";

export type MidiImportResult = {
  document: ScoreDocument;
  /** Original tracks preserved without modification (§7.2). */
  originalTracks: MidiTrackSnapshot[];
  issues: ScoreIssue[];
  /**
   * Suggested quantization grid in ticks (e.g. 120).
   * Never applied silently — caller must confirm (§7.2).
   */
  suggestedQuantizeTicks: number | null;
};

export type MidiTrackSnapshot = {
  index: number;
  name: string | null;
  channel: number | null;
  noteCount: number;
};

export type MidiImportOptions = {
  /** Confirm applying quantization; default false = never apply. */
  applyQuantize?: boolean;
  quantizeTicks?: number;
  /** Force which track index is the main melody when detection is uncertain. */
  melodyTrackIndex?: number;
  sourceFileHash?: string;
  id?: string;
};

type ParsedMidi = {
  ppq: number;
  tracks: ParsedTrack[];
  tempos: { tick: number; quarterBpm: number }[];
  timeSignatures: {
    tick: number;
    numerator: number;
    denominator: number;
  }[];
  keySignatures: {
    tick: number;
    tonic: string;
    mode: "major" | "minor";
  }[];
};

type ParsedTrack = {
  name: string | null;
  channel: number | null;
  notes: {
    startTick: number;
    durationTick: number;
    pitch: number;
    velocity: number;
    channel: number;
  }[];
};

/**
 * MIDI → ScoreDocument import (§7.2).
 *
 * Scaffold: parses Format 0/1 SMF note-ons/offs, tempo, time signature.
 * Does not silently quantize. Marks ambiguous melody / overlaps as issues.
 */
export function importMidiToScoreDocument(
  bytes: Uint8Array,
  options: MidiImportOptions = {},
): MidiImportResult {
  const parsed = parseSmf(bytes);
  const issues: ScoreIssue[] = [];

  if (parsed.tempos.length > 1) {
    issues.push({
      code: "midi_tempo_changes",
      severity: "warning",
      message: "changements de tempo détectés à l'import",
      ticks: parsed.tempos.map((t) => t.tick),
    });
  }

  const scale = INTERNAL_PPQ / parsed.ppq;
  const toInternal = (tick: number) => Math.round(tick * scale);

  const originalTracks: MidiTrackSnapshot[] = parsed.tracks.map((t, index) => ({
    index,
    name: t.name,
    channel: t.channel,
    noteCount: t.notes.length,
  }));

  const channels = new Set(
    parsed.tracks.flatMap((t) => t.notes.map((n) => n.channel)),
  );
  if (channels.size > 1 && parsed.tracks.length === 1) {
    issues.push({
      code: "midi_ambiguous_channel",
      severity: "warning",
      message: "canaux ambigus sur une seule piste",
    });
  }

  let melodyIndex = options.melodyTrackIndex;
  if (melodyIndex === undefined) {
    const candidates = parsed.tracks
      .map((t, i) => ({ i, n: t.notes.length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);
    if (candidates.length === 0) {
      melodyIndex = 0;
    } else if (candidates.length > 1 && candidates[0]!.n === candidates[1]!.n) {
      issues.push({
        code: "midi_ambiguous_melody",
        severity: "warning",
        message:
          "détection de mélodie principale incertaine — préciser melodyTrackIndex",
      });
      melodyIndex = candidates[0]!.i;
    } else {
      melodyIndex = candidates[0]!.i;
    }
  }

  const suggestedQuantizeTicks = 120;
  let needsQuantizeHint = false;

  const voices: ScoreVoice[] = parsed.tracks.map((track, index) => {
    const notes = track.notes.map((n, ni) => {
      let start = toInternal(n.startTick);
      let dur = toInternal(n.durationTick);
      if (
        start % suggestedQuantizeTicks !== 0 ||
        dur % suggestedQuantizeTicks !== 0
      ) {
        needsQuantizeHint = true;
      }
      if (options.applyQuantize) {
        const q = options.quantizeTicks ?? suggestedQuantizeTicks;
        start = Math.round(start / q) * q;
        dur = Math.max(q, Math.round(dur / q) * q);
      }
      return {
        id: `trk${index}-n${ni}`,
        startTick: start,
        durationTick: dur,
        pitch: n.pitch,
        velocity: n.velocity,
      };
    });

    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const a = notes[i]!;
        const b = notes[j]!;
        if (
          a.startTick < b.startTick + b.durationTick &&
          b.startTick < a.startTick + a.durationTick
        ) {
          issues.push({
            code: "midi_overlapping_notes",
            severity: "warning",
            message: "notes superposées à l'import",
            noteIds: [a.id, b.id],
          });
        }
      }
    }

    const isMelody = index === melodyIndex;
    return {
      id: `voice-${index}`,
      name: track.name ?? `Track ${index + 1}`,
      role: isMelody ? ("melody" as const) : ("other" as const),
      notes,
      ...(isMelody ? { abcVoice: "Vocal" as const } : {}),
    };
  });

  if (needsQuantizeHint && !options.applyQuantize) {
    issues.push({
      code: "validation_failed",
      severity: "warning",
      message:
        "quantification proposée (triple-croche / 120 ticks) — confirmation requise",
    });
  }

  const hash =
    options.sourceFileHash ??
    createHash("sha256").update(bytes).digest("hex");

  const document: ScoreDocument = {
    id: options.id ?? cryptoRandomId(),
    version: 1,
    ppq: INTERNAL_PPQ,
    tempoMap: (parsed.tempos.length > 0
      ? parsed.tempos
      : [{ tick: 0, quarterBpm: 120 }]
    ).map((t) => ({
      tick: toInternal(t.tick),
      quarterBpm: t.quarterBpm,
    })),
    timeSignatures: parsed.timeSignatures.map((t) => ({
      tick: toInternal(t.tick),
      numerator: t.numerator,
      denominator: t.denominator,
    })),
    keySignatures: parsed.keySignatures.map((k) => ({
      tick: toInternal(k.tick),
      tonic: k.tonic,
      mode: k.mode,
    })),
    sections: [],
    voices,
    chordEvents: [],
    lyricAnchors: [],
    source: "midi",
    sourceFileHash: hash,
  };

  return {
    document,
    originalTracks,
    issues,
    suggestedQuantizeTicks: needsQuantizeHint ? suggestedQuantizeTicks : null,
  };
}

/** Stub: apply confirmed quantization to a document copy. */
export function applyQuantization(
  doc: ScoreDocument,
  quantizeTicks: number,
): ScoreDocument {
  if (quantizeTicks <= 0) {
    throw new ScoreEngineError(
      "validation_failed",
      "quantizeTicks must be > 0",
    );
  }
  return {
    ...doc,
    version: doc.version + 1,
    voices: doc.voices.map((v) => ({
      ...v,
      notes: v.notes.map((n) => ({
        ...n,
        startTick: Math.round(n.startTick / quantizeTicks) * quantizeTicks,
        durationTick: Math.max(
          quantizeTicks,
          Math.round(n.durationTick / quantizeTicks) * quantizeTicks,
        ),
      })),
    })),
  };
}

function cryptoRandomId(): string {
  return `score-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseSmf(bytes: Uint8Array): ParsedMidi {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 14 || readAscii(bytes, 0, 4) !== "MThd") {
    throw new ScoreEngineError(
      "validation_failed",
      "fichier MIDI invalide : en-tête MThd manquant",
    );
  }
  const headerLength = view.getUint32(4);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) {
    throw new ScoreEngineError(
      "not_implemented",
      "division SMPTE MIDI non supportée dans ce scaffold",
    );
  }
  if (format > 1) {
    throw new ScoreEngineError(
      "not_implemented",
      `format MIDI ${format} non supporté (0/1 seulement)`,
    );
  }

  let offset = 8 + headerLength;
  const tracks: ParsedTrack[] = [];
  const tempos: ParsedMidi["tempos"] = [];
  const timeSignatures: ParsedMidi["timeSignatures"] = [];
  const keySignatures: ParsedMidi["keySignatures"] = [];

  for (let t = 0; t < trackCount; t++) {
    if (readAscii(bytes, offset, 4) !== "MTrk") {
      throw new ScoreEngineError(
        "validation_failed",
        `piste ${t}: chunk MTrk manquant`,
      );
    }
    const trackLen = view.getUint32(offset + 4);
    const trackStart = offset + 8;
    const trackEnd = trackStart + trackLen;
    offset = trackEnd;

    const notes: ParsedTrack["notes"] = [];
    const open = new Map<string, { tick: number; velocity: number; channel: number }>();
    let tick = 0;
    let i = trackStart;
    let runningStatus = 0;
    let trackName: string | null = null;
    let lastChannel: number | null = null;

    while (i < trackEnd) {
      const { value: delta, size } = readVarLen(bytes, i);
      i += size;
      tick += delta;
      if (i >= trackEnd) break;
      let status = bytes[i]!;
      if (status < 0x80) {
        status = runningStatus;
      } else {
        runningStatus = status;
        i += 1;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;

      if (status === 0xff) {
        const metaType = bytes[i++]!;
        const { value: len, size: lenSize } = readVarLen(bytes, i);
        i += lenSize;
        const data = bytes.subarray(i, i + len);
        i += len;
        if (metaType === 0x51 && len === 3) {
          const uspq = (data[0]! << 16) | (data[1]! << 8) | data[2]!;
          tempos.push({
            tick,
            quarterBpm: Math.round(60_000_000 / uspq),
          });
        } else if (metaType === 0x58 && len >= 2) {
          timeSignatures.push({
            tick,
            numerator: data[0]!,
            denominator: 2 ** data[1]!,
          });
        } else if (metaType === 0x59 && len >= 2) {
          const sf = data[0]! > 127 ? data[0]! - 256 : data[0]!;
          const mi = data[1]!;
          keySignatures.push({
            tick,
            tonic: sharpFlatToTonic(sf),
            mode: mi === 1 ? "minor" : "major",
          });
        } else if (metaType === 0x03) {
          trackName = new TextDecoder("utf-8").decode(data);
        }
        continue;
      }

      if (eventType === 0x90 || eventType === 0x80) {
        const pitch = bytes[i++]!;
        const velocity = bytes[i++]!;
        lastChannel = channel;
        const key = `${channel}:${pitch}`;
        if (eventType === 0x90 && velocity > 0) {
          open.set(key, { tick, velocity, channel });
        } else {
          const start = open.get(key);
          if (start) {
            notes.push({
              startTick: start.tick,
              durationTick: Math.max(1, tick - start.tick),
              pitch,
              velocity: start.velocity,
              channel,
            });
            open.delete(key);
          }
        }
        continue;
      }

      // Skip other channel voice / sysex roughly
      if (eventType === 0xc0 || eventType === 0xd0) {
        i += 1;
      } else if (status === 0xf0 || status === 0xf7) {
        const { value: len, size: lenSize } = readVarLen(bytes, i);
        i += lenSize + len;
      } else {
        i += 2;
      }
    }

    tracks.push({
      name: trackName,
      channel: lastChannel,
      notes,
    });
  }

  void format;
  return {
    ppq: division,
    tracks,
    tempos,
    timeSignatures,
    keySignatures,
  };
}

function sharpFlatToTonic(sf: number): string {
  const majors = ["C", "G", "D", "A", "E", "B", "F#", "C#"];
  const flats = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];
  if (sf >= 0) {
    return majors[Math.min(sf, 7)] ?? "C";
  }
  return flats[Math.min(-sf, 7)] ?? "C";
}

function readAscii(bytes: Uint8Array, start: number, len: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + len));
}

function readVarLen(
  bytes: Uint8Array,
  offset: number,
): { value: number; size: number } {
  let value = 0;
  let size = 0;
  while (true) {
    const b = bytes[offset + size]!;
    size += 1;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
    if (size > 4) {
      throw new ScoreEngineError(
        "validation_failed",
        "variable-length quantity MIDI trop longue",
      );
    }
  }
  return { value, size };
}

/**
 * Build a minimal Format 0 SMF for tests.
 * Exposed for fixtures — not part of the public Phase 1 surface.
 */
export function buildMinimalMidi(options: {
  ppq?: number;
  tempoBpm?: number;
  notes: { startTick: number; durationTick: number; pitch: number; velocity?: number }[];
}): Uint8Array {
  const ppq = options.ppq ?? 480;
  const parts: number[] = [];
  // MThd
  parts.push(...[0x4d, 0x54, 0x68, 0x64]);
  parts.push(...u32(6), ...u16(0), ...u16(1), ...u16(ppq));

  const track: number[] = [];
  // tempo
  const uspq = Math.round(60_000_000 / (options.tempoBpm ?? 88));
  track.push(0x00, 0xff, 0x51, 0x03, (uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff);
  // time sig 4/4
  track.push(0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  let lastTick = 0;
  const sorted = [...options.notes].sort((a, b) => a.startTick - b.startTick);
  type Edge = { tick: number; on: boolean; pitch: number; velocity: number };
  const edges: Edge[] = [];
  for (const n of sorted) {
    edges.push({
      tick: n.startTick,
      on: true,
      pitch: n.pitch,
      velocity: n.velocity ?? 80,
    });
    edges.push({
      tick: n.startTick + n.durationTick,
      on: false,
      pitch: n.pitch,
      velocity: 0,
    });
  }
  edges.sort((a, b) => a.tick - b.tick || Number(b.on) - Number(a.on));
  for (const e of edges) {
    const delta = e.tick - lastTick;
    track.push(...writeVarLen(delta));
    if (e.on) {
      track.push(0x90, e.pitch, e.velocity);
    } else {
      track.push(0x80, e.pitch, 0x00);
    }
    lastTick = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  parts.push(...[0x4d, 0x54, 0x72, 0x6b], ...u32(track.length), ...track);
  return Uint8Array.from(parts);
}

function u16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}
function u32(n: number): number[] {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
function writeVarLen(value: number): number[] {
  const buffer: number[] = [];
  let v = value;
  buffer.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    buffer.push(0x80 | (v & 0x7f));
    v >>= 7;
  }
  return buffer.reverse();
}
