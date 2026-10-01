import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collapsedColumnCenterX,
  iconCenterWithinTolerance,
  SIDEBAR_COLLAPSED_ICON_CENTER_TOLERANCE_PX,
} from "./sidebarIconCenter";

describe("sidebar collapsed icon center", () => {
  it("place le centre de colonne à 28 px depuis le bord gauche (56 px)", () => {
    assert.equal(collapsedColumnCenterX(0, 56), 28);
    assert.equal(collapsedColumnCenterX(12, 56), 40);
  });

  it("accepte ±1 px autour du centre", () => {
    assert.equal(iconCenterWithinTolerance(28, 28), true);
    assert.equal(iconCenterWithinTolerance(29, 28), true);
    assert.equal(iconCenterWithinTolerance(27, 28), true);
    assert.equal(
      iconCenterWithinTolerance(28 + SIDEBAR_COLLAPSED_ICON_CENTER_TOLERANCE_PX + 0.01, 28),
      false,
    );
  });
});
