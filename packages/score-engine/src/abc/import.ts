/**
 * YuE2 dialect ABC → ScoreDocument (§7.3–7.6 subset).
 * Used by SheetSage2 audio→MIDI draft path (issue #87).
 */

import {
  INTERNAL_PPQ,
  SECTION_KINDS,
  TICKS_PER_SIXTEENTH,
  TICKS_PER_THIRTY_SECOND,
} from "../constants.js";
import type { ScoreIssue } from "../types/errors.js";
import type {
  ChordEvent,
  KeySignatureEvent,
  ModeName,
  NoteEvent,
  ScoreDocument,
  ScoreVoice,
  ScoreVoiceRole,
  SectionKind,
  SongSection,
  TempoEvent,
  TimeSignatureEvent,
} from "../types/score-document.js";
import { abcPitchToMidi } from "./pitch.js";
import { isAcceptedChordSymbol } from "./chords.js";

export type AbcImportResult = {
  document: ScoreDocument;
  issues: ScoreIssue[];
  /** True when no notes were parsed (silence / empty body). */
  empty: boolean;
};

export type AbcImportOptions = {
  id?: string;
  branchName?: string | null;
  sourceFileHash?: string;
};

type UnitLength = "1/16" | "1/32";

type VoiceAccum = {
  notes: NoteEvent[];
  tick: number;
};

function voiceSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "voice";
}

function roleFromAbcVoiceName(name: string): ScoreVoiceRole {
  const n = name.toLowerCase();
  if (n === "vocal" || n.includes("vocal") || n.includes("voix") || n.includes("voice")) {
    return "vocal";
  }
  if (n === "bass" || n.includes("bass") || n.includes("basse")) {
    return "bass";
  }
  if (
    n.includes("drum") ||
    n.includes("perc") ||
    n.includes("batter") ||
    n === "drums"
  ) {
    return "other";
  }
  if (n === "ins" || n.includes("melody") || n.includes("lead")) {
    return "melody";
  }
  if (
    n.includes("harm") ||
    n.includes("piano") ||
    n.includes("guitar") ||
    n.includes("accord")
  ) {
    return "harmony";
  }
  return "accompaniment";
}

function canonAbcVoiceName(raw: string): string {
  const token = raw.trim().split(/\s+/)[0] ?? "Vocal";
  if (/^vocal$/i.test(token)) return "Vocal";
  if (/^ins$/i.test(token)) return "Ins";
  return token;
}

function looksLikeDrumVoice(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("drum") || n.includes("perc") || n.includes("batter");
}

const SECTION_COMMENT: Record<string, SectionKind> = {
  intro: "intro",
  verse: "verse",
  prechorus: "prechorus",
  "pre-chorus": "prechorus",
  chorus: "chorus",
  bridge: "bridge",
  interlude: "interlude",
  outro: "outro",
  other: "other",
};

function newId(prefix: string): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return `${prefix}-${c.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseMeter(raw: string): TimeSignatureEvent | null {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return {
    tick: 0,
    numerator: Number(m[1]),
    denominator: Number(m[2]),
  };
}

function parseTempo(raw: string): TempoEvent | null {
  // Q:1/4=88 or Q:88
  const withUnit = /^1\/4\s*=\s*(\d+)/.exec(raw.trim());
  if (withUnit) {
    return { tick: 0, quarterBpm: Number(withUnit[1]) };
  }
  const plain = /^(\d+)/.exec(raw.trim());
  if (plain) {
    return { tick: 0, quarterBpm: Number(plain[1]) };
  }
  return null;
}

function parseKey(raw: string): KeySignatureEvent | null {
  const m = /^(?:\^|_|=)?([A-Ga-g])(?:m|min|minor)?/.exec(raw.trim());
  if (!m) return null;
  const letter = m[1]!.toUpperCase();
  let tonic = letter;
  if (raw.trim().startsWith("^")) tonic = `${letter}#`;
  if (raw.trim().startsWith("_")) {
    const flatMap: Record<string, string> = {
      D: "Db",
      E: "Eb",
      G: "Gb",
      A: "Ab",
      B: "Bb",
    };
    tonic = flatMap[letter] ?? letter;
  }
  const mode: ModeName = /m(in(or)?)?$/i.test(raw.trim()) ? "minor" : "major";
  return { tick: 0, tonic, mode };
}

