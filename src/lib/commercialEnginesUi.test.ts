import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { COMMERCIAL_GRAY_REASONS_FR } from "@song-maker/stem-providers";
import { CommercialEnginesPanel } from "../components/CommercialEnginesPanel.tsx";
import { buildCommercialEngineRowsUi } from "./commercialEnginesUi.ts";

describe("commercial engines UI (#210 B3)", () => {
  it("uses fixed gray reasons from catalog, not JSON raison_grise_fr", () => {
    const rows = buildCommercialEngineRowsUi().filter((r) => r.availability === "grayed");
    assert.ok(rows.length >= 9);
    for (const row of rows) {
      assert.equal(
        row.reasonLabel,
        COMMERCIAL_GRAY_REASONS_FR[row.grayReason],
        row.id,
      );
      assert.ok(
        !row.reasonLabel.includes("Contradiction non résolue"),
        row.id,
      );
    }
  });

  it("renders fixed reasons and SheetSage2 audio.cpp attribution in panel HTML", () => {
    const html = renderToStaticMarkup(React.createElement(CommercialEnginesPanel));
    const sheetsage = buildCommercialEngineRowsUi().find((r) => r.id === "sheetsage2");
    assert.ok(sheetsage);
    assert.equal(sheetsage!.reasonLabel, "Usage non commercial uniquement.");
    assert.match(sheetsage!.whyLabel, /audio\.cpp/i);
    assert.match(sheetsage!.whyLabel, /model_licenses/i);
    assert.match(sheetsage!.whyLabel, /sheetsage2/i);
    assert.match(sheetsage!.whyLabel, /21\/09\/2026/);
    assert.ok(html.includes(sheetsage!.reasonLabel));
    assert.ok(html.includes(sheetsage!.whyLabel));
    assert.ok(
      html.includes("Licence des poids non vérifiée"),
      "HTDemucs fixed reason",
    );
    assert.ok(
      !html.includes("Contradiction non résolue"),
      "JSON reason must not appear",
    );
  });

  it("shows the reserved ACE-Step caveat and links both pinned model sources", () => {
    const rows = buildCommercialEngineRowsUi();
    const ace = rows.find((row) => row.id === "ace_step_1_5");
    assert.ok(ace);
    assert.equal(ace!.availability, "reserved");
    assert.match(ace!.reservationNote ?? "", /conversion distribuée par audio\.cpp/i);
    assert.equal(ace!.sourceLinks.length, 7);
    const html = renderToStaticMarkup(React.createElement(CommercialEnginesPanel));
    assert.ok(html.includes("Carte ACE-Step"));
    assert.ok(html.includes("Conversion GGUF audio.cpp"));
  });
});
