import {
  INTERNAL_PPQ,
  TICKS_PER_SIXTEENTH,
  TICKS_PER_THIRTY_SECOND,
} from "../constants.js";
import { ScoreEngineError } from "../types/errors.js";
import type {
  AbcExportOptions,
  ChordEvent,
  NoteEvent,
  ScoreDocument,
  ScoreVoice,
  SongSection,
  TimeSignatureEvent,
} from "../types/score-document.js";
import { midiToAbcPitch, formatKeyField } from "./pitch.js";
import {
  assertValidForExport,
  durationMultiplier,
  type UnitLength,
  validateForAbcExport,
} from "./validate.js";

export type AbcExportResult = {
  abc: string;
  unitLength: UnitLength;
  warnings: string[];
};

function ticksPerBar(
  ts: TimeSignatureEvent | undefined,
  unit: UnitLength,
): number {
  const numerator = ts?.numerator ?? 4;
  const denominator = ts?.denominator ?? 4;
  const quarterTicks = INTERNAL_PPQ;
  const barTicks = numerator * (quarterTicks * (4 / denominator));
  const unitTicks =
    unit === "1/16" ? TICKS_PER_SIXTEENTH : TICKS_PER_THIRTY_SECOND;
  return barTicks / unitTicks;
}

function pickVoice(
  doc: ScoreDocument,
  target: "Vocal" | "Ins",
): ScoreVoice | undefined {
  if (target === "Ins") {
    return doc.voices.find((v) => v.abcVoice === "Ins");
  }
  return doc.voices.find(
    (v) =>
      v.abcVoice === "Vocal" ||
      (!v.abcVoice && (v.role === "vocal" || v.role === "melody")),
  );
}

function sectionComment(kind: SongSection["kind"]): string {
  return `% ${kind}`;
}

function chordAtTick(chords: ChordEvent[], tick: number): string | undefined {
  return chords.find((c) => c.tick === tick)?.symbol;
}

function renderNote(
  note: NoteEvent,
  unit: UnitLength,
  chordSymbol: string | undefined,
  includeChords: boolean,
): string {
  const mult = durationMultiplier(note.durationTick, unit);
  if (mult === null) {
    throw new ScoreEngineError(
      "unaligned_duration",
      `durée non exportable pour ${note.id}`,
    );
  }
  const pitch = midiToAbcPitch(note.pitch);
  const dur = mult === 1 ? "" : String(mult);
  let token = `${pitch}${dur}`;
  if (note.tieStart) {
    token = `${token}-`;
  }
  if (includeChords && chordSymbol) {
    token = `"${chordSymbol}"${token}`;
  }
  return token;
}

function notesToBars(
  notes: NoteEvent[],
  chords: ChordEvent[],
  includeChords: boolean,
  unit: UnitLength,
  unitsPerBar: number,
  fromTick: number,
  toTick: number,
): string[] {
  const unitTicks =
    unit === "1/16" ? TICKS_PER_SIXTEENTH : TICKS_PER_THIRTY_SECOND;
  const barTicks = unitsPerBar * unitTicks;
  const bars: string[] = [];
  let cursor = fromTick;

  while (cursor < toTick) {
    const barEnd = Math.min(cursor + barTicks, toTick);
    const inBar = notes
      .filter((n) => n.startTick >= cursor && n.startTick < barEnd)
      .sort((a, b) => a.startTick - b.startTick);

    const tokens: string[] = [];
    let fill = cursor;
    for (const note of inBar) {
      if (note.startTick > fill) {
        const restUnits = (note.startTick - fill) / unitTicks;
        if (restUnits > 0 && Number.isInteger(restUnits)) {
          tokens.push(restToken(restUnits));
        }
      }
      const sym = chordAtTick(chords, note.startTick);
      tokens.push(renderNote(note, unit, sym, includeChords));
      fill = note.startTick + note.durationTick;
    }
    if (fill < barEnd) {
      const restUnits = (barEnd - fill) / unitTicks;
      if (restUnits > 0 && Number.isInteger(restUnits)) {
        // Prefer chord-on-rest if a chord sits at fill
        const sym = chordAtTick(chords, fill);
        if (includeChords && sym) {
          tokens.push(`"${sym}"${restToken(restUnits)}`);
        } else {
          tokens.push(restToken(restUnits));
        }
      }
    }

    bars.push(tokens.join("") || restToken(unitsPerBar));
    cursor = barEnd;
  }

  return bars;
}

function restToken(units: number): string {
  if (units <= 0) {
    return "";
  }
  return `z${units === 1 ? "" : units}`;
}

function multiMeasureRest(bars: number): string {
  return `Z${bars}`;
}

