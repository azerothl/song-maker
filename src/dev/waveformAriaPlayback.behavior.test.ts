/**
 * #232 B2 — aria slider sur piste sans waveform pendant la lecture.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";
import type { ViteDevServer } from "vite";

const PORT = 5204;
const BASE = `http://127.0.0.1:${PORT}/waveform-aria-harness.html`;

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

describe("waveform aria pendant lecture (#232 B2)", () => {
  it("met à jour aria-valuenow via le bus sans calque peaks", async () => {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const aria = await page.evaluate(() => {
      const api = window.__waveformAriaHarness;
      if (!api) throw new Error("harness missing");
      return api.tick(42.5);
    });
    await page.close();
    assert.equal(aria.valueNow, "42.5");
    assert.match(aria.valueText ?? "", /0:42/);
  });
});
