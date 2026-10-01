/**
 * #279 — Exporter enabled for import-only projects (no activeGenerationId).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

const PORT = 5239;
const BASE = `http://127.0.0.1:${PORT}/export-import-capture.html`;
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

describe("export trigger (#279)", () => {
  it(
    "enables Export for an import-only mix without generation",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.addInitScript(() => localStorage.setItem("song-maker.locale", "fr"));
        await page.goto(`${BASE}#with-audio`, { waitUntil: "networkidle" });
        const trigger = page.locator("[data-capture-export-trigger]");
        await trigger.waitFor();
        assert.equal(await trigger.isDisabled(), false);
        await trigger.click();
        await page.getByRole("heading", { name: "Exporter", exact: true }).waitFor();
        const mixRadio = page.getByRole("radio", { name: /Mix \(master\)/ });
        assert.equal(await mixRadio.isChecked(), true);
      } finally {
        await page.close();
      }
    },
  );

  it(
    "keeps Export disabled when no usable audio exists",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.addInitScript(() => localStorage.setItem("song-maker.locale", "fr"));
        await page.goto(`${BASE}#empty`, { waitUntil: "networkidle" });
        const trigger = page.locator("[data-capture-export-trigger]");
        await trigger.waitFor();
        assert.equal(await trigger.isDisabled(), true);
        assert.match(
          (await trigger.getAttribute("title")) ?? "",
          /Importez ou générez/,
        );
      } finally {
        await page.close();
      }
    },
  );
});
