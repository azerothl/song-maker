import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterNotesInPianoViewport,
  filterSectionMarkersInPianoViewport,
  noteHorizontalSpanPx,
} from "./pianoRollViewport";

describe("pianoRollViewport", () => {
  it("noteHorizontalSpanPx respecte la largeur minimale", () => {
    const span = noteHorizontalSpanPx(0, 1, 0.04);
    assert.equal(span.left, 0);
    assert.equal(span.right, 6);
  });

  it("filterNotesInPianoViewport garde la sélection hors fenêtre", () => {
    const notes = [
      { id: "near", startTick: 10_000, durationTick: 480 },
      { id: "far", startTick: 4_000_000, durationTick: 480 },
    ];
    const scrollLeft = 10_000 * 0.04;
    const visible = filterNotesInPianoViewport(notes, scrollLeft, 800, 0.04, {
      selectedId: "far",
      overscanPx: 0,
    });
    assert.deepEqual(visible.map((n) => n.id), ["near", "far"]);
  });

  it("filterNotesInPianoViewport fenêtre horizontale avec overscan", () => {
    const notes = [
      { id: "in", startTick: 1000, durationTick: 480 },
      { id: "out", startTick: 50_000, durationTick: 480 },
    ];
    const visible = filterNotesInPianoViewport(notes, 0, 800, 0.04, {
      overscanPx: 100,
    });
    assert.deepEqual(visible.map((n) => n.id), ["in"]);
  });

  it("filterSectionMarkersInPianoViewport", () => {
    const sections = [
      { id: "s1", startTick: 0 },
      { id: "s2", startTick: 100_000 },
    ];
    const visible = filterSectionMarkersInPianoViewport(
      sections,
      0,
      800,
      0.04,
      0,
    );
    assert.deepEqual(visible.map((s) => s.id), ["s1"]);
  });
});
