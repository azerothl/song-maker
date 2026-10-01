import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { bakeMixPcmAsync, disposeMixBakeWorker } from "./mixBakeClient";
import type { MixDoc } from "./types";

const mix: MixDoc = {
  schema: "song-maker.mix", schemaVersion: 1, id: "cancel-test",
  separationId: "sep", sampleRate: 48000, masterGainDb: 0,
  peakCeilingDb: -1, tracks: [],
};

class ControlledWorker extends EventTarget {
  static instances: ControlledWorker[] = [];
  static postError: Error | null = null;
  terminated = false;
  requestId = 0;
  constructor() { super(); ControlledWorker.instances.push(this); }
  postMessage(payload: { id: number }) {
    if (ControlledWorker.postError) throw ControlledWorker.postError;
    this.requestId = payload.id;
  }
  terminate() { this.terminated = true; }
  complete(id = this.requestId) {
    this.dispatchEvent(new MessageEvent("message", { data: {
      id, ok: true, left: new Float32Array([0.1]),
      right: new Float32Array([0.2]), frameCount: 1,
      peakTrimDb: 0, path: "phase1",
    } }));
  }
}

const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
beforeEach(() => {
  ControlledWorker.instances = [];
  ControlledWorker.postError = null;
  Object.defineProperty(globalThis, "Worker", { value: ControlledWorker, configurable: true });
});
afterEach(() => {
  disposeMixBakeWorker();
  if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker);
  else Reflect.deleteProperty(globalThis, "Worker");
});
const start = () => bakeMixPcmAsync(mix, [], null, null);

it("six superseded renders stop immediately; the last render completes independently", async () => {
  for (let i = 0; i < 6; i++) {
    const job = start();
    const rejected = assert.rejects(job.result, { name: "AbortError" });
    job.cancel();
    job.cancel();
    assert.equal(ControlledWorker.instances[i].terminated, true);
    await rejected;
  }
  const last = start();
  const worker = ControlledWorker.instances[6];
  worker.complete(worker.requestId - 1);
  assert.equal(worker.terminated, false);
  worker.complete();
  const result = await last.result;
  assert.deepEqual(result.pcm, new Float32Array([0.1, 0.2]));
  assert.equal(worker.terminated, true);
  last.cancel();
});

it("cancelling one render leaves another active render running", async () => {
  const first = start();
  const second = start();
  const rejected = assert.rejects(first.result, { name: "AbortError" });
  first.cancel();
  assert.equal(ControlledWorker.instances[1].terminated, false);
  ControlledWorker.instances[1].complete();
  await second.result;
  await rejected;
});

it("disposal rejects all pending renders and releases their workers", async () => {
  const jobs = [start(), start()];
  const rejected = jobs.map(job => assert.rejects(job.result, { name: "AbortError" }));
  disposeMixBakeWorker();
  await Promise.all(rejected);
  assert.ok(ControlledWorker.instances.every(worker => worker.terminated));
});

it("a structured-clone failure releases the worker and rejects the render", async () => {
  ControlledWorker.postError = new Error("clone failed");
  const job = start();
  await assert.rejects(job.result, /clone failed/);
  assert.equal(ControlledWorker.instances[0].terminated, true);
});

it("a worker startup failure rejects asynchronously instead of stranding playback pending", async () => {
  Object.defineProperty(globalThis, "Worker", {
    value: class { constructor() { throw new Error("worker blocked"); } }, configurable: true,
  });
  const job = start();
  await assert.rejects(job.result, /worker blocked/);
  job.cancel();
});
