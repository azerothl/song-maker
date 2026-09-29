import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRODUCTION_BG0,
  STEM_CONTRAST_ROLES,
  TRACK_ROLE_COLORS,
  WAVE_PLAYED_VS_UNPLAYED_MIN,
  WAVE_UNPLAYED_ALPHA,
  WCAG_UI_CONTRAST_MIN,
  blendOverBackground,
  contrastRatio,
  measureStemContrasts,
  playedStemColorHsl,
  resolveWaveFillColors,
  roleWaveColor,
  withAlpha,
} from "./trackRoleColors";

describe("trackRoleColors (#159)", () => {
  it("mappe les 6 rôles stem vers une seule source hex", () => {
    for (const role of STEM_CONTRAST_ROLES) {
      assert.match(roleWaveColor(role), /^#[0-9a-f]{6}$/i);
      assert.equal(roleWaveColor(role), TRACK_ROLE_COLORS[role]);
    }
    assert.equal(roleWaveColor("guitar"), TRACK_ROLE_COLORS.guitar);
    assert.equal(roleWaveColor("piano"), TRACK_ROLE_COLORS.piano);
    assert.equal(roleWaveColor("percussion"), TRACK_ROLE_COLORS.percussion);
  });

  it("applique 65 % d’opacité pour la partie à venir", () => {
    assert.equal(WAVE_UNPLAYED_ALPHA, 0.65);
    const base = TRACK_ROLE_COLORS.vocals!;
    assert.equal(resolveWaveFillColors(base).unplayed, withAlpha(base, WAVE_UNPLAYED_ALPHA));
  });

  it("éclaircit la partie lue en HSL (teinte conservée, L plafonnée)", () => {
    const base = "#ffd76a";
    const played = playedStemColorHsl(base);
    assert.match(played, /^#[0-9a-f]{6}$/i);
    assert.notEqual(played.toLowerCase(), base);
    const fills = resolveWaveFillColors(base);
    assert.equal(fills.played, played);
    assert.equal(fills.unplayed, withAlpha(base, WAVE_UNPLAYED_ALPHA));
  });

  it("valide les 6 stems : partie à venir ≥ 3:1 et écart lue/à venir ≥ 1,3:1", () => {
    const rows = measureStemContrasts(PRODUCTION_BG0, WAVE_UNPLAYED_ALPHA);
    assert.equal(rows.length, 6);
    for (const row of rows) {
      assert.ok(row.upcomingPass, `${row.role} upcoming ${row.upcomingContrast.toFixed(2)}`);
      assert.ok(
        row.playedVsUpcomingPass,
        `${row.role} played vs upcoming ${row.playedVsUpcomingContrast.toFixed(2)}`,
      );
      assert.ok(row.upcomingContrast >= WCAG_UI_CONTRAST_MIN);
      assert.ok(row.playedVsUpcomingContrast >= WAVE_PLAYED_VS_UNPLAYED_MIN);
    }
  });

  it("échoue sous 3:1 à l’ancienne opacité 45 % pour guitare", () => {
    const composite = blendOverBackground(TRACK_ROLE_COLORS.guitar!, PRODUCTION_BG0, 0.45);
    assert.ok(contrastRatio(composite, PRODUCTION_BG0) < WCAG_UI_CONTRAST_MIN);
  });
});
