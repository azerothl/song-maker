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
  baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

describe("fallback de démarrage", () => {
  it("explique une erreur de chargement du point d’entrée au lieu d’afficher une fenêtre vide", async () => {
    const page = await browser.newPage();
    try {
      await page.route(
        (url) => new URL(url).pathname === "/src/main.tsx",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: 'throw new Error("startup probe");',
          }),
      );

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      const fallback = page.locator("#startup-fallback");
      await page.waitForFunction(
        () => document.querySelector("#startup-fallback")?.getAttribute("role") === "alert",
      );

      assert.equal(await fallback.isVisible(), true);
      assert.equal(await fallback.getAttribute("role"), "alert");
      assert.match(
        await page.locator("[data-startup-message]").innerText(),
        /L’interface n’a pas pu démarrer\./,
      );
      assert.match(await page.locator("[data-startup-details]").innerText(), /startup probe/);
      assert.equal(await page.locator("#startup-reload").isVisible(), true);
    } finally {
      await page.close();
    }
  });

  it("retire le masque de démarrage quand l’interface est prête", async () => {
    const page = await browser.newPage();
    try {
      await page.route(
        (url) => new URL(url).pathname === "/src/main.tsx",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: 'document.getElementById("root").innerHTML = \'<div class="app-shell">Song Maker</div>\';',
          }),
      );

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelector("#root .app-shell"));

      assert.equal(await page.locator("#startup-fallback").isVisible(), false);
    } finally {
      await page.close();
    }
  });

  it("réaffiche une aide si l’interface devient vide après son démarrage", async () => {
    const page = await browser.newPage();
    try {
      await page.route(
        (url) => new URL(url).pathname === "/src/main.tsx",
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/javascript",
            body: [
              'const root = document.getElementById("root");',
              'root.innerHTML = \'<div class="app-shell">Song Maker</div>\';',
              'setTimeout(() => { root.textContent = ""; }, 0);',
            ].join("\n"),
          }),
      );

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.querySelector("#startup-fallback")?.getAttribute("role") === "alert",
      );

      assert.equal(await page.locator("#startup-fallback").isVisible(), true);
      assert.match(
        await page.locator("[data-startup-details]").innerText(),
        /L’interface est devenue vide après son démarrage\./,
      );
      assert.equal(await page.locator("#startup-reload").isVisible(), true);
    } finally {
      await page.close();
    }
  });
});
