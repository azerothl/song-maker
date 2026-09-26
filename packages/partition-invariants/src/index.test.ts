import { describe, expect, it } from "vitest";
import {
  CONSERVATION_LEVELS,
  createPartitionInvariantChecker,
  isConservationLevel,
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
      notes: [{ ...before.notes[0]!, pitch: 62 }],
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

  it("returns stub_unimplemented for contour and structure levels", () => {
    const checker = createPartitionInvariantChecker();
    const contour = checker.check("contour_only", before, before);
    expect(contour.violations[0]?.code).toBe("stub_unimplemented");
    const structure = checker.check("structure_change", before, before);
    expect(structure.ok).toBe(false);
  });
});
