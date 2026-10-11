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
  baseUrl = `http://127.0.0.1:${address.port}/create-capture.html`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

describe("accessibilité du formulaire Créer (#378)", () => {
  it("garde Générer actif et conduit le clavier au premier champ invalide avec son erreur liée", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const generate = page.getByRole("button", { name: "Générer", exact: true }).first();
      assert.equal(await generate.isEnabled(), true);
      await generate.focus();
      await page.keyboard.press("Enter");

      const style = page.getByRole("textbox", { name: /style/i });
      await page.waitForFunction(() => document.activeElement?.id === "create-style");
      assert.equal(await style.getAttribute("aria-invalid"), "true");
      assert.equal(await style.getAttribute("aria-describedby"), "create-style-error");
      assert.ok((await page.locator("#create-style-error").textContent())?.trim());
      assert.equal(
        await style.evaluate((element) => element.matches(":focus-visible") && getComputedStyle(element).outlineStyle !== "none"),
        true,
      );
    } finally {
      await page.close();
    }
  });

  it("réorganise le formulaire sans débordement horizontal à 320 px", async () => {
    const page = await browser.newPage({ viewport: { width: 320, height: 740 } });
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      assert.ok(dimensions.document <= dimensions.viewport, JSON.stringify(dimensions));
    } finally {
      await page.close();
    }
  });
});