function unitTicks(unit: UnitLength): number {
  return unit === "1/32" ? TICKS_PER_THIRTY_SECOND : TICKS_PER_SIXTEENTH;
}

function ticksPerBar(ts: TimeSignatureEvent | undefined): number {
  const numerator = ts?.numerator ?? 4;
  const denominator = ts?.denominator ?? 4;
  return numerator * (INTERNAL_PPQ * (4 / denominator));
}

/**
 * Tokenize one ABC music line (no voice header).
 * Supports chords `"C"`, accidentals, octave marks, durations, ties `-`, rests `z`/`Z`.
 */
function parseMusicLine(
  line: string,
  startTick: number,
  unit: UnitLength,
  barTicks: number,
  issues: ScoreIssue[],
): { notes: NoteEvent[]; chords: ChordEvent[]; endTick: number } {
  const notes: NoteEvent[] = [];
  const chords: ChordEvent[] = [];
  let tick = startTick;
  const u = unitTicks(unit);
  const src = line.replace(/%.*$/, "").trim();
  if (!src) return { notes, chords, endTick: tick };

  const tokenRe =
    /(?:"([^"]*)")|(Z)(\d*)|(z)(\d*)|(\^|_|=)?([A-Ga-g])([,']*)(\d*)(-)?|(\|)/g;

  let match: RegExpExecArray | null;
  let pendingChord: string | null = null;
  let barTickCursor = startTick;

  while ((match = tokenRe.exec(src)) !== null) {
    if (match[1] != null) {
      pendingChord = match[1];
      continue;
    }
    if (match[11] === "|") {
      // Bar line — snap cursor to next bar boundary if we're short (fill rests already emitted).
      const elapsed = tick - barTickCursor;
      if (elapsed > 0 && elapsed < barTicks) {
        // leave as-is; exporter pads rests
      }
      barTickCursor = tick;
      continue;
    }
    if (match[2] === "Z") {
      const bars = match[3] ? Number(match[3]) : 1;
      tick += Math.max(1, bars) * barTicks;
      pendingChord = null;
      continue;
    }
    if (match[4] === "z") {
      const mult = match[5] ? Number(match[5]) : 1;
      if (pendingChord) {
        if (isAcceptedChordSymbol(pendingChord)) {
          chords.push({ tick, symbol: pendingChord });
        } else {
          issues.push({
            code: "validation_failed",
            severity: "warning",
            message: `accord hors dialecte ignoré: ${pendingChord}`,
            ticks: [tick],
          });
        }
        pendingChord = null;
      }
      tick += Math.max(1, mult) * u;
      continue;
    }

    const accidental = match[6] ?? "";
    const letter = match[7];
    if (!letter) continue;
    const oct = match[8] ?? "";
    const durRaw = match[9] ?? "";
    const tie = match[10] === "-";
    const mult = durRaw ? Number(durRaw) : 1;
    const token = `${accidental}${letter}${oct}`;
    let pitch: number;
    try {
      pitch = abcPitchToMidi(token);
    } catch {
      issues.push({
        code: "pitch_out_of_range",
        severity: "warning",
        message: `hauteur ABC non reconnue: ${token}`,
        ticks: [tick],
      });
      pendingChord = null;
      continue;
    }

    if (pendingChord) {
      if (isAcceptedChordSymbol(pendingChord)) {
        chords.push({ tick, symbol: pendingChord });
      } else {
        issues.push({
          code: "validation_failed",
          severity: "warning",
          message: `accord hors dialecte ignoré: ${pendingChord}`,
          ticks: [tick],
        });
      }
      pendingChord = null;
    }

    const durationTick = Math.max(1, mult) * u;
    const note: NoteEvent = {
      id: newId("n"),
      startTick: tick,
      durationTick,
      pitch,
      velocity: 96,
    };
    if (tie) note.tieStart = true;
    notes.push(note);
    tick += durationTick;
  }

  return { notes, chords, endTick: tick };
}

