import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPianoNotesIndex,
  filterNotesInPianoViewport,
  filterNotesInPianoViewportIndexed,
  filterSectionMarkersInPianoViewport,
  noteHorizontalSpanPx,
  quantizePianoScrollLeft,
  shouldSyncPianoScrollViewport,
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

  it("filterNotesInPianoViewport garde la note au focus hors fenêtre", () => {
    const notes = [
      { id: "near", startTick: 10_000, durationTick: 480 },
      { id: "far", startTick: 4_000_000, durationTick: 480 },
    ];
    const scrollLeft = 10_000 * 0.04;
    const visible = filterNotesInPianoViewport(notes, scrollLeft, 800, 0.04, {
      focusedId: "far",
      overscanPx: 0,
    });
    assert.deepEqual(visible.map((n) => n.id).sort(), ["far", "near"]);
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

  it("index + filtre : même ensemble que le filtre naïf sur 200 notes", () => {
    const notes = Array.from({ length: 200 }, (_, i) => ({
      id: `n${i}`,
      startTick: i * 2_000,
      durationTick: 480,
    }));
    const scrollLeft = 40_000 * 0.04;
    const naive = filterNotesInPianoViewport(notes, scrollLeft, 800, 0.04, {
      overscanPx: 200,
      selectedId: "n199",
    });
    const indexed = filterNotesInPianoViewportIndexed(
      buildPianoNotesIndex(notes, 0.04),
      scrollLeft,
      800,
      { overscanPx: 200, selectedId: "n199" },
    );
    assert.deepEqual(
      indexed.map((n) => n.id).sort(),
      naive.map((n) => n.id).sort(),
    );
  });

  it("quantizePianoScrollLeft et shouldSyncPianoScrollViewport", () => {
    assert.equal(quantizePianoScrollLeft(239, 240), 0);
    assert.equal(quantizePianoScrollLeft(240, 240), 240);
    assert.equal(
      shouldSyncPianoScrollViewport({ left: 0, width: 900 }, 100, 900),
      false,
    );
    assert.equal(
      shouldSyncPianoScrollViewport({ left: 0, width: 900 }, 240, 900),
      true,
    );
    assert.equal(
      shouldSyncPianoScrollViewport({ left: 0, width: 900 }, 0, 800),
      true,
    );
    assert.equal(
      shouldSyncPianoScrollViewport({ left: 0, width: 900 }, 1000, 900, {
        overscanPx: 960,
      }),
      true,
    );
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
