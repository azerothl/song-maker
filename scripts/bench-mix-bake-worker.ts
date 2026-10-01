import { parentPort } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { createMixProductionToolkit } from "@song-maker/mix-production";
import { bakeMixPcmCore } from "../src/lib/mixBakeCore.ts";
import { createToolkitFromProductionOverlay } from "../src/lib/productionToolkitSnapshot.ts";

parentPort?.on("message", (msg) => {
  try {
    const { mix, stems, overlay, tempoBpm } = msg;
    const t0 = performance.now();
    const toolkit = overlay
      ? createToolkitFromProductionOverlay(overlay)
      : createMixProductionToolkit();
    const routing = {
      buses: overlay?.buses,
      sends: overlay?.sends,
      trackGroupIds: overlay?.trackGroupIds,
    };
    bakeMixPcmCore(mix, stems, toolkit, routing, {
      tempoBpm,
      projectTempoBpm: tempoBpm,
    });
    const workerMs = performance.now() - t0;
    parentPort?.postMessage({ ok: true, workerMs });
  } catch (e) {
    parentPort?.postMessage({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
