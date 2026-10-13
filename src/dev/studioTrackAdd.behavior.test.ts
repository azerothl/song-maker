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
  it("garde l’état de génération visible dans le Studio pendant le travail", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(`${baseUrl}#job-progress`, { waitUntil: "domcontentloaded" });
      const banner = page.locator(".song-job-banner[role='status']").first();
      await banner.waitFor({ state: "visible" });

      assert.equal(await banner.locator("span").innerText(), "Génération YuE2 en cours");
      assert.equal(await banner.getAttribute("aria-live"), "polite");
      assert.equal(
        await page.getByRole("button", { name: "Annuler l’opération" }).isVisible(),
        true,
      );
    } finally {
      await page.close();
    }
  });

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
      const instrumentSelect = page.getByLabel("Instrument VST3", { exact: true });
      try {
        await instrumentSelect.locator('option', { hasText: "MODO DRUM" }).waitFor({ state: "attached", timeout: 5000 });
      } catch (error) {
        const selects = await page.locator('select').evaluateAll((elements) => elements.map((element) => element.outerHTML));
        throw new Error(`${error}\nSelects: ${JSON.stringify(selects)}\nErrors: ${browserErrors.join(" | ")}`);
      }
      assert.equal(await instrumentSelect.locator('option', { hasText: "MODO BASS 2" }).count(), 1);
      assert.equal(await instrumentSelect.locator('option', { hasText: "SampleTank 4" }).count(), 1);

      await midiTab.click();
      await midiTab.press("ArrowRight");
      assert.equal(await soundTab.getAttribute("aria-selected"), "true");
      assert.equal(await panels.nth(0).isVisible(), true);
      assert.equal(await panels.nth(2).isVisible(), false);
    } finally {
      await page.close();
    }
  });

  for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
  it(`ouvre le choix VST3 depuis les réglages de piste à ${viewport.width}px et charge le catalogue automatiquement`, async () => {
    const page = await browser.newPage({ viewport });
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Ajouter une piste" }).click();
      await page.getByRole("button", { name: "Ouvrir le piano roll" }).click();
      const dock = page.locator(".studio-midi-dock");
      await dock.waitFor({ state: "visible" });
      await dock.locator(".studio-midi-dock-close").click();
      await page.getByRole("button", { name: "Réglages de la piste : Instrument MIDI 1", exact: true }).click();
      const popin = page.locator(".production-track-detail-popin");
      await popin.getByRole("button", { name: "Choisir un instrument VST3", exact: true }).click();
      await dock.waitFor({ state: "visible" });
      assert.equal(await dock.getByRole("tab", { name: "Plug-in" }).getAttribute("aria-selected"), "true");
      const select = dock.getByLabel("Instrument VST3", { exact: true });
      await select.locator('option', { hasText: "MODO DRUM" }).waitFor({ state: "attached" });
      assert.equal(await select.isEnabled(), true);
      await page.waitForFunction(() => {
        const element = document.querySelector('.studio-midi-dock .midi-vst3-block select[aria-label]');
        const inspector = element?.closest('details');
        if (!element || !inspector) return false;
        const bounds = element.getBoundingClientRect();
        const panel = inspector.getBoundingClientRect();
        return bounds.top >= panel.top && bounds.bottom <= Math.min(panel.bottom, window.innerHeight) + 1;
      }, undefined, { timeout: 5000 });
      const bounds = await select.boundingBox();
      assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1,
        `the instrument chooser must be visible: ${JSON.stringify(bounds)}`);
      await select.selectOption({ label: "MODO DRUM" });
      await dock.getByText("MODO DRUM est assigné à cette voix.", { exact: true }).waitFor({ state: "visible" });
      assert.equal(await select.inputValue(), "C:\\capture-vst3\\MODO DRUM.vst3");
    } finally {
      await page.close();
    }
  });
  }

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
