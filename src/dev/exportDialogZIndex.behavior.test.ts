/**
 * #282 — dialogue Exporter au-dessus de la règle sticky (hit-test).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

const PORT = 5241;
const BASE = `http://127.0.0.1:${PORT}/export-zindex-capture.html`;
const IT_TIMEOUT_MS = 120_000;

let vite: ViteDevServer | undefined;
let browser: Browser;

async function waitServer(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`serveur inaccessible : ${url}`);
}

before(async () => {
  vite = await startCaptureViteServer(PORT);
  await waitServer(BASE);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (vite) await stopCaptureViteServer(vite);
});

describe("export dialog stacking (#282)", () => {
  it(
    "keeps export format controls above the sticky ruler",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 832 } });
      try {
        await page.addInitScript(() => localStorage.setItem("song-maker.locale", "fr"));
        await page.goto(BASE, { waitUntil: "networkidle" });
        await page.locator("[data-capture-export-trigger]").click();
        const format = page.getByTestId("export-format");
        await format.waitFor();
        const box = await format.boundingBox();
        assert.ok(box);
        const hit = await page.evaluate(({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return {
            tag: el?.tagName ?? null,
            testId: el?.getAttribute("data-testid") ?? null,
            inDialog: Boolean(el?.closest(".export-dialog-popin")),
            layerParent: document.querySelector(".anchored-popin-layer")?.parentElement?.tagName ?? null,
          };
        }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
        assert.equal(hit.layerParent, "BODY");
        assert.equal(hit.inDialog, true);
        assert.notEqual(hit.testId, "blocking-ruler");
      } finally {
        await page.close();
      }
    },
  );
});