function groupBars(bars: string[], maxPerGroup = 4): string[][] {
  const groups: string[][] = [];
  for (let i = 0; i < bars.length; i += maxPerGroup) {
    groups.push(bars.slice(i, i + maxPerGroup));
  }
  return groups;
}

/**
 * Export ScoreDocument → YuE2 ABC dialect (§7.3–7.6).
 */
export function exportToYuE2Abc(
  doc: ScoreDocument,
  options: AbcExportOptions,
): AbcExportResult {
  if (options.cot === "off") {
    throw new ScoreEngineError(
      "abc_with_cot_off",
      "un ABC avec cot=off est une erreur locale",
    );
  }

  const validation = validateForAbcExport(doc, { cot: options.cot });
  const unitLength = assertValidForExport(doc, options.cot);
  const warnings = validation.issues
    .filter((i) => i.severity === "warning")
    .map((i) => i.message);

  const tempo = doc.tempoMap[0]!;
  const ts = doc.timeSignatures[0];
  const meter = ts ? `${ts.numerator}/${ts.denominator}` : "4/4";
  const key = doc.keySignatures[0];
  const keyField = key
    ? formatKeyField(key.tonic, key.mode)
    : formatKeyField("C", "major");

  const header = [
    "X:1",
    `T:${options.title ?? ""}`,
    `M:${meter}`,
    `L:${unitLength}`,
    `Q:1/4=${tempo.quarterBpm}`,
    'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
    'V: Ins clef=treble name="Ins Melody" snm="Inst."',
    `K:${keyField}`,
  ];

  const vocal = pickVoice(doc, "Vocal");
  const ins = pickVoice(doc, "Ins");
  const includeChords = options.cot === "full";
  const unitsPerBar = ticksPerBar(ts, unitLength);

  const sections =
    doc.sections.length > 0
      ? [...doc.sections].sort((a, b) => a.startTick - b.startTick)
      : [
          {
            id: "sec-all",
            kind: "other" as const,
            startTick: 0,
          },
        ];

  const endTick = Math.max(
    0,
    ...[...(vocal?.notes ?? []), ...(ins?.notes ?? [])].map(
      (n) => n.startTick + n.durationTick,
    ),
    ...sections.map((s) => s.startTick),
  );

  const body: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const nextStart = sections[i + 1]?.startTick ?? endTick;
    const from = section.startTick;
    const to = Math.max(from, nextStart);

    body.push(sectionComment(section.kind));

    const vocalBars = notesToBars(
      vocal?.notes ?? [],
      includeChords ? doc.chordEvents : [],
      includeChords,
      unitLength,
      unitsPerBar,
      from,
      to,
    );

    const insBars = options.vocalOnly
      ? vocalBars.map(() => multiMeasureRest(1))
      : notesToBars(
          ins?.notes ?? [],
          [],
          false,
          unitLength,
          unitsPerBar,
          from,
          to,
        );

    // If Ins has no notes in range, emit Z for the bar count
    const insEffective =
      !options.vocalOnly && (ins?.notes.length ?? 0) === 0
        ? [multiMeasureRest(Math.max(1, vocalBars.length))]
        : !options.vocalOnly &&
            insBars.every((b) => /^z\d*$/i.test(b) || b === "")
          ? [multiMeasureRest(Math.max(1, vocalBars.length))]
          : insBars;

    // Fixture style: one group of up to 4 bars, Ins as Z4 for empty
    if (
      !options.vocalOnly &&
      (ins?.notes.length ?? 0) === 0 &&
      vocalBars.length > 0
    ) {
      const vocalGroups = groupBars(vocalBars, 4);
      for (const group of vocalGroups) {
        body.push("V: Vocal");
        body.push(`${group.join("|")}|`);
        body.push("V: Ins");
        body.push(`${multiMeasureRest(group.length)}|`);
      }
    } else {
      const vocalGroups = groupBars(vocalBars, 4);
      const insGroups =
        options.vocalOnly || (ins?.notes.length ?? 0) === 0
          ? vocalGroups.map((g) => [multiMeasureRest(g.length)])
          : groupBars(insEffective, 4);

      for (let g = 0; g < vocalGroups.length; g++) {
        const vg = vocalGroups[g]!;
        body.push("V: Vocal");
        body.push(`${vg.join("|")}|`);
        body.push("V: Ins");
        const ig = insGroups[g] ?? [multiMeasureRest(vg.length)];
        if (ig.length === 1 && /^Z\d+$/.test(ig[0]!)) {
          body.push(`${ig[0]}|`);
        } else {
          body.push(`${ig.join("|")}|`);
        }
      }
    }
  }

  const abc = `${[...header, ...body].join("\n")}\n`;
  return { abc, unitLength, warnings };
}

/** Normalize ABC text for fixture comparison (trim trailing spaces, unify newlines). */
export function normalizeAbc(abc: string): string {
  return abc.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trimEnd() + "\n";
}
