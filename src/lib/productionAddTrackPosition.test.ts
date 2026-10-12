import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getProductionAddTrackPosition } from "./productionAddTrackPosition.ts";

describe("Studio add-track panel placement", () => {
  it("keeps a wide panel on screen when its trigger is near the right edge", () => {
    const position = getProductionAddTrackPosition(
      { left: 1110, top: 80, bottom: 112 } as DOMRect,
      760,
      360,
      1200,
      800,
    );

    assert.deepEqual(position, { left: 424, top: 120 });
  });

  it("opens above the trigger when the panel will not fit below", () => {
    const position = getProductionAddTrackPosition(
      { left: 320, top: 590, bottom: 622 } as DOMRect,
      760,
      400,
      1200,
      800,
    );

    assert.deepEqual(position, { left: 320, top: 182 });
  });

  it("bottom-aligns a tall panel when there is not enough room above or below", () => {
    const position = getProductionAddTrackPosition(
      { left: 4, top: 240, bottom: 272 } as DOMRect,
      760,
      700,
      360,
      480,
    );

    assert.deepEqual(position, { left: 16, top: 16 });
  });
});
