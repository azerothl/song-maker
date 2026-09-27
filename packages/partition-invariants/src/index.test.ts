import { describe, expect, it } from "vitest";
import {
  CONSERVATION_LEVELS,
  createPartitionInvariantChecker,
  isConservationLevel,
  pitchContour,
  snapshotFromScoreDocument,
  LIMITED_ADAPTATION_SEMITONES,
} from "./index.js";
import type { ScoreEventSnapshot } from "./index.js";

const before: ScoreEventSnapshot = {
  tempoQuarterBpm: 88,
  notes: [
    {
      id: "n1",
      voiceId: "vocal",
      pitch: 60,
      startTick: 0,
      durationTicks: 480,
    },
    {
      id: "n2",
      voiceId: "vocal",
      pitch: 64,
      startTick: 480,
      durationTicks: 480,
    },
    {
      id: "n3",
      voiceId: "vocal",
      pitch: 62,
      startTick: 960,
      durationTicks: 480,
    },
  ],
  chords: [{ tick: 0, symbol: "C" }],
  sections: [{ id: "s1", kind: "verse", startTick: 0 }],
};

describe("partition-invariants", () => {
  it("exposes all §11.3 conservation levels", () => {
    expect(CONSERVATION_LEVELS).toContain("exact_pitches");
    expect(CONSERVATION_LEVELS).toContain("structure_change");
    expect(isConservationLevel("contour_only")).toBe(true);
    expect(isConservationLevel("abc_text")).toBe(false);
  });

  it("detects pitch drift on exact_pitches", () => {
    const checker = createPartitionInvariantChecker();
    const after: ScoreEventSnapshot = {
      ...before,
      notes: [
        { ...before.notes[0]!, pitch: 62 },
        before.notes[1]!,
        before.notes[2]!,
      ],
    };
    const result = checker.check("exact_pitches", before, after);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe("pitch_changed");
  });

  it("passes pitches_and_rhythms when events match", () => {
    const checker = createPartitionInvariantChecker();
    const result = checker.check("pitches_and_rhythms", before, before);
    expect(result.ok).toBe(true);
  });

  it("checks contour on successive pitch signs", () => {
    expect(pitchContour(before.notes)).toEqual([1, -1]);
    const checker = createPartitionInvariantChecker();
    const sameContour: ScoreEventSnapshot = {
      ...before,
      notes: [
        { ...before.notes[0]!, pitch: 55 },
        { ...before.notes[1]!, pitch: 67 },
        { ...before.notes[2]!, pitch: 60 },
      ],
    };
    expect(checker.check("contour_only", before, sameContour).ok).toBe(true);
    const broken: ScoreEventSnapshot = {
      ...before,
      notes: [
        before.notes[0]!,
        { ...before.notes[1]!, pitch: 58 },
        before.notes[2]!,
      ],
    };
    const result = checker.check("contour_only", before, broken);
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe("contour_changed");
  });

  it("limits melodic adaptation to ±N semitones with rhythm conserved", () => {
    const checker = createPartitionInvariantChecker();
    const ok: ScoreEventSnapshot = {
      ...before,
      notes: before.notes.map((n, i) =>
        i === 0 ? { ...n, pitch: n.pitch + LIMITED_ADAPTATION_SEMITONES } : n,
      ),
    };
    expect(checker.check("limited_melodic_adaptation", before, ok).ok).toBe(
      true,
    );
    const tooFar: ScoreEventSnapshot = {
      ...before,
      notes: [{ ...before.notes[0]!, pitch: 60 + LIMITED_ADAPTATION_SEMITONES + 1 }, before.notes[1]!, before.notes[2]!],
    };
    const result = checker.check("limited_melodic_adaptation", before, tooFar);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.code === "adaptation_too_large")).toBe(
      true,
    );
  });

  it("allows chord changes under reharmonization when melody holds", () => {
    const checker = createPartitionInvariantChecker();
    const after: ScoreEventSnapshot = {
      ...before,
      chords: [{ tick: 0, symbol: "Am7" }],
    };
    expect(checker.check("reharmonization", before, after).ok).toBe(true);
  });

  it("allows tempo change when notes are conserved", () => {
    const checker = createPartitionInvariantChecker();
    const after: ScoreEventSnapshot = { ...before, tempoQuarterBpm: 120 };
    expect(checker.check("tempo_change", before, after).ok).toBe(true);
  });

  it("allows section changes under structure_change when notes hold", () => {
    const checker = createPartitionInvariantChecker();
    const after: ScoreEventSnapshot = {
      ...before,
      sections: [
        { id: "s1", kind: "chorus", startTick: 0 },
        { id: "s2", kind: "bridge", startTick: 1920 },
      ],
    };
    expect(checker.check("structure_change", before, after).ok).toBe(true);
  });

  it("builds snapshots from ScoreDocument-like objects", () => {
    const snap = snapshotFromScoreDocument({
      tempoMap: [{ tick: 0, quarterBpm: 100 }],
      voices: [
        {
          id: "v1",
          notes: [
            { id: "a", pitch: 60, startTick: 0, durationTick: 240 },
          ],
        },
      ],
      chordEvents: [],
      sections: [],
    });
    expect(snap.tempoQuarterBpm).toBe(100);
    expect(snap.notes[0]?.durationTicks).toBe(240);
  });
});
