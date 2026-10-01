import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMixProductionToolkit } from "@song-maker/mix-production";
import { bakeMixPcm } from "./mixBridge";
import {
  getProductionToolkit,
  setProductionOverlay,
} from "./productionState";
import {
  bakeMixPcmCore,
  pcmBuffersEqual,
  type DecodedStem,
} from "./mixBakeCore";
import { createToolkitFromProductionOverlay } from "./productionToolkitSnapshot";
import type { MixDoc } from "./types";
import type { ProductionOverlay } from "./productionState";

function miniFixture(): {
  mix: MixDoc;
  stems: DecodedStem[];
  overlay: ProductionOverlay;
} {
  const sr = 48_000;
  const frames = sr;
  const stems: DecodedStem[] = [
    {
      trackId: "trk-a",
      left: new Float32Array(frames).map((_, i) =>
        i < 400 ? 0.5 * Math.sin((i / sr) * 440 * 2 * Math.PI) : 0,
      ),
      right: new Float32Array(frames).map((_, i) =>
        i < 400 ? 0.4 * Math.sin((i / sr) * 440 * 2 * Math.PI) : 0,
      ),
      sampleRate: sr,
    },
    {
      trackId: "trk-b",
      left: new Float32Array(frames).map((_, i) =>
        i < 300 ? 0.3 * Math.sin((i / sr) * 220 * 2 * Math.PI) : 0,
      ),
      right: new Float32Array(frames),
      sampleRate: sr,
    },
  ];
  const mix: MixDoc = {
    schema: "song-maker.mix",
    schemaVersion: 1,
    id: "mix-parity",
    separationId: "sep-p1",
    sampleRate: sr,
    masterGainDb: 0,
    peakCeilingDb: -1,
    tracks: [
      {
        id: "trk-a",
        role: "vocals",
        name: "Vox",
        gainDb: 0,
        pan: 0,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [
          {
            id: "c1",
            trackId: "trk-a",
            sourcePath: "",
            sourceSha256: "",
            startMs: 0,
            offsetMs: 0,
            durationMs: 1000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        ],
      },
      {
        id: "trk-b",
        role: "drums",
        name: "Drums",
        gainDb: -3,
        pan: 0.2,
        mute: false,
        solo: false,
        locked: false,
        aiSeparated: true,
        clips: [
          {
            id: "c2",
            trackId: "trk-b",
            sourcePath: "",
            sourceSha256: "",
            startMs: 0,
            offsetMs: 0,
            durationMs: 1000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        ],
      },
    ],
  };
  const overlay: ProductionOverlay = {
    mixId: mix.id,
    volumePointsByTrack: {},
    panPointsByTrack: {},
    automationLanes: {},
    effectsByTrack: {
      "trk-a": [
        {
          id: "eq1",
          kind: "parametricEq",
          enabled: true,
          params: {
            bandCount: 1,
            band0Type: "peak",
            band0Freq: 1000,
            band0Gain: 2,
            band0Q: 1,
            band0Enabled: true,
          },
        },
      ],
    },
    sidechainRoutes: [],
    buses: [],
    sends: [],
    trackGroupIds: {},
  };
  return { mix, stems, overlay };
}

describe("mix bake PCM parity (#234)", () => {
  it("bakeMixPcmCore matches toolkit snapshot vs direct toolkit", () => {
    const { mix, stems, overlay } = miniFixture();
    const toolkitA = createToolkitFromProductionOverlay(overlay);
    const toolkitB = createToolkitFromProductionOverlay(overlay);
    const routing = {
      buses: overlay.buses,
      sends: overlay.sends,
      trackGroupIds: overlay.trackGroupIds,
    };
    const a = bakeMixPcmCore(mix, stems, toolkitA, routing, {
      tempoBpm: 120,
      projectTempoBpm: 120,
    });
    const b = bakeMixPcmCore(mix, stems, toolkitB, routing, {
      tempoBpm: 120,
      projectTempoBpm: 120,
    });
    assert.ok(pcmBuffersEqual(a.left, b.left));
    assert.ok(pcmBuffersEqual(a.right, b.right));
  });

  it("bakeMixPcm export path matches explicit core bake", () => {
    const { mix, stems, overlay } = miniFixture();
    const toolkit = createToolkitFromProductionOverlay(overlay);
    const routing = {
      buses: overlay.buses,
      sends: overlay.sends,
      trackGroupIds: overlay.trackGroupIds,
    };
    const core = bakeMixPcmCore(mix, stems, toolkit, routing, {
      tempoBpm: 120,
      projectTempoBpm: 120,
    });
    setProductionOverlay(overlay);
    const viaBridge = bakeMixPcm(mix, stems, getProductionToolkit(), {
      tempoBpm: 120,
    });
    assert.ok(pcmBuffersEqual(core.left, viaBridge.left));
    assert.ok(pcmBuffersEqual(core.right, viaBridge.right));
    assert.ok(pcmBuffersEqual(core.pcm, viaBridge.pcm));
  });

  it("stretch clip placement is deterministic across two bakes", () => {
    const { mix, stems } = miniFixture();
    mix.tracks[0]!.clips[0]!.followProjectTempo = true;
    mix.tracks[0]!.clips[0]!.sourceTempoBpm = 100;
    const tk = createMixProductionToolkit();
    const a = bakeMixPcmCore(mix, stems, tk, {}, { tempoBpm: 120 });
    const b = bakeMixPcmCore(mix, stems, tk, {}, { tempoBpm: 120 });
    assert.ok(pcmBuffersEqual(a.pcm, b.pcm));
  });
});
