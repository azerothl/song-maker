import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allTipsMissPointer,
  SIDEBAR_TIP_HIDE_DELAY_MS,
  tipPointerProbeFromHit,
} from "./sidebarTipPointer";

describe("sidebarTipPointer", () => {
  it("expose le délai de disparition à 150 ms (WCAG 1.4.13)", () => {
    assert.equal(SIDEBAR_TIP_HIDE_DELAY_MS, 150);
  });

  it("détecte quand elementFromPoint touche une infobulle", () => {
    const tip = { classList: { contains: (c: string) => c === "sidebar-tip" }, tagName: "SPAN", className: "sidebar-tip" };
    const main = { classList: { contains: () => false }, tagName: "MAIN", className: "main" };
    const onTip = tipPointerProbeFromHit("Nouveau", 90, 200, tip as unknown as Element);
    const onMain = tipPointerProbeFromHit("Nouveau", 200, 200, main as unknown as Element);
    assert.equal(onTip.hitsSidebarTip, true);
    assert.equal(onMain.hitsSidebarTip, false);
    assert.equal(allTipsMissPointer([onMain]), true);
    assert.equal(allTipsMissPointer([onTip, onMain]), false);
  });
});
