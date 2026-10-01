/**
 * #232 B1 — parité pixel rendu waveform (référence main vs calques optimisés).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";
import type { ViteDevServer } from "vite";

const PORT = 5203;
const BASE = `http://127.0.0.1:${PORT}/waveform-render-parity.html`;

/** Arrondi DPR / anti-alias : quelques pixels par canvas. */
const MAX_DIFFERING_PIXELS_PER_CANVAS = 8;

let server: ViteDevServer;
let browser: Browser;

before(async () => {
  server = await startCaptureViteServer(PORT);
  browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
});

after(async () => {
  await browser?.close();
  await stopCaptureViteServer(server);
});

describe("waveformRenderParity (#232 B1)", () => {
  it("correspond au rendu historique à DPR 1 et 1,5 (18+ configurations)", async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const results = await page.evaluate(async () => {
      const api = window.__waveformRenderParity;
      if (!api) throw new Error("harness missing");
      return await api.run([1, 1.5]);
    });
    await page.close();

    assert.equal(results.length, 18 * 2, `runs=${results.length}`);
    const offenders = results.filter(
      (r) => r.differingPixels > MAX_DIFFERING_PIXELS_PER_CANVAS,
    );
    assert.equal(
      offenders.length,
      0,
      offenders
        .slice(0, 5)
        .map(
          (o) =>
            `${o.caseId}@${o.dpr}: ${o.differingPixels}/${o.totalPixels} px (Δmax ${o.maxChannelDelta})`,
        )
        .join("; "),
    );
  });
});
