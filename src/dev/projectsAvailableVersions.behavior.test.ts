import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

const PORT = 5193;
const BASE = `http://127.0.0.1:${PORT}/projects-capture.html`;
let server: ViteDevServer;
let browser: Browser;

before(async () => {
  server = await startCaptureViteServer(PORT);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

describe("Projets avec prise MCP terminée (#410)", () => {
  it("affiche la durée et les versions quand la prise existe mais n’est pas active", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    try {
      await page.addInitScript(() => localStorage.setItem("song-maker.locale", "fr"));
      await page.goto(BASE, { waitUntil: "networkidle" });
      const row = page.locator(".library-table tbody tr").filter({ hasText: "MCP Q4 end-to-end proof" });
      await row.waitFor();

      assert.equal(await row.locator("td").nth(1).innerText(), "0:30");
      assert.equal(await row.locator("td").nth(3).innerText(), "versions disponibles");
      assert.equal(
        await row.getByText("Ouvrez le projet pour sélectionner une version.").isVisible(),
        true,
      );
      assert.equal(await page.locator(".library-table tbody tr").count(), 2);
      assert.deepEqual(pageErrors, []);
    } finally {
      await page.close();
    }
  });
});
