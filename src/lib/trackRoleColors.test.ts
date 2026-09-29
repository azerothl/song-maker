import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCTION_BG0,
  TRACK_ROLE_COLORS,
  WAVE_UNPLAYED_ALPHA,
  WCAG_UI_CONTRAST_MIN,
  blendOverBackground,
  contrastRatio,
  lightenColor,
  measureStemContrasts,
  resolveWaveFillColors,
  roleWaveColor,
  withAlpha,
} from "./trackRoleColors";

describe("trackRoleColors", () => {
  it("mappe les 6 rôles stem vers une seule source hex", () => {
    assert.equal(roleWaveColor("vocals"), "#ff8fb1");
    assert.equal(roleWaveColor("drums"), "#5ed8c9");
    assert.equal(roleWaveColor("bass"), "#7fe0a1");
    assert.equal(roleWaveColor("guitar"), "#b79cff");
    assert.equal(roleWaveColor("piano"), "#ffd76a");
    assert.equal(roleWaveColor("other"), "#9ee06a");
  });

  it("applique ~65 % d’opacité pour la partie à venir", () => {
    assert.equal(WAVE_UNPLAYED_ALPHA, 0.65);
    assert.equal(withAlpha("#ff8fb1", WAVE_UNPLAYED_ALPHA), "rgba(255,143,177,0.65)");
  });

  it("éclaircit modérément la partie lue sans alpha", () => {
    const played = lightenColor("#ff8fb1", 0.18);
    assert.match(played, /^#[0-9a-f]{6}$/i);
    assert.notEqual(played.toLowerCase(), "#ff8fb1");
    const fills = resolveWaveFillColors("#ff8fb1");
    assert.equal(fills.unplayed, "rgba(255,143,177,0.65)");
    assert.equal(fills.played, played);
  });

  it("garantit ≥ 3:1 pour chaque stem (partie à venir sur #0C0E18)", () => {
    const rows = measureStemContrasts(PRODUCTION_BG0, WAVE_UNPLAYED_ALPHA);
    assert.equal(rows.length, 6);
    for (const row of rows) {
      assert.equal(row.solidHex, TRACK_ROLE_COLORS[row.role]);
      assert.ok(
        row.upcomingPass,
        `${row.role} upcoming ${row.upcomingContrast.toFixed(2)} < ${WCAG_UI_CONTRAST_MIN}`,
      );
      assert.ok(
        row.playedPass,
        `${row.role} played ${row.playedContrast.toFixed(2)} < ${WCAG_UI_CONTRAST_MIN}`,
      );
      assert.ok(row.upcomingContrast >= WCAG_UI_CONTRAST_MIN);
    }
  });

  it("échoue sous 3:1 à l’ancienne opacité 45 % pour guitare", () => {
    const composite = blendOverBackground("#b79cff", PRODUCTION_BG0, 0.45);
    assert.ok(contrastRatio(composite, PRODUCTION_BG0) < WCAG_UI_CONTRAST_MIN);
  });
});