function parseSectionKind(comment: string): SectionKind | null {
  const key = comment.trim().toLowerCase();
  if (key in SECTION_COMMENT) return SECTION_COMMENT[key]!;
  if ((SECTION_KINDS as readonly string[]).includes(key)) {
    return key as SectionKind;
  }
  return null;
}

/**
 * Import YuE2-dialect ABC into a ScoreDocument draft.
 * Does not invent notes for empty / silent input — returns empty=true.
 */
export function importAbcToScoreDocument(
  abc: string,
  options: AbcImportOptions = {},
): AbcImportResult {
  const issues: ScoreIssue[] = [];
  const text = abc.replace(/\r\n/g, "\n").trim();
  if (!text) {
    issues.push({
      code: "validation_failed",
      severity: "warning",
      message: "ABC vide — aucune note détectée",
    });
    return {
      document: emptyDoc(options),
      issues,
      empty: true,
    };
  }

  let unit: UnitLength = "1/16";
  let tempo: TempoEvent = { tick: 0, quarterBpm: 120 };
  let meter: TimeSignatureEvent = { tick: 0, numerator: 4, denominator: 4 };
  let key: KeySignatureEvent = { tick: 0, tonic: "C", mode: "major" };
  const sections: SongSection[] = [];
  const chordEvents: ChordEvent[] = [];

  const voices = new Map<string, VoiceAccum>();
  const ensureVoice = (name: string): VoiceAccum => {
    let acc = voices.get(name);
    if (!acc) {
      acc = { notes: [], tick: 0 };
      voices.set(name, acc);
    }
    return acc;
  };
  ensureVoice("Vocal");
  let currentVoice: string | null = null;
  let bodyStarted = false;
  let sectionTickAnchor = 0;

  const maxVoiceTick = (): number => {
    let max = sectionTickAnchor;
    for (const acc of voices.values()) {
      if (acc.tick > max) max = acc.tick;
    }
    return max;
  };

  const lines = text.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("%")) {
      const kind = parseSectionKind(trimmed.slice(1));
      if (kind) {
        const startTick = maxVoiceTick();
        sections.push({
          id: newId("sec"),
          kind,
          startTick,
        });
        sectionTickAnchor = startTick;
        for (const acc of voices.values()) {
          acc.tick = startTick;
        }
      }
      continue;
    }

    const header = /^([A-Za-z]):\s*(.*)$/.exec(trimmed);
    if (header && !bodyStarted) {
      const field = header[1]!.toUpperCase();
      const value = header[2] ?? "";
      switch (field) {
        case "L": {
          if (value.includes("1/32")) unit = "1/32";
          else unit = "1/16";
          break;
        }
        case "M": {
          const m = parseMeter(value);
          if (m) meter = m;
          break;
        }
        case "Q": {
          const q = parseTempo(value);
          if (q) tempo = q;
          break;
        }
        case "K": {
          const k = parseKey(value);
          if (k) key = k;
          // K: ends header in ABC — subsequent V: / notes are body.
          bodyStarted = true;
          break;
        }
        case "V": {
          // Voice defs in header — remember names, notes start in body.
          const name = canonAbcVoiceName(value);
          ensureVoice(name);
          break;
        }
        default:
          break;
      }
      continue;
    }

    // Body voice switch — any ABC voice id, not only Vocal/Ins (#340).
    const voiceLine = /^V:\s*(\S+)/i.exec(trimmed);
    if (voiceLine) {
      bodyStarted = true;
      const name = canonAbcVoiceName(voiceLine[1] ?? "Vocal");
      currentVoice = name;
      ensureVoice(name);
      continue;
    }

    // Header-like after body (rare) — treat as music if looks like notes
    if (/^[A-Za-z]:/.test(trimmed) && !bodyStarted) {
      continue;
    }

    bodyStarted = true;
    if (!currentVoice) {
      // Default to Vocal for monophonic SheetSage melody dumps.
      currentVoice = "Vocal";
      ensureVoice("Vocal");
    }

    const barTicks = ticksPerBar(meter);
    const target = ensureVoice(currentVoice);
    const parsed = parseMusicLine(
      trimmed,
      target.tick,
      unit,
      barTicks,
      issues,
    );
    target.notes.push(...parsed.notes);
    chordEvents.push(...parsed.chords);
    target.tick = parsed.endTick;
  }

  const vocalAcc = voices.get("Vocal") ?? { notes: [], tick: 0 };
  const insAcc = voices.get("Ins");
  const extraNames = [...voices.keys()].filter(
    (name) => name !== "Vocal" && name !== "Ins",
  );
  const noteCount = [...voices.values()].reduce(
    (sum, acc) => sum + acc.notes.length,
    0,
  );

  if (noteCount === 0) {
    issues.push({
      code: "validation_failed",
      severity: "warning",
      message:
        "Aucune note détectée dans l’ABC (silence, polyphonie non reconnue, ou format hors dialecte).",
    });
  }

  // Detect likely polyphony: overlapping notes in Vocal
  const sorted = [...vocalAcc.notes].sort((a, b) => a.startTick - b.startTick);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.startTick < prev.startTick + prev.durationTick) {
      issues.push({
        code: "midi_overlapping_notes",
        severity: "warning",
        message:
          "Chevauchements détectés — transcription monophonique incertaine; corrigez dans le piano roll.",
        ticks: [cur.startTick],
      });
      break;
    }
  }

  if (extraNames.some(looksLikeDrumVoice)) {
    issues.push({
      code: "validation_failed",
      severity: "warning",
      message:
        "Voix batterie/percussion : SheetSage2 transcrit surtout des hauteurs ; les drums restent approximatifs.",
    });
  }

  const scoreVoices: ScoreVoice[] = [
    {
      id: "voice-vocal",
      name: "Vocal",
      role: "vocal",
      abcVoice: "Vocal",
      notes: vocalAcc.notes,
    },
  ];
  if (insAcc && insAcc.notes.length > 0) {
    scoreVoices.push({
      id: "voice-ins",
      name: "Ins",
      role: "melody",
      abcVoice: "Ins",
      notes: insAcc.notes,
    });
  }
  for (const name of extraNames) {
    const acc = voices.get(name)!;
    if (acc.notes.length === 0) continue;
    scoreVoices.push({
      id: `voice-${voiceSlug(name)}`,
      name,
      role: roleFromAbcVoiceName(name),
      abcVoice: name,
      notes: acc.notes,
    });
  }

  const document: ScoreDocument = {
    id: options.id ?? newId("score"),
    version: 1,
    ppq: INTERNAL_PPQ,
    tempoMap: [tempo],
    timeSignatures: [meter],
    keySignatures: [key],
    sections,
    voices: scoreVoices,
    chordEvents,
    lyricAnchors: [],
    source: "abc",
    parentScoreId: null,
    branchName: options.branchName ?? "sheetsage-draft",
  };
  if (options.sourceFileHash) {
    document.sourceFileHash = options.sourceFileHash;
  }

  return {
    document,
    issues,
    empty: noteCount === 0,
  };
}

function emptyDoc(options: AbcImportOptions): ScoreDocument {
  const document: ScoreDocument = {
    id: options.id ?? newId("score"),
    version: 1,
    ppq: INTERNAL_PPQ,
    tempoMap: [{ tick: 0, quarterBpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [{ tick: 0, tonic: "C", mode: "major" }],
    sections: [],
    voices: [
      {
        id: "voice-vocal",
        name: "Vocal",
        role: "vocal",
        abcVoice: "Vocal",
        notes: [],
      },
    ],
    chordEvents: [],
    lyricAnchors: [],
    source: "abc",
    parentScoreId: null,
    branchName: options.branchName ?? "sheetsage-draft",
  };
  if (options.sourceFileHash) {
    document.sourceFileHash = options.sourceFileHash;
  }
  return document;
}
