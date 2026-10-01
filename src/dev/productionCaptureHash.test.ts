import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCaptureHash } from "./productionCaptureHash";

describe("parseCaptureHash", () => {
  it("résout pistes, densité et groupe replié", () => {
    assert.deepEqual(parseCaptureHash("6,auto,expanded"), {
      trackCount: 6,
      densityPreference: "auto",
      rythmiqueCollapsed: false,
      midPlayback: false,
      progressRatio: 0,
      productionView: "mix",
      recordOpen: false,
      actionsDrawerOpen: false,
      trackToolsOpen: false,
      mixToolbar44Variant: false,
      mixBakeIndicator: false,
      mixBakeIndicatorCycle: false,
    });
    assert.deepEqual(parseCaptureHash("16,compact,collapsed"), {
      trackCount: 16,
      densityPreference: "compact",
      rythmiqueCollapsed: true,
      midPlayback: false,
      progressRatio: 0,
      productionView: "mix",
      recordOpen: false,
      actionsDrawerOpen: false,
      trackToolsOpen: false,
      mixToolbar44Variant: false,
      mixBakeIndicator: false,
      mixBakeIndicatorCycle: false,
    });
    assert.deepEqual(parseCaptureHash("confortable"), {
      trackCount: 12,
      densityPreference: "confortable",
      rythmiqueCollapsed: false,
      midPlayback: false,
      progressRatio: 0,
      productionView: "mix",
      recordOpen: false,
      actionsDrawerOpen: false,
      trackToolsOpen: false,
      mixToolbar44Variant: false,
      mixBakeIndicator: false,
      mixBakeIndicatorCycle: false,
    });
    assert.equal(parseCaptureHash("16,auto,midplay").midPlayback, true);
    assert.equal(parseCaptureHash("16,auto,midplay").progressRatio, 0.5);
  });

  it("résout midplay et progress explicite", () => {
    assert.equal(parseCaptureHash("6,confortable,midplay").progressRatio, 0.5);
    assert.equal(parseCaptureHash("6,auto,progress=0.45").progressRatio, 0.45);
  });

  it("résout la vue production et le panneau enregistrement", () => {
    assert.equal(parseCaptureHash("12,confortable,view-clips").productionView, "clips");
    assert.equal(parseCaptureHash("12,confortable,view-tools").productionView, "tools");
    assert.equal(parseCaptureHash("12,confortable,record-open").recordOpen, true);
  });

  it("résout le tiroir actions et la variante doc barre mix 44 px", () => {
    assert.equal(
      parseCaptureHash("6,auto,actions-open").actionsDrawerOpen,
      true,
    );
    assert.equal(parseCaptureHash("6,auto,i6-drawer").actionsDrawerOpen, true);
    assert.equal(
      parseCaptureHash("6,auto,actions-open,mix-toolbar-44").mixToolbar44Variant,
      true,
    );
    assert.equal(parseCaptureHash("12,auto,tools-open").trackToolsOpen, true);
  });

  it("résout l’indicateur rebake mix pour captures (#234)", () => {
    assert.equal(parseCaptureHash("mixbake-indicator").mixBakeIndicator, true);
    assert.equal(parseCaptureHash("mixbake-cycle").mixBakeIndicatorCycle, true);
  });
});
