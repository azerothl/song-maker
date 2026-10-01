import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { chromium } from "playwright";

it("real browser workers: superseded renders abort and the final PCM matches sync DSP (#256)",
  { timeout: 60000 }, async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const base = "http://127.0.0.1:5226";
    const server = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"),
      "--host", "127.0.0.1", "--port", "5226", "--strictPort"], { cwd: root, stdio: "ignore" });
    const browser = await chromium.launch();
    try {
      const deadline = Date.now() + 20000;
      while (true) {
        try { if ((await fetch(base)).ok) break; } catch {}
        assert.ok(Date.now() < deadline, "Vite did not start");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const page = await browser.newPage();
      await page.goto(base);
      const result = await page.evaluate(async () => {
        const clientUrl = "/src/lib/mixBakeClient.ts";
        const coreUrl = "/src/lib/mixBakeCore.ts";
        const toolkitUrl = "/src/lib/productionToolkitSnapshot.ts";
        const { bakeMixPcmAsync, disposeMixBakeWorker } = await import(clientUrl);
        const { bakeMixPcmCore } = await import(coreUrl);
        const { createToolkitFromProductionOverlay } = await import(toolkitUrl);
        const mix = { schema: "song-maker.mix", schemaVersion: 1, id: "browser-cancel",
          separationId: "sep", sampleRate: 48000, masterGainDb: 0, peakCeilingDb: -1,
          tracks: [{ id: "a", name: "A", role: "vocals", gainDb: 0, pan: 0,
            mute: false, solo: false, locked: false, aiSeparated: true, clips: [] }] };
        const samples = new Float32Array(48000 * 10).fill(0.1);
        const stems = [{ trackId: "a", sampleRate: 48000, left: samples, right: samples }];
        const aborted: Promise<string>[] = [];
        for (let i = 0; i < 6; i++) {
          const job = bakeMixPcmAsync(mix, stems, null, null);
          aborted.push(job.result.then(() => "completed", (error: Error) => error.name));
          await new Promise(resolve => setTimeout(resolve, 10));
          job.cancel();
        }
        const last = await bakeMixPcmAsync(mix, stems, null, null).result;
        const sync = bakeMixPcmCore(mix, stems, createToolkitFromProductionOverlay(null), {}, { tempoBpm: null, projectTempoBpm: null });
        const equal = last.pcm.length === sync.pcm.length && last.pcm.every((v: number, i: number) => v === sync.pcm[i]);
        disposeMixBakeWorker();
        return { aborted: await Promise.all(aborted), equal, frames: last.frameCount };
      });
      assert.deepEqual(result.aborted, Array(6).fill("AbortError"));
      assert.equal(result.equal, true);
      assert.ok(result.frames > 0);
    } finally { await browser.close(); server.kill(); }
  });
