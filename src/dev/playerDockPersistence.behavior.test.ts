import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

before(async () => {
  server = await startCaptureViteServer(0);
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Vite n’a pas exposé son port de capture.");
  }
  baseUrl = `http://127.0.0.1:${address.port}/player-dock-capture.html`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

describe("lecteur persistant et forme d’onde de la bibliothèque", () => {
  it("permet de lire pendant le calcul de forme d’onde puis conserve le dock entre écrans", async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const libraryWaveform = page.locator(".library-track-waveform .waveform-canvas");
      const dockWaveform = page.locator(".persistent-player-dock .waveform-canvas[data-peak-count]");
      await libraryWaveform.waitFor({ state: "visible" });
      await dockWaveform.waitFor({ state: "visible" });
      assert.equal(await page.locator(".library-track-waveform .waveform-loading").isVisible(), true);
      const dockTransport = page.locator(".persistent-player-dock .player button");
      await dockTransport.click();
      await page.getByRole("button", { name: "Pause", exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.locator(".library-track-waveform .waveform-loading").isVisible(), true);
      await page.evaluate(() => window.__captureReleaseGenerationWaveform?.());
      await page.locator(".library-track-waveform .waveform-canvas[data-peak-count]").waitFor({ state: "visible" });
      await dockTransport.click();
      await page.getByRole("button", { name: "Lecture", exact: true }).waitFor({ state: "visible" });
      assert.equal(await page.getByText("Nuit claire").count() >= 1, true);

      const captureDirectory = process.env.SONG_MAKER_UI_CAPTURE_DIR?.trim();
      if (captureDirectory) {
        await mkdir(captureDirectory, { recursive: true });
        await page.screenshot({ path: path.join(captureDirectory, "library-player-dock.png") });
      }

      await page.getByRole("button", { name: "Projets", exact: true }).click();
      await page.getByRole("heading", { name: "Projets" }).waitFor({ state: "visible" });
      await dockWaveform.waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      const openDialogs = await page.locator('[aria-modal="true"]').evaluateAll((elements) =>
        elements.filter((element) => element.getClientRects().length > 0).length,
      );
      assert.equal(openDialogs, 0, "Aucun dialogue ne doit masquer l’écran Projets.");
      assert.equal(await page.locator(".persistent-player-dock .player .path").textContent(), "Nuit claire");

      if (captureDirectory) {
        await page.screenshot({ path: path.join(captureDirectory, "projects-player-dock.png") });
      }
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
});
