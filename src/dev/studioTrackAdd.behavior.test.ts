import assert from "node:assert/strict";
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
  baseUrl = `http://127.0.0.1:${address.port}/studio-track-add-capture.html`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

describe("ajout de piste MIDI dans Studio", () => {
  it("crée la piste dans le mix et ouvre son éditeur", async () => {
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Ajouter une piste" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Ajouter une piste" }).click();
      await page.getByRole("dialog", { name: /Quel type de piste/ }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Ouvrir le piano roll" }).click();

      try {
        await page.waitForFunction(() => {
          const state = window.__captureGetMidiTrackState?.();
          return Boolean(
            state?.mix?.tracks.some((track) => track.role === "midi") &&
              state.voices.some((voice) => voice.role === "other"),
          );
        });
      } catch (error) {
        const browserState = await page.evaluate(() => ({
          midi: window.__captureGetMidiTrackState?.() ?? null,
          visibleText: document.body.innerText.slice(-3000),
          captureEnabled: document.querySelector("[data-capture-mock='studio-track-add']") !== null,
        }));
        throw new Error(
          `${String(error)}\n` +
            `La piste MIDI n'a pas été persistée dans le délai imparti.\n` +
            `État navigateur : ${JSON.stringify(browserState)}\n` +
            `Erreurs navigateur : ${browserErrors.join(" | ") || "aucune"}`,
        );
      }

      const persisted = await page.evaluate(() => window.__captureGetMidiTrackState?.());
      assert.equal(persisted?.mix?.tracks.length, 1);
      assert.equal(persisted?.mix?.tracks[0].name, "Instrument MIDI 1");
      assert.equal(persisted?.voices.length, 1);
      assert.equal(persisted?.voices[0].name, "Instrument MIDI 1");
      assert.equal(await page.getByRole("heading", { name: "Instrument MIDI 1" }).count(), 1);
      assert.equal(await page.locator(".studio-midi-dock").isVisible(), true);

      await page.locator(".studio-midi-instrument-settings > summary").click();
      const soundTab = page.getByRole("tab", { name: "Son" });
      const pluginTab = page.getByRole("tab", { name: "Plug-in" });
      const midiTab = page.getByRole("tab", { name: "MIDI" });
      const panels = page.locator(".midi-settings-tabpanel");
      assert.equal(await soundTab.getAttribute("aria-selected"), "true");
      assert.equal(await panels.nth(0).isVisible(), true);
      assert.equal(await panels.nth(1).isVisible(), false);
      assert.equal(await panels.nth(2).isVisible(), false);

      await pluginTab.click();
      assert.equal(await pluginTab.getAttribute("aria-selected"), "true");
      assert.equal(await panels.nth(0).isVisible(), false);
      assert.equal(await panels.nth(1).isVisible(), true);

      await midiTab.click();
      await midiTab.press("ArrowRight");
      assert.equal(await soundTab.getAttribute("aria-selected"), "true");
      assert.equal(await panels.nth(0).isVisible(), true);
      assert.equal(await panels.nth(2).isVisible(), false);
    } finally {
      await page.close();
    }
  });
});
