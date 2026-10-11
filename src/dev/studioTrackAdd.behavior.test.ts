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

describe("ajout de piste dans Studio", () => {
  it("annonce que l'instrument IA peut déjà contenir le mix source", async () => {
    const page = await browser.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Ajouter une piste" }).click();
      await page.getByRole("dialog", { name: /Quel type de piste/ }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Choisir une partie" }).click();

      const dialog = page.getByRole("dialog", { name: "Nouvelle partie instrumentale" });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByLabel("Le son du morceau").check();
      const notice = dialog.getByRole("note");
      assert.match(await notice.innerText(), /mix d’origine/);
      assert.match(await notice.innerText(), /pas seulement la partie choisie/);
      assert.equal(await dialog.getByRole("button", { name: "Générer et ajouter à l’arrangement" }).isDisabled(), true);
    } finally {
      await page.close();
    }
  });

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

  it("affiche au moins deux octaves dans le piano-roll aux deux formats desktop", async () => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Ajouter une piste" }).click();
        await page.getByRole("button", { name: "Ouvrir le piano roll" }).click();
        await page.locator(".studio-midi-dock .piano-scroll").waitFor({ state: "visible" });

        const geometry = await page.evaluate(() => {
          const scroll = document.querySelector(".studio-midi-dock .piano-scroll");
          if (!(scroll instanceof HTMLElement)) return null;
          const bounds = scroll.getBoundingClientRect();
          const keys = Array.from(document.querySelectorAll<HTMLElement>(".studio-midi-dock .piano-key"));
          return {
            keyHeight: keys[0]?.getBoundingClientRect().height ?? 0,
            visibleKeys: keys.filter((key) => {
              const rect = key.getBoundingClientRect();
              return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
            }).length,
          };
        });

        assert.ok(geometry, `Piano-roll absent à ${viewport.width}×${viewport.height}`);
        assert.equal(geometry.keyHeight, 7, `Rangées MIDI trop hautes à ${viewport.width}×${viewport.height}`);
        assert.ok(
          geometry.visibleKeys >= 24,
          `Moins de 24 touches visibles à ${viewport.width}×${viewport.height}: ${geometry.visibleKeys} touches`,
        );
      } finally {
        await page.close();
      }
    }
  });
});
