/**
 * #276 — marqueur borné à la durée affichée ; #277 — saisie tempo conservée.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";
import type { MixDoc } from "../lib/types";

const PORT = 5237;
const BASE = `http://127.0.0.1:${PORT}/arrangement-capture.html`;
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

async function readMix(page: Page): Promise<MixDoc> {
  const mix = await page.evaluate(() => window.__arrangementMix);
  assert.ok(mix, "mix fixture missing");
  return mix;
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

describe("arrangement interactions", () => {
  it(
    "#276 clamps marker position to the displayed ruler",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.addInitScript(() => localStorage.setItem("song-maker.locale", "fr"));
        await page.goto(BASE, { waitUntil: "networkidle" });
        await page.locator(".clip-marker-flag").click();
        const shift = page.getByLabel(
          "Déplacer les clips avec le marqueur (sans toucher à la source)",
        );
        if (await shift.isChecked()) await shift.uncheck();
        const position = page.getByLabel("Position (ms)");
        await position.waitFor();
        assert.equal(await position.getAttribute("max"), "30000");
        await position.fill("60000");
        await position.blur();
        const mix = await readMix(page);
        const marker = mix.markers?.[0];
        assert.ok(marker);
        assert.ok(
          marker.startMs <= 30_000,
          `marker ${marker.startMs} exceeds initial ruler 30000`,
        );
        assert.equal(marker.startMs, 30_000);
        assert.equal(await page.locator(".clip-ruler").getAttribute("aria-valuemax"), "30000");
        const flag = page.locator(".clip-marker-flag");
        await flag.focus();
        await page.keyboard.press("ArrowRight");
        assert.equal((await readMix(page)).markers?.[0]?.startMs, 30_000);
        await page.keyboard.press("Shift+ArrowLeft");
        assert.equal((await readMix(page)).markers?.[0]?.startMs, 29_500);
        await page.keyboard.press("Home");
        assert.equal((await readMix(page)).markers?.[0]?.startMs, 0);
        await page.keyboard.press("End");
        assert.equal((await readMix(page)).markers?.[0]?.startMs, 30_000);
        assert.equal(
          await page.locator(".clip-ruler").getAttribute("aria-valuemax"),
          "30000",
        );
      } finally {
        await page.close();
      }
    },
  );

  it(
    "#277 keeps applied tempo draft after a second apply",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.addInitScript(() => localStorage.setItem("song-maker.locale", "fr"));
        await page.goto(BASE, { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Carte de tempo", exact: true }).click();
        const bpm = page.getByLabel("BPM", { exact: true });
        const at = page.getByLabel("À (ms)", { exact: true });
        await bpm.fill("150");
        await at.fill("8000");
        const apply = page.getByRole("button", { name: "Ajouter / mettre à jour", exact: true });
        await apply.click();
        let mix = await readMix(page);
        assert.deepEqual(mix.tempoMap, [
          { startMs: 0, quarterBpm: 120 },
          { startMs: 8000, quarterBpm: 150 },
        ]);
        assert.equal(await bpm.inputValue(), "150");
        assert.equal(await at.inputValue(), "8000");
        await apply.click();
        mix = await readMix(page);
        assert.deepEqual(
          mix.tempoMap,
          [
            { startMs: 0, quarterBpm: 120 },
            { startMs: 8000, quarterBpm: 150 },
          ],
          "second apply must not reset the change to the first BPM",
        );
        assert.equal(await bpm.inputValue(), "150");
        assert.equal(await at.inputValue(), "8000");
      } finally {
        await page.close();
      }
    },
  );
});
