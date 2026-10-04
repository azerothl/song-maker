import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { productionMixSettingsFieldAccessibleNames } from "../components/ProductionMixSettingsPopin";
import { DEFAULT_PRODUCTION_CLIP_VIEW_PREFS } from "./productionClipViewPrefs";
import { t } from "../ui/i18n";

describe("production mix settings structure (#225)", () => {
  it("ProductionWorkspace exposes mix settings trigger with dialog popup", () => {
    const src = readFileSync("src/screens/song/ProductionWorkspace.tsx", "utf8");
    assert.match(src, /production-mix-settings-trigger/);
    assert.match(src, /aria-haspopup="dialog"/);
    assert.match(src, /production\.mixSettings/);
  });

  it("AnchoredPopin supports deferEscapeClose (#225 B2)", () => {
    const src = readFileSync("src/components/AnchoredPopin.tsx", "utf8");
    assert.match(src, /deferEscapeClose/);
  });

  it("Clips trigger opens popover above timeline (preferAboveAnchor)", () => {
    const src = readFileSync("src/screens/song/ProductionWorkspace.tsx", "utf8");
    assert.match(src, /preferAboveAnchor=\{false\}/);
    assert.doesNotMatch(src, /production-mix-settings-trigger-clips/);
    assert.match(src, /production-mix-settings-trigger/);
  });

  it("single mix settings access in main toolbar (#299)", () => {
    const src = readFileSync("src/screens/song/ProductionWorkspace.tsx", "utf8");
    assert.match(src, /production-main-toolbar/);
    assert.match(src, /hideChrome/);
    assert.equal(
      (src.match(/data-testid="production-mix-settings-trigger"/g) ?? []).length,
      1,
    );
  });

  it("tools menu exposes aria-expanded when Assistant and Copilot both shown", () => {
    const src = readFileSync("src/components/ProductionMixSettingsPopin.tsx", "utf8");
    assert.match(src, /aria-expanded=\{dualMixTools \? mixToolsMenuOpen : undefined\}/);
  });

  it("banner master layout uses fader, meter and density", () => {
    const src = readFileSync("src/screens/song/ProductionWorkspace.tsx", "utf8");
    assert.match(src, /mix-master-level/);
    assert.match(src, /mix-master-meter/);
    assert.match(src, /mix-master-density/);
    assert.doesNotMatch(src, /mix-master-knob-host/);
    assert.doesNotMatch(src, /variant="quick"/);
    assert.match(src, /onChange=\{\(gainDb\) =>/);
  });

  it("popover field accessible names match acceptance list (mutation: drop a fieldset)", () => {
    const names = productionMixSettingsFieldAccessibleNames(
      { ...DEFAULT_PRODUCTION_CLIP_VIEW_PREFS, gridMode: "musical" },
      {
        densityPreference: "compact",
        showMixAssist: true,
        showProductionCopilot: false,
        hasAiStems: true,
        separateDisabled: false,
      },
    );
    assert.deepEqual(names, [
      t("production.mixSettings.close"),
      t("production.settings.snap"),
      t("clips.gridMusical"),
      t("clips.gridTime"),
      t("clips.sub.quarter"),
      t("clips.sub.eighth"),
      t("clips.sub.sixteenth"),
      t("clips.sub.thirtysecond"),
      t("clips.zoom"),
      t("mix.density.auto"),
      t("mix.density.compact"),
      t("mix.density.confortable"),
      t("production.settings.master"),
      t("phase3.mix.runLimiterMeter"),
      t("separate.again"),
      t("mix.assist.drawer"),
    ]);
  });
});
