import { INTERNAL_PPQ } from "../constants.js";
import type { ScoreDocument } from "../types/score-document.js";

/**
 * Export a ScoreDocument to a Format 1 SMF (multi-track).
 * Preserves tempo, time/key signatures, velocity, and one MIDI track per voice.
 */
export function exportScoreDocumentToMidi(doc: ScoreDocument): Uint8Array {
  const ppq = doc.ppq || INTERNAL_PPQ;
  const header: number[] = [];
  header.push(...[0x4d, 0x54, 0x68, 0x64]);
  const trackCount = 1 + Math.max(1, doc.voices.length);
  header.push(...u32(6), ...u16(1), ...u16(trackCount), ...u16(ppq));

  const tracks: number[][] = [];
  tracks.push(buildConductorTrack(doc));

  if (doc.voices.length === 0) {
    tracks.push(buildNoteTrack("empty", [], 0));
  } else {
    doc.voices.forEach((voice, index) => {
      tracks.push(buildNoteTrack(voice.name || `Track ${index + 1}`, voice.notes, index));
    });
  }

  const parts: number[] = [...header];
  for (const track of tracks) {
    parts.push(...[0x4d, 0x54, 0x72, 0x6b], ...u32(track.length), ...track);
  }
  return Uint8Array.from(parts);
}

function buildConductorTrack(doc: ScoreDocument): number[] {
  const events: { tick: number; bytes: number[] }[] = [];

  const tempos =
    doc.tempoMap.length > 0 ? doc.tempoMap : [{ tick: 0, quarterBpm: 120 }];
  for (const t of tempos) {
    const uspq = Math.round(60_000_000 / Math.max(1, t.quarterBpm));
    events.push({
      tick: Math.max(0, t.tick),
      bytes: [
        0xff,
        0x51,
        0x03,
        (uspq >> 16) & 0xff,
        (uspq >> 8) & 0xff,
        uspq & 0xff,
      ],
    });
  }

  const meters =
    doc.timeSignatures.length > 0
      ? doc.timeSignatures
      : [{ tick: 0, numerator: 4, denominator: 4 }];
  for (const m of meters) {
    const denomPow = Math.round(Math.log2(m.denominator));
    events.push({
      tick: Math.max(0, m.tick),
      bytes: [0xff, 0x58, 0x04, m.numerator & 0xff, denomPow & 0xff, 0x18, 0x08],
    });
  }

  for (const k of doc.keySignatures) {
    events.push({
      tick: Math.max(0, k.tick),
      bytes: [
        0xff,
        0x59,
        0x02,
        tonicModeToSf(k.tonic, k.mode) & 0xff,
        k.mode === "minor" ? 1 : 0,
      ],
    });
  }

  return encodeTrackEvents(events);
}

function buildNoteTrack(
  name: string,
  notes: { startTick: number; durationTick: number; pitch: number; velocity: number }[],
  channel: number,
): number[] {
  const events: { tick: number; bytes: number[] }[] = [];
  const nameBytes = [...name].map((c) => c.charCodeAt(0) & 0x7f).slice(0, 32);
  events.push({
    tick: 0,
    bytes: [0xff, 0x03, nameBytes.length, ...nameBytes],
  });

  type Edge = { tick: number; on: boolean; pitch: number; velocity: number };
  const edges: Edge[] = [];
  const ch = Math.min(15, Math.max(0, channel));
  for (const n of notes) {
    const vel = Math.min(127, Math.max(1, Math.round(n.velocity)));
    const pitch = Math.min(127, Math.max(0, Math.round(n.pitch)));
    edges.push({
      tick: Math.max(0, n.startTick),
      on: true,
      pitch,
      velocity: vel,
    });
    edges.push({
      tick: Math.max(0, n.startTick + Math.max(1, n.durationTick)),
      on: false,
      pitch,
      velocity: 0,
    });
  }
  edges.sort((a, b) => a.tick - b.tick || Number(b.on) - Number(a.on));
  for (const e of edges) {
    if (e.on) {
      events.push({
        tick: e.tick,
        bytes: [0x90 | ch, e.pitch, e.velocity],
      });
    } else {
      events.push({
        tick: e.tick,
        bytes: [0x80 | ch, e.pitch, 0x00],
      });
    }
  }
  return encodeTrackEvents(events);
}

function encodeTrackEvents(events: { tick: number; bytes: number[] }[]): number[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick);
  const track: number[] = [];
  let lastTick = 0;
  for (const e of sorted) {
    const delta = Math.max(0, e.tick - lastTick);
    track.push(...writeVarLen(delta), ...e.bytes);
    lastTick = e.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  return track;
}

function tonicModeToSf(tonic: string, mode: "major" | "minor"): number {
  const majors: Record<string, number> = {
    C: 0,
    G: 1,
    D: 2,
    A: 3,
    E: 4,
    B: 5,
    "F#": 6,
    "C#": 7,
    F: -1,
    Bb: -2,
    Eb: -3,
    Ab: -4,
    Db: -5,
    Gb: -6,
    Cb: -7,
  };
  const minors: Record<string, number> = {
    A: 0,
    E: 1,
    B: 2,
    "F#": 3,
    "C#": 4,
    "G#": 5,
    "D#": 6,
    "A#": 7,
    D: -1,
    G: -2,
    C: -3,
    F: -4,
    Bb: -5,
    Eb: -6,
    Ab: -7,
  };
  const table = mode === "minor" ? minors : majors;
  return table[tonic] ?? 0;
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
