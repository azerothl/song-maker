import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeProduction,
  applySelectedProposals,
  fingerprintProductionState,
  previewMixFromProposals,
} from "./productionAssistant.ts";
import type { MixDoc } from "./types.ts";
import type { ProductionOverlay } from "./productionState.ts";
import type { StemLevelMeasurement } from "@song-maker/mix-production";

function makeMix(overrides?: Partial<MixDoc>): MixDoc {
  return {
    schema: "song-maker.mix",
    schemaVersion: 1,
    id: "mix-1",
    separationId: "sep-1",
    sampleRate: 48000,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: [
      {
        id: "t-vocals",
        role: "vocals",
        name: "Vocals",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [],
      },
      {
        id: "t-drums",
        role: "drums",
        name: "Drums",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [],
      },
    ],
    ...overrides,
  };
}

function emptyOverlay(mixId: string): ProductionOverlay {
  return {
    mixId,
    volumePointsByTrack: {},
    panPointsByTrack: {},
    effectsByTrack: {},
    sidechainRoutes: [],
  };
}

function meas(
  trackId: string,
  role: string,
  rmsDb: number,
  peakDb: number,
): StemLevelMeasurement {
  return {
    trackId,
    role,
    rmsDb,
    peakDb,
    silent: peakDb < -60,
    frameCount: 1000,
  };
}

describe("productionAssistant", () => {
  it("fingerprints mix+overlay and changes when gain changes", () => {
    const mix = makeMix();
    const a = fingerprintProductionState(mix, emptyOverlay(mix.id));
    const b = fingerprintProductionState(
      { ...mix, tracks: mix.tracks.map((t) => ({ ...t, gainDb: 3 })) },
      emptyOverlay(mix.id),
    );
    assert.notEqual(a, b);
    assert.match(a, /^v1:[0-9a-f]{8}$/);
  });

  it("proposes rebalance and vocals preset without mutating", () => {
    const mix = makeMix();
    const overlay = emptyOverlay(mix.id);
    const before = JSON.stringify(mix);
    const analysis = analyzeProduction({
      mix,
      overlay,
      measurements: [
        meas("t-vocals", "vocals", -28, -12),
        meas("t-drums", "drums", -14, -3),
      ],
    });
    assert.equal(JSON.stringify(mix), before);
    assert.equal(analysis.remoteAnalysis, false);
    assert.ok(analysis.proposals.some((p) => p.kind === "rebalance_stems"));
    assert.ok(analysis.proposals.some((p) => p.kind === "apply_preset"));
    assert.ok(analysis.proposals.some((p) => p.kind === "save_mix_version"));
  });

  it("rejects apply when fingerprint is stale", () => {
    const mix = makeMix();
    const analysis = analyzeProduction({
      mix,
      overlay: emptyOverlay(mix.id),
      measurements: [
        meas("t-vocals", "vocals", -28, -12),
        meas("t-drums", "drums", -14, -3),
      ],
    });
    const result = applySelectedProposals({
      mix,
      overlay: emptyOverlay(mix.id),
      analysis,
      selectedIds: ["rebalance_stems"],
      currentFingerprint: "v1:deadbeef",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reasonFr, /changé depuis l’analyse/);
    }
  });

  it("applies selective rebalance when fingerprint matches", () => {
    const mix = makeMix();
    const overlay = emptyOverlay(mix.id);
    const analysis = analyzeProduction({
      mix,
      overlay,
      measurements: [
        meas("t-vocals", "vocals", -28, -12),
        meas("t-drums", "drums", -14, -3),
      ],
    });
    const result = applySelectedProposals({
      mix,
      overlay,
      analysis,
      selectedIds: ["rebalance_stems"],
      currentFingerprint: analysis.fingerprint,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.appliedIds.includes("rebalance_stems"));
      const vocals = result.mix.tracks.find((t) => t.id === "t-vocals");
      assert.ok(vocals);
      assert.notEqual(vocals.gainDb, 0);
    }
  });

  it("builds a preview mix for rebalance A/B", () => {
    const mix = makeMix();
    const analysis = analyzeProduction({
      mix,
      overlay: emptyOverlay(mix.id),
      measurements: [
        meas("t-vocals", "vocals", -28, -12),
        meas("t-drums", "drums", -14, -3),
      ],
    });
    const preview = previewMixFromProposals(mix, analysis, ["rebalance_stems"]);
    assert.ok(preview);
    assert.notEqual(
      preview!.tracks.find((t) => t.id === "t-vocals")?.gainDb,
      mix.tracks[0]?.gainDb,
    );
    // Original untouched
    assert.equal(mix.tracks[0]?.gainDb, 0);
  });

  it("includes score hint without auto-apply", () => {
    const mix = makeMix();
    const analysis = analyzeProduction({
      mix,
      overlay: emptyOverlay(mix.id),
      scoreIssues: [
        {
          code: "unaligned_duration",
          severity: "error",
          message: "durée non alignée",
        },
      ],
    });
    const hint = analysis.proposals.find((p) => p.kind === "score_fix_hint");
    assert.ok(hint);
    assert.equal(hint!.autoApplicable, false);
  });
});
