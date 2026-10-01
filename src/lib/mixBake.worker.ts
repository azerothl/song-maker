import type { MixDoc } from "./types";
import { bakeMixPcmCore, type DecodedStem, type MixBakeRouting } from "./mixBakeCore";
import { createToolkitFromProductionOverlay } from "./productionToolkitSnapshot";
import type { ProductionOverlay } from "./productionState";

export type MixBakeWorkerRequest = {
  id: number;
  mix: MixDoc;
  stems: DecodedStem[];
  overlay: ProductionOverlay | null;
  tempoBpm: number | null;
};

export type MixBakeWorkerResponse =
  | {
      id: number;
      ok: true;
      left: Float32Array;
      right: Float32Array;
      frameCount: number;
      peakTrimDb: number;
      path: "phase1" | "production";
    }
  | { id: number; ok: false; error: string };

self.onmessage = (ev: MessageEvent<MixBakeWorkerRequest>) => {
  const { id, mix, stems, overlay, tempoBpm } = ev.data;
  try {
    const toolkit = createToolkitFromProductionOverlay(overlay);
    const routing: MixBakeRouting = {
      buses: overlay?.buses,
      sends: overlay?.sends,
      trackGroupIds: overlay?.trackGroupIds,
    };
    const result = bakeMixPcmCore(mix, stems, toolkit, routing, {
      tempoBpm,
      projectTempoBpm: tempoBpm,
    });
    const response: MixBakeWorkerResponse = {
      id,
      ok: true,
      left: result.left,
      right: result.right,
      frameCount: result.frameCount,
      peakTrimDb: result.peakTrimDb,
      path: result.path,
    };
    self.postMessage(response, {
      transfer: [result.left.buffer, result.right.buffer],
    });
  } catch (e) {
    const response: MixBakeWorkerResponse = {
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(response);
  }
};
