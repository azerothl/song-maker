import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

let server: ViteDevServer;
let browser: Browser;
before(async () => { server = await startCaptureViteServer(5281); browser = await chromium.launch(); });
after(async () => { await browser?.close(); if (server) await stopCaptureViteServer(server); });

it("comparative media survives polling, pause, seek and source switches (#379)", { timeout: 40000 }, async () => {
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:5281/product-audit-capture.html");
    const audio = page.locator(".ace-step-ab audio");
    await audio.evaluate(async (node: HTMLAudioElement) => { await node.play(); });
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".ace-step-ab audio")!.currentTime > 3.2);
    assert.ok(Number(await page.locator("#poll").textContent()) > 20, "parent rerendered during playback");
    await audio.evaluate((node: HTMLAudioElement) => { node.pause(); node.currentTime = 6; });
    await page.waitForTimeout(500);
    assert.equal(await audio.evaluate((node: HTMLAudioElement) => node.paused), true);
    assert.ok((await audio.evaluate((node: HTMLAudioElement) => node.currentTime)) >= 6);
    await page.getByRole("button", { name: "ACE-Step · gen-002", exact: true }).click();
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".ace-step-ab audio")!.readyState >= 1);
    assert.equal(await audio.evaluate((node: HTMLAudioElement) => node.paused), true, "switch preserves explicit pause");
    await audio.evaluate(async (node: HTMLAudioElement) => { await node.play(); });
    await page.waitForFunction(() => document.querySelector<HTMLAudioElement>(".ace-step-ab audio")!.currentTime > 7);
    await page.getByRole("button", { name: "Comparer les dernières prises", exact: true }).click();
    await page.getByRole("button", { name: "Choisir pour écouter" }).last().click();
    const preview = page.locator(".candidate-compare audio");
    await preview.evaluate(async (node: HTMLAudioElement) => { await node.play(); });
    assert.equal(await audio.evaluate((node: HTMLAudioElement) => node.paused), true, "only one audition plays");
    assert.equal(await page.locator("#used").textContent(), "", "audition does not activate a take");
    await page.locator("#batch").getByRole("button", { name: "Écouter", exact: true }).click();
    const batchAudio = page.locator("#batch audio");
    const playerBox = await batchAudio.boundingBox();
    assert.ok(playerBox && playerBox.width >= 250 && playerBox.height >= 44, "batch media controls are visible with the product stylesheet");
    await batchAudio.evaluate(async (node: HTMLAudioElement) => { await node.play(); });
    assert.equal(await preview.evaluate((node: HTMLAudioElement) => node.paused), true);
    assert.equal(await batchAudio.getAttribute("src"), await audio.getAttribute("src"), "batch preview uses the selected task's audio");
    assert.equal(await page.locator("#used").textContent(), "", "batch listen does not open or activate the project");
  } finally { await page.close(); }
});

it("shows a readable alert when a take audio file is missing (#381)", { timeout: 15000 }, async () => {
  const page = await browser.newPage();
  try {
    await page.route("http://127.0.0.1:5281/missing-audio.wav", route =>
      route.fulfill({ status: 404, contentType: "text/plain", body: "Not Found" }),
    );
    await page.goto("http://127.0.0.1:5281/product-audit-capture.html?missing=1");
    const alert = page.getByRole("alert");
    await alert.waitFor({ state: "visible" });
    assert.equal(
      await alert.textContent(),
      "Cette prise ne peut pas être lue. Vérifiez que le fichier audio est encore disponible.",
    );
  } finally { await page.close(); }
});
