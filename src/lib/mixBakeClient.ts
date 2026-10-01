import type { MixRenderResult } from "@song-maker/mix-production";
import type { MixDoc } from "./types";
import type { DecodedStem } from "./mixBridge";
import type { ProductionOverlay } from "./productionState";
import type {
  MixBakeWorkerRequest,
  MixBakeWorkerResponse,
} from "./mixBake.worker";

const activeCancellations = new Set<() => void>();
let nextJobId = 1;

export type MixBakeAsyncJob = {
  cancel: () => void;
  result: Promise<MixRenderResult>;
};

type BakeAsyncImpl = (
  mix: MixDoc,
  stems: DecodedStem[],
  overlay: ProductionOverlay | null,
  tempoBpm: number | null,
) => MixBakeAsyncJob;

let bakeAsyncTestDelegate: BakeAsyncImpl | null = null;

/** Tests uniquement — remplace le Worker par un bake simulé. */
export function setMixBakeAsyncTestDelegate(
  delegate: BakeAsyncImpl | null,
): void {
  bakeAsyncTestDelegate = delegate;
}

/** Bake mix PCM off the main thread (Web Worker). */
export function bakeMixPcmAsync(
  mix: MixDoc,
  stems: DecodedStem[],
  overlay: ProductionOverlay | null,
  tempoBpm: number | null,
): MixBakeAsyncJob {
  if (bakeAsyncTestDelegate) {
    return bakeAsyncTestDelegate(mix, stems, overlay, tempoBpm);
  }
  return bakeMixPcmAsyncImpl(mix, stems, overlay, tempoBpm);
}

function bakeMixPcmAsyncImpl(
  mix: MixDoc,
  stems: DecodedStem[],
  overlay: ProductionOverlay | null,
  tempoBpm: number | null,
): MixBakeAsyncJob {
  const id = nextJobId++;
  // Each job owns its worker: terminating a superseded render must not cancel
  // an independent render, or leave synchronous DSP queued ahead of the next mix.
  let w: Worker;
  try {
    w = new Worker(new URL("./mixBake.worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    // Keep the async contract so playback clears its pending state on failure.
    return { cancel: () => {}, result: Promise.reject(error) };
  }
  let cancel = () => {};

  const result = new Promise<MixRenderResult>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      settled = true;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      activeCancellations.delete(cancel);
      w.terminate();
    };
    cancel = () => {
      if (settled) return;
      cleanup();
      reject(new DOMException("Mix bake annulé.", "AbortError"));
    };
    const onMessage = (ev: MessageEvent<MixBakeWorkerResponse>) => {
      if (settled || ev.data.id !== id) return;
      cleanup();
      if (!ev.data.ok) {
        reject(new Error(ev.data.error));
        return;
      }
      const pcm = new Float32Array(ev.data.frameCount * 2);
      for (let i = 0; i < ev.data.frameCount; i++) {
        pcm[i * 2] = ev.data.left[i] ?? 0;
        pcm[i * 2 + 1] = ev.data.right[i] ?? 0;
      }
      resolve({
        pcm,
        left: ev.data.left,
        right: ev.data.right,
        frameCount: ev.data.frameCount,
        peakTrimDb: ev.data.peakTrimDb,
        path: ev.data.path,
      });
    };
    const onError = (err: ErrorEvent) => {
      if (settled) return;
      cleanup();
      reject(err.error ?? new Error(err.message));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    activeCancellations.add(cancel);

    const payload: MixBakeWorkerRequest = {
      id,
      mix,
      stems,
      overlay,
      tempoBpm,
    };
    try {
      w.postMessage(payload);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });

  return {
    cancel,
    result,
  };
}

export function disposeMixBakeWorker(): void {
  for (const cancel of activeCancellations) cancel();
}
