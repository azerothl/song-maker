import { describe, expect, it } from "vitest";
import {
  applyMixPreset,
  getMixPreset,
  listMixPresets,
} from "./presets.js";

describe("mix presets by intent", () => {
  const baseMix = {
    id: "mix-1",
    tracks: [
      {
        id: "trk-vocals",
        role: "vocals",
        name: "Voix",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [{ id: "c1", trackId: "trk-vocals" }],
      },
      {
        id: "trk-drums",
        role: "drums",
        name: "Batterie",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [{ id: "c2", trackId: "trk-drums" }],
      },
      {
        id: "trk-user",
        role: "user",
        name: "Import",
        gainDb: -3,
        pan: 0.2,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: false,
        clips: [{ id: "c3", trackId: "trk-user" }],
      },
    ],
  };

  it("lists the three intent presets", () => {
    const ids = listMixPresets().map((p) => p.id);
    expect(ids).toEqual(["vocals-forward", "energetic", "soft-airy"]);
    expect(getMixPreset("energetic")?.touches).toContain("gain");
  });

  it("applies gains/pans without deleting clips or custom tracks", () => {
    const { mix, appliedTrackIds, skippedRoles, effectsByTrack } =
      applyMixPreset(baseMix, "vocals-forward");

    expect(mix.tracks).toHaveLength(3);
    expect(mix.tracks[0]!.clips).toEqual(baseMix.tracks[0]!.clips);
    expect(mix.tracks[0]!.gainDb).toBe(3);
    expect(mix.tracks[1]!.gainDb).toBe(-1);
    expect(mix.tracks[2]!.gainDb).toBe(-3);
    expect(mix.tracks[2]!.pan).toBe(0.2);
    expect(appliedTrackIds).toEqual(["trk-vocals", "trk-drums"]);
    expect(skippedRoles.sort()).toEqual(["bass", "guitar", "other", "piano"]);
    expect(effectsByTrack["trk-vocals"]?.some((e) => e.kind === "eq")).toBe(
      true,
    );
    const eq = effectsByTrack["trk-vocals"]!.find((e) => e.kind === "eq");
    expect(eq?.params.gainDb).toBe(1.5);
  });

  it("ignores unknown preset ids", () => {
    const { mix, appliedTrackIds } = applyMixPreset(baseMix, "nope");
    expect(mix).toEqual(baseMix);
    expect(appliedTrackIds).toEqual([]);
  });

  it("only uses real effect kinds (no fake parametric EQ)", () => {
    for (const preset of listMixPresets()) {
      for (const settings of Object.values(preset.byRole)) {
        for (const fx of settings?.effects ?? []) {
          expect(["eq", "compressor", "limiter", "reverb"]).toContain(fx.kind);
          if (fx.kind === "eq") {
            expect(Object.keys(fx.params)).toEqual(["gainDb"]);
          }
        }
      }
    }
  });
});
