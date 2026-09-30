/**
 * #202 — compteur séquentiel et états file / échec / reprise (Playwright, VITE_CAPTURE=1).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import {
  buildFileRows,
  browserDemoFromHash,
  downloadProgressOrdinal,
} from "../lib/firstLaunch.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PORT = 5214;
const BASE = `http://127.0.0.1:${PORT}/`;

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

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

type DownloadProbe = {
  lead: string;
  hasCounter: boolean;
  queueLabels: number;
  activeLabels: number;
  failedLabels: number;
  resumeLabels: number;
  retryButtons: number;
  resumeBottom: number;
  resumeInView: boolean;
  vh: number;
};

async function probeDownload(page: Page, hash: string): Promise<DownloadProbe> {
  await page.goto(`${BASE}#${hash}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='fl-download-lead']", {
    timeout: 15_000,
  });
  await page.waitForTimeout(200);
  return page.evaluate(`(() => {
    const vh = window.innerHeight;
    const lead =
      document.querySelector("[data-testid='fl-download-lead']")?.textContent?.trim() ??
      "";
    const rowEls = Array.from(document.querySelectorAll(".fl-file"));
    const queueLabels = rowEls.filter((r) => r.classList.contains("fl-queued")).length;
    const activeLabels = rowEls.filter(
      (r) => r.getAttribute("data-fl-status") === "active",
    ).length;
    const failedLabels = rowEls.filter(
      (r) => r.getAttribute("data-fl-status") === "error",
    ).length;
    const resumeLabels = rowEls.filter(
      (r) => r.getAttribute("data-fl-status") === "partial",
    ).length;
    const retryButtons = document.querySelectorAll(
      "[data-testid='fl-retry-file']",
    ).length;
    const resumeBtn = document.querySelector("[data-testid='fl-resume-download']");
    const rr = resumeBtn?.getBoundingClientRect();
    const resumeInView = Boolean(
      rr && rr.height > 0 && rr.top >= -0.5 && rr.bottom <= vh + 0.5,
    );
    return {
      lead,
      hasCounter: /· \\d+ sur \\d+|· \\d+ of \\d+/.test(lead),
      queueLabels,
      activeLabels,
      failedLabels,
      resumeLabels,
      retryButtons,
      resumeBottom: rr ? Math.round(rr.bottom) : -1,
      resumeInView,
      vh,
    };
  })()`) as Promise<DownloadProbe>;
}

describe("first-launch download UI (#202)", { concurrency: 1 }, () => {
  let proc: ReturnType<typeof spawn> | undefined;
  let browser: Browser | undefined;

  before(async () => {
    proc = spawn(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
      {
        cwd: ROOT,
        env: { ...process.env, VITE_CAPTURE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitServer(BASE);
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    proc?.kill("SIGTERM");
  });

  for (let run = 0; run < 3; run += 1) {
    it(`compteur + file d’attente (run ${run + 1}/3)`, async () => {
      const fixture = browserDemoFromHash("download");
      const rows = buildFileRows(fixture.plan, fixture.progress);
      const ordinal = downloadProgressOrdinal(fixture.progress, rows);
      assert.deepEqual(ordinal, { index: 3, total: 6 });

      const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        const probe = await probeDownload(page, "download");
        assert.equal(probe.vh, 720);
        assert.equal(probe.hasCounter, true, `lead=${probe.lead}`);
        assert.match(probe.lead, /· 3 sur 6/);
        assert.ok(probe.queueLabels >= 1, "file d’attente attendue");
        assert.equal(probe.activeLabels, 1);
        assert.equal(probe.failedLabels, 0);
        assert.equal(probe.resumeInView, true, `Reprendre bottom=${probe.resumeBottom}`);
      } finally {
        await page.close();
      }
    });

    it(`échec et reprise distincts (run ${run + 1}/3)`, async () => {
      const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        const failed = await probeDownload(page, "c");
        assert.equal(failed.failedLabels, 1);
        assert.ok(failed.retryButtons >= 1, "bouton Réessayer sur la ligne en échec");

        await page.goto(`${BASE}#reprise`, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-testid='fl-download-lead']", {
          timeout: 15_000,
        });
        await page.waitForFunction(
          () => document.querySelector('[data-fl-status="partial"]') != null,
        );
        const resumeLabels = await page.evaluate(
          () =>
            document.querySelectorAll('[data-fl-status="partial"]').length,
        );
        assert.equal(resumeLabels, 1);
        assert.equal(failed.resumeInView, true, `Reprendre bottom=${failed.resumeBottom}`);
      } finally {
        await page.close();
      }
    });
    it(`bouton Réessayer ≥ 36 px et licence ≠ file (run ${run + 1}/3)`, async () => {
      const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.goto(`${BASE}#c`, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-testid='fl-retry-file']", { timeout: 15_000 });
        const retryHeight = await page.evaluate(() => {
          const btn = document.querySelector("[data-testid='fl-retry-file']");
          return btn ? btn.getBoundingClientRect().height : 0;
        });
        assert.ok(retryHeight >= 36, `retry height=${retryHeight}`);

        await page.goto(`${BASE}#blocked-license`, { waitUntil: "networkidle" });
        await page.waitForSelector(".fl-file.fl-queued", { timeout: 15_000 });
        const queueStyle = await page.evaluate(() =>
          getComputedStyle(document.querySelector(".fl-file.fl-queued")!).borderStyle,
        );
        await page.waitForSelector(".fl-file.fl-blocked-license", { timeout: 15_000 });
        const blockedStyle = await page.evaluate(() =>
          getComputedStyle(document.querySelector(".fl-file.fl-blocked-license")!).borderStyle,
        );
        assert.equal(queueStyle, "dashed");
        assert.equal(blockedStyle, "double");
      } finally {
        await page.close();
      }
    });

    it(`ETA anglais sans français (run ${run + 1}/3)`, async () => {
      const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.addInitScript(() => localStorage.setItem("song-maker.locale", "en"));
        await page.goto(`${BASE}#download`, { waitUntil: "networkidle" });
        await page.waitForSelector(".fl-global", { timeout: 15_000 });
        const etaLine = await page.evaluate(
          () => document.querySelector(".fl-global")?.textContent ?? "",
        );
        assert.match(etaLine, /Time left:/i);
        assert.doesNotMatch(etaLine, /Temps restant|Estimation dès/i);
        assert.match(etaLine, /estimate|Estimated/i);
      } finally {
        await page.close();
      }
    });
  }
});
