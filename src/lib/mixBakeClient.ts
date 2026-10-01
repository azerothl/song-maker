import type { MixRenderResult } from "@song-maker/mix-production";
import type { MixDoc } from "./types";
import type { DecodedStem } from "./mixBridge";
import type { ProductionOverlay } from "./productionState";
import type {
  MixBakeWorkerRequest,
  MixBakeWorkerResponse,
} from "./mixBake.worker";

let worker: Worker | null = null;
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

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./mixBake.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
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
  let cancelled = false;
  const w = ensureWorker();

  const result = new Promise<MixRenderResult>((resolve, reject) => {
    const onMessage = (ev: MessageEvent<MixBakeWorkerResponse>) => {
      if (ev.data.id !== id) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (cancelled) {
        reject(new Error("Mix bake annulé."));
        return;
      }
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
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      reject(err.error ?? new Error(err.message));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);

    const payload: MixBakeWorkerRequest = {
      id,
      mix,
      stems,
      overlay,
      tempoBpm,
    };
    w.postMessage(payload);
  });

  return {
    cancel: () => {
      cancelled = true;
    },
    result,
  };
}

export function disposeMixBakeWorker(): void {
  worker?.terminate();
  worker = null;
}
