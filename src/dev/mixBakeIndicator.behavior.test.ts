/**
 * Comportement indicateur rebake mix (#234 / revue Alphonse).
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { chromium, type Browser } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 5184;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;

async function waitServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  throw new Error(`serveur inaccessible: ${url}`);
}

function startVite(): ChildProcess {
  return spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: root,
      stdio: "ignore",
      env: { ...process.env, VITE_CAPTURE: "1" },
    },
  );
}

async function withBrowser(
  fn: (browser: Browser) => Promise<void>,
): Promise<void> {
  const browser = await chromium.launch();
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

function visibleBakeStatusCount(page: import("playwright").Page): Promise<number> {
  return page.locator(".production-mix-bake-chrome .player-mix-bake-status").evaluateAll(
    (nodes) =>
      nodes.filter((n) => {
        const el = n as HTMLElement;
        const text = (el.textContent ?? "").trim();
        if (!text) return false;
        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") return false;
        let p: HTMLElement | null = el;
        while (p) {
          const ps = window.getComputedStyle(p);
          if (ps.display === "none") return false;
          p = p.parentElement;
        }
        return true;
      }).length,
  );
}

describe("mix bake status indicator (#234)", () => {
  it("un seul indicateur visible dans la chrome Production (mix)", async () => {
    const vite = startVite();
    try {
      await waitServer(`${BASE}#mixbake-indicator`);
      await withBrowser(async (browser) => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        await page.goto(`${BASE}#12,auto,expanded,mixbake-indicator`);
        await page.locator(".production-mix-bake-chrome .player-mix-bake-status").waitFor({
          state: "visible",
          timeout: 15_000,
        });
        assert.equal(await visibleBakeStatusCount(page), 1);
        const live = await page.locator('[role="status"], [role="alert"]').evaluateAll(
          (nodes) =>
            nodes.filter((n) => {
              const t = (n.textContent ?? "").toLowerCase();
              return t.includes("mix") && (n as HTMLElement).offsetParent !== null;
            }).length,
        );
        assert.equal(live, 1);
      });
    } finally {
      vite.kill("SIGTERM");
    }
  });

  it("visible en vue Outils (EQ) pendant le rebake", async () => {
    const vite = startVite();
    try {
      await waitServer(`${BASE}#view-tools,mixbake-indicator`);
      await withBrowser(async (browser) => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        await page.goto(`${BASE}#12,auto,expanded,view-tools,mixbake-indicator`);
        const status = page.locator(".production-mix-bake-chrome .player-mix-bake-status");
        await status.waitFor({ state: "visible", timeout: 15_000 });
        assert.match(await status.innerText(), /mix/i);
        assert.equal(await visibleBakeStatusCount(page), 1);
      });
    } finally {
      vite.kill("SIGTERM");
    }
  });

  it("slot à hauteur fixe : CLS bannière master ≤ 0,25 à 640 px", async () => {
    const vite = startVite();
    try {
      await waitServer(`${BASE}#mixbake-cycle`);
      await withBrowser(async (browser) => {
        const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
        await page.goto(`${BASE}#12,auto,expanded,mixbake-cycle`);
        const banner = page.locator(".production-mix-master.mix-master-banner");
        await banner.waitFor({ state: "visible" });
        const before = await banner.evaluate((el) => el.getBoundingClientRect().height);
        await page.waitForTimeout(500);
        const during = await banner.evaluate((el) => el.getBoundingClientRect().height);
        await page.waitForTimeout(3200);
        const after = await banner.evaluate((el) => el.getBoundingClientRect().height);
        const cls = Math.abs(during - before) / 640 + Math.abs(after - during) / 640;
        assert.ok(cls <= 0.25, `CLS≈${cls} before=${before} during=${during} after=${after}`);
      });
    } finally {
      vite.kill("SIGTERM");
    }
  });

  it("disparaît le texte après fin de pending (cycle capture)", async () => {
    const vite = startVite();
    try {
      await waitServer(`${BASE}#mixbake-cycle`);
      await withBrowser(async (browser) => {
        const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
        await page.goto(`${BASE}#12,auto,expanded,mixbake-cycle`);
        const status = page.locator(".production-mix-bake-chrome .player-mix-bake-status");
        await status.waitFor({ state: "visible", timeout: 15_000 });
        await page.waitForTimeout(3200);
        assert.equal((await status.textContent())?.trim() ?? "", "");
      });
    } finally {
      vite.kill("SIGTERM");
    }
  });
});
