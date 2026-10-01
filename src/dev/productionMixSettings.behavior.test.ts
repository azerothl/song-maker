/**
 * #225 — Échap imbriqué, entrée Clips, clic clip non bloquant.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5196;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;

const IT_TIMEOUT_MS = 120_000;

let vite: ReturnType<typeof spawn> | undefined;
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

before(async () => {
  vite = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env, VITE_CAPTURE: "1" },
    },
  );
  await waitServer(BASE);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  vite?.kill("SIGTERM");
});

describe("production mix settings comportement (#225)", () => {
  it(
    "Clips : bouton Réglages du mix visible",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${BASE}#view-clips-16`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="production-mix-settings-trigger-clips"]', {
        state: "visible",
      });
      await page.close();
    },
  );

  it(
    "popover ouvert : clic sur un clip change la sélection (non bloquant)",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${BASE}#view-clips-16`, { waitUntil: "networkidle" });
      await page.click('[data-testid="production-mix-settings-trigger-clips"]');
      await page.waitForSelector('[data-testid="production-mix-settings-popin"]');
      await page.waitForSelector(".clip-lane .clip-block", { timeout: 30_000 });
      await page.waitForTimeout(300);
      const hitClip = await page.evaluate(() => {
        const clips = Array.from(document.querySelectorAll(".clip-lane .clip-block"));
        for (const clip of clips) {
          const r = clip.getBoundingClientRect();
          if (r.height < 4 || r.width < 4) continue;
          const top = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          if (top?.closest(".clip-block")) return true;
        }
        return false;
      });
      assert.equal(hitClip, true, "le clip doit rester cliquable sous le popover non modal");
      await page.locator(".clip-lane .clip-block").first().click();
      await page.waitForSelector(".clip-inspector", { timeout: 10_000 });
      const popinStillOpen = await page
        .locator('[data-testid="production-mix-settings-popin"]')
        .isVisible();
      assert.equal(popinStillOpen, true);
      await page.close();
    },
  );

  it(
    "Échap ferme d'abord l'Assistant, pas Réglages du mix",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${BASE}#confortable-12`, { waitUntil: "networkidle" });
      await page.click('[data-testid="production-mix-settings-trigger"]');
      await page.waitForSelector('[data-testid="production-mix-settings-popin"]');
      await page.getByRole("button", { name: "Assistant de mix" }).click();
      await page.getByRole("menuitem", { name: "Assistant de mix" }).click();
      await page.waitForSelector(".mix-assist-popin");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".mix-assist-popin").count(), 0);
      assert.equal(
        await page.locator('[data-testid="production-mix-settings-popin"]').isVisible(),
        true,
      );
      await page.close();
    },
  );

  it(
    "Échap ferme d'abord l'avis de séparation, pas Réglages du mix",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${BASE}#confortable-12`, { waitUntil: "networkidle" });
      await page.click('[data-testid="production-mix-settings-trigger"]');
      await page.waitForSelector('[data-testid="production-mix-settings-popin"]');
      await page.locator('[data-testid="production-mix-settings-separate"]').click();
      await page.waitForSelector(".separation-recommend-popin");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator(".separation-recommend-popin").count(), 0);
      assert.equal(
        await page.locator('[data-testid="production-mix-settings-popin"]').isVisible(),
        true,
      );
      await page.close();
    },
  );
});
