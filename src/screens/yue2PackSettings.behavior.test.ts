/**
 * Réglages → Modèle : choisir Q4/Q8 ne télécharge rien tant que le bouton
 * de confirmation n’est pas activé (licences) puis cliqué.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import type { ViteDevServer } from "vite";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "../dev/captureViteServer.ts";

const PORT = 5241;
const BASE = captureBaseUrl(PORT, "settings-capture.html");

let activeServer: ViteDevServer | null = null;

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`serveur inaccessible : ${url}`);
}

describe("settings YuE2 download", () => {
  afterEach(async () => {
    if (activeServer) {
      await stopCaptureViteServer(activeServer);
      activeServer = null;
    }
  });

  it("affiche un bouton de téléchargement après le choix Q4 ou Q8", { timeout: 60_000 }, async () => {
    activeServer = await startCaptureViteServer(PORT);
    await waitServer(`${BASE}#yue2-missing`);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openMissingModel(page);

      const download = page.getByTestId("settings-yue2-download");
      await download.waitFor({ state: "visible" });
      assert.match(await download.innerText(), /Télécharger Version légère et rapide/);
      assert.equal(await download.isDisabled(), true);
      assert.match(await page.locator("body").innerText(), /Aucun modèle téléchargé/);

      await page.getByRole("button", { name: "Version plus détaillée", exact: true }).click();
      assert.equal(
        await page.getByRole("button", { name: "Version plus détaillée", exact: true }).getAttribute("aria-pressed"),
        "true",
      );
      assert.match(await download.innerText(), /Télécharger Version plus détaillée/);
      assert.doesNotMatch(await page.locator("body").innerText(), /Ce pack est déjà sur cet ordinateur/);

      await page.getByRole("checkbox", { name: /licence YuE2/ }).check();
      assert.equal(await download.isDisabled(), true);
      await page.getByRole("checkbox", { name: /HTDemucs/ }).check();
      assert.equal(await download.isDisabled(), false);

      await download.click();
      await page.getByText("Ce pack est déjà sur cet ordinateur.").waitFor();
      assert.equal(await download.count(), 0);
    } finally {
      await browser.close();
    }
  });
});

async function openMissingModel(page: Page): Promise<void> {
  await page.goto(`${BASE}#yue2-missing`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-capture-scenario="reglages-yue2-missing"]');
}
