#!/usr/bin/env node
/**
 * Bench issue #234 — bakeMixPcm / renderMixOffline (12 stems, durée configurable).
 *
 * Usage:
 *   pnpm bench:mix-bake
 *   DURATION_SEC=90 STEM_COUNT=12 pnpm bench:mix-bake
 *
 * Écrit docs/bench/mix-bake-234.json (mesures reproductibles).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { Worker as NodeWorker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMixProductionToolkit,
  type MixProductionToolkit,
} from "@song-maker/mix-production";
import {
  bakeMixPcmCore,
  type DecodedStem,
  type MixBakeRouting,
} from "../src/lib/mixBakeCore.ts";
import { createToolkitFromProductionOverlay } from "../src/lib/productionToolkitSnapshot.ts";
import type { MixClip, MixDoc, MixTrack } from "../src/lib/types.ts";
import type { ProductionOverlay } from "../src/lib/productionState.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outPath = path.join(root, "docs/bench/mix-bake-234.json");

const SAMPLE_RATE = 48_000;
const DURATION_SEC = Number(process.env.DURATION_SEC ?? "90");
const STEM_COUNT = Number(process.env.STEM_COUNT ?? "12");
const WARMUP = 1;
const RUNS = 3;

const STEM_ROLES = [
  "vocals",
  "drums",
  "bass",
  "guitar",
  "piano",
  "synth",
  "strings",
  "brass",
  "perc",
  "fx",
  "backing_vocals",
  "other",
];

function synthStem(trackId: string, frames: number, seed: number): DecodedStem {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.exp(-t * 0.02);
    const s =
      env *
      (0.35 * Math.sin(2 * Math.PI * (220 + seed * 17) * t) +
        0.2 * Math.sin(2 * Math.PI * (440 + seed * 11) * t));
    left[i] = s;
    right[i] = s * 0.92;
  }
  return { trackId, left, right, sampleRate: SAMPLE_RATE };
}

function buildMixDoc(stems: DecodedStem[], stretchOnVocals = false): MixDoc {
  const durationMs = Math.round((stems[0]!.left.length / SAMPLE_RATE) * 1000);
  const tracks: MixTrack[] = stems.map((s, i) => ({
    id: s.trackId,
    role: STEM_ROLES[i % STEM_ROLES.length]!,
    name: `Stem ${i + 1}`,
    gainDb: -2 + (i % 4),
    pan: ((i % 5) - 2) * 0.15,
    mute: false,
    solo: false,
    locked: false,
    aiSeparated: true,
    clips: [
      {
        id: `clip-${s.trackId}`,
        trackId: s.trackId,
        sourcePath: "",
        sourceSha256: "",
        startMs: 0,
        offsetMs: 0,
        durationMs,
        gainDb: 0,
        fadeInMs: 10,
        fadeOutMs: 20,
        ...(stretchOnVocals && i === 0
          ? {
              followProjectTempo: true,
              sourceTempoBpm: 100,
              processingEnabled: true,
            }
          : {}),
      } satisfies MixClip,
    ],
  }));
  return {
    schema: "song-maker.mix",
    schemaVersion: 1,
    id: "mix-bench-234",
    separationId: "sep-bench",
    sampleRate: SAMPLE_RATE,
    masterGainDb: -1,
    peakCeilingDb: -1,
    tracks,
    tempoMap: [{ startMs: 0, quarterBpm: 120 }],
  };
}

function overlayWithEq(mixId: string): ProductionOverlay {
  const effectsByTrack: ProductionOverlay["effectsByTrack"] = {};
  effectsByTrack["trk-0"] = [
    {
      id: "fx-peq",
      kind: "parametricEq",
      enabled: true,
      params: {
        bandCount: 2,
        band0Type: "peak",
        band0Freq: 2500,
        band0Gain: 4,
        band0Q: 1.2,
        band0Enabled: true,
        band1Type: "highshelf",
        band1Freq: 8000,
        band1Gain: -2,
        band1Q: 0.7,
        band1Enabled: true,
      },
    },
    {
      id: "fx-comp",
      kind: "compressor",
      enabled: true,
      params: {
        thresholdDb: -18,
        ratio: 3,
        makeupDb: 1,
        attackMs: 8,
        releaseMs: 80,
        kneeDb: 6,
      },
    },
  ];
  return {
    mixId,
    volumePointsByTrack: {},
    panPointsByTrack: {},
    automationLanes: {},
    effectsByTrack,
    sidechainRoutes: [],
    buses: [],
    sends: [],
    trackGroupIds: {},
  };
}

function routingFromOverlay(overlay: ProductionOverlay | null): MixBakeRouting {
  return {
    buses: overlay?.buses,
    sends: overlay?.sends,
    trackGroupIds: overlay?.trackGroupIds,
  };
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function runSyncBake(
  mix: MixDoc,
  stems: DecodedStem[],
  toolkit: MixProductionToolkit,
  routing: MixBakeRouting,
  tempoBpm: number,
): number {
  const t0 = performance.now();
  bakeMixPcmCore(mix, stems, toolkit, routing, {
    tempoBpm,
    projectTempoBpm: tempoBpm,
  });
  return performance.now() - t0;
}

async function runWorkerThreadBake(
  mix: MixDoc,
  stems: DecodedStem[],
  overlay: ProductionOverlay | null,
  tempoBpm: number,
): Promise<{ handoffMs: number; workerCpuMs: number }> {
  const workerPath = path.join(
    root,
    "scripts/bench-mix-bake-worker-bootstrap.mjs",
  );
  return new Promise((resolve, reject) => {
    const w = new NodeWorker(workerPath);
    w.once(
      "message",
      (msg: { ok: boolean; workerMs?: number; error?: string }) => {
        w.terminate().catch(() => {});
        if (!msg.ok) reject(new Error(msg.error ?? "worker bake failed"));
        else
          resolve({
            handoffMs,
            workerCpuMs: msg.workerMs ?? 0,
          });
      },
    );
    w.once("error", reject);
    const t0 = performance.now();
    w.postMessage({ mix, stems, overlay, tempoBpm });
    const handoffMs = performance.now() - t0;
  });
}

async function main() {
  const frames = Math.round(DURATION_SEC * SAMPLE_RATE);
  const stems: DecodedStem[] = [];
  for (let i = 0; i < STEM_COUNT; i++) {
    stems.push(synthStem(`trk-${i}`, frames, i + 1));
  }

  const mixEq = buildMixDoc(stems, false);
  const mixStretch = buildMixDoc(stems, true);
  const overlay = overlayWithEq(mixEq.id);
  const toolkit = createToolkitFromProductionOverlay(overlay);
  const routing = routingFromOverlay(overlay);
  const tempo = 120;

  for (let i = 0; i < WARMUP; i++) {
    runSyncBake(mixEq, stems, toolkit, routing, tempo);
  }

  const eqSync: number[] = [];
  const stretchSync: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    eqSync.push(runSyncBake(mixEq, stems, toolkit, routing, tempo));
    const tkStretch = createMixProductionToolkit();
    stretchSync.push(
      runSyncBake(mixStretch, stems, tkStretch, {}, tempo),
    );
  }

  const eqHandoff: number[] = [];
  const eqWorkerCpu: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const { handoffMs, workerCpuMs } = await runWorkerThreadBake(
      mixEq,
      stems,
      overlay,
      tempo,
    );
    eqHandoff.push(handoffMs);
    eqWorkerCpu.push(workerCpuMs);
  }

  const report = {
    issue: 234,
    generatedAt: new Date().toISOString(),
    command: "pnpm bench:mix-bake",
    env: { DURATION_SEC, STEM_COUNT, SAMPLE_RATE, RUNS },
    measured: {
      /** Comportement historique : bake synchrone sur le thread appelant (playback avant #234). */
      syncMainThreadMs_median_eqChange: median(eqSync),
      syncMainThreadMs_median_stretchChange: median(stretchSync),
      /** Délégation worker (playback après #234) : coût postMessage sur le thread appelant. */
      workerHandoffMs_median_eqChange: median(eqHandoff),
      workerCpuMs_median_eqChange: median(eqWorkerCpu),
    },
    calculated: {
      syncVsWorkerHandoffRatio_eq:
        median(eqSync) / Math.max(0.001, median(eqHandoff)),
    },
    notTested: [
      "Glitch audible pendant lecture (nécessite session Tauri manuelle).",
      "Quota Vercel / déploiement preview.",
    ],
    runs: { eqSync, stretchSync, eqHandoff, eqWorkerCpu },
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

await main();
