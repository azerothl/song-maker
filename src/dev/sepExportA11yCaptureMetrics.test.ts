import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const metricsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/design/separation-export-a11y/captures-react/metrics.json",
);

type Scene = {
  footerVisible?: boolean;
  runButtonVisible?: boolean;
  downloadAriaDisabled?: boolean;
  downloadReasonVisible?: boolean;
  exclusionsVisible?: boolean;
  formatLivePresent?: boolean;
  formatLabeled?: boolean;
  mockupNoteAbsent?: boolean;
  minControlHeightPx?: number;
};

describe("captures-react séparation / export (#187)", () => {
  it("prouve pied visible, cibles ≥ 44 px et attributs a11y", () => {
    const metrics = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<
      string,
      Scene
    >;
    const sep = metrics.separation;
    const mix = metrics["export-mix"];
    const stems = metrics["export-stems"];
    assert.ok(sep && mix && stems, "trois scènes requises");
    for (const [name, m] of Object.entries({ sep, mix, stems })) {
      assert.equal(m.footerVisible, true, `${name} footer`);
      assert.ok(
        (m.minControlHeightPx ?? 0) >= 44,
        `${name} cible ${m.minControlHeightPx}`,
      );
      assert.equal(m.mockupNoteAbsent, true, `${name} Alphonse`);
    }
    assert.equal(sep.runButtonVisible, true);
    assert.equal(sep.downloadAriaDisabled, true);
    assert.equal(sep.downloadReasonVisible, true);
    assert.equal(sep.exclusionsVisible, true);
    assert.equal(mix.formatLivePresent, true);
    assert.equal(mix.formatLabeled, true);
  });
});
