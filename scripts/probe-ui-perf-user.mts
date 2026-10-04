#!/usr/bin/env node
/**
 * Interactive UI perf probe — fresh page per scenario so Long Tasks are attributed correctly.
 * Usage: node --import tsx scripts/probe-ui-perf.mts
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const outFile = path.join(repoRoot, "bench", "ui-perf-probe-last.json");
const port = 5201;
const base = `http://127.0.0.1:${port}`;

type LongTask = { name: string; duration: number; start: number };

type ScenarioResult = {
  label: string;
  wallClockMs: number;
  longTaskCount: number;
  longTasksMs: number;
  worstLongTaskMs: number;
  longTasks: LongTask[];
  dom?: Record<string, number>;
  extra?: unknown;
};

declare global {
  interface Window {
    __lt?: LongTask[];
    __ltObs?: PerformanceObserver;
    __scoreTabBench?: {
      runMicrobenches: () => Promise<unknown>;
      runScorePanelOpen: () => Promise<unknown>;
      runScorePanelOpenLong?: () => Promise<unknown>;
    };
  }
}

function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then((r) => {
          if (r.ok) resolve();
          else throw new Error(String(r.status));
        })
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Vite not ready at ${url}`));
          } else {
            setTimeout(tick, 250);
          }
        });
    };
    tick();
  });
}

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as Window & { __lt?: LongTask[] }).__lt = [];
    try {
      const obs = new PerformanceObserver((list) => {
        const bucket = (window as Window & { __lt?: LongTask[] }).__lt!;
        for (const e of list.getEntries()) {
          bucket.push({ name: e.name, duration: e.duration, start: e.startTime });
        }
      });
      obs.observe({ type: "longtask", buffered: true });
      (window as Window & { __ltObs?: PerformanceObserver }).__ltObs = obs;
    } catch {
      // unavailable
    }
  });
}

async function collectLongTasks(page: Page): Promise<Omit<ScenarioResult, "label" | "wallClockMs">> {
  return page.evaluate(() => {
    const longTasks = (window as Window & { __lt?: LongTask[] }).__lt ?? [];
    return {
      longTaskCount: longTasks.length,
      longTasksMs: longTasks.reduce((s, t) => s + t.duration, 0),
      worstLongTaskMs: longTasks.reduce((m, t) => Math.max(m, t.duration), 0),
      longTasks: longTasks.slice(0, 30),
    };
  });
}

async function measureGoto(
  browser: Browser,
  label: string,
  url: string,
  settleMs = 500,
): Promise<ScenarioResult> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await installLongTaskObserver(page);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(settleMs);
  const lt = await collectLongTasks(page);
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll("*").length,
    canvases: document.querySelectorAll("canvas").length,
    buttons: document.querySelectorAll("button").length,
    inputs: document.querySelectorAll("input").length,
    svgs: document.querySelectorAll("svg").length,
  }));
  await page.close();
  return { label, wallClockMs: Date.now() - t0, ...lt, dom };
}

async function measureInteraction(
  browser: Browser,
  label: string,
  setupUrl: string,
  interact: (page: Page) => Promise<void>,
): Promise<ScenarioResult> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(setupUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    (window as Window & { __lt?: LongTask[] }).__lt = [];
    try {
      const obs = new PerformanceObserver((list) => {
        const bucket = (window as Window & { __lt?: LongTask[] }).__lt!;
        for (const e of list.getEntries()) {
          bucket.push({ name: e.name, duration: e.duration, start: e.startTime });
        }
      });
      obs.observe({ type: "longtask" });
      (window as Window & { __ltObs?: PerformanceObserver }).__ltObs = obs;
    } catch {
      // ignore
    }
  });
  const t0 = Date.now();
  await interact(page);
  await page.waitForTimeout(250);
  const lt = await collectLongTasks(page);
  await page.close();
  return { label, wallClockMs: Date.now() - t0, ...lt };
}

async function main() {
  const vite = spawn(
    process.execPath,
    [viteBin, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none", VITE_CAPTURE: "1" },
    },
  );
  let viteLog = "";
  vite.stderr?.on("data", (c) => {
    viteLog += String(c);
  });
  vite.stdout?.on("data", (c) => {
    viteLog += String(c);
  });

  const results: Record<string, unknown> = {
    capturedAt: new Date().toISOString(),
    scenarios: [] as ScenarioResult[],
  };
  const scenarios = results.scenarios as ScenarioResult[];

  try {
    await waitForUrl(`${base}/production-capture.html`, 60_000);
    const browser = await chromium.launch({ headless: true });

    scenarios.push(
      await measureGoto(browser, "production-mix-12", `${base}/production-capture.html#confortable-12`),
    );
    scenarios.push(
      await measureGoto(browser, "production-mix-16", `${base}/production-capture.html#confortable-16`),
    );
    scenarios.push(
      await measureGoto(browser, "production-clips-16", `${base}/production-capture.html#view-clips-16`),
    );
    scenarios.push(
      await measureGoto(browser, "production-tools-12", `${base}/production-capture.html#view-tools-12`),
    );
    scenarios.push(
      await measureGoto(browser, "production-mix-collapsed", `${base}/production-capture.html#confortable-12-collapsed`),
    );
    scenarios.push(
      await measureGoto(browser, "production-mix-compact-12", `${base}/production-capture.html#compact-12`),
    );

    scenarios.push(
      await measureInteraction(
        browser,
        "production-click-clips-tab",
        `${base}/production-capture.html#confortable-12`,
        async (page) => {
          await page.getByRole("tab", { name: /Clips/i }).click();
          await page.waitForTimeout(400);
        },
      ),
    );

    scenarios.push(
      await measureInteraction(
        browser,
        "production-click-tools-tab",
        `${base}/production-capture.html#confortable-12`,
        async (page) => {
          await page.getByRole("tab", { name: /Outils/i }).click();
          await page.waitForTimeout(400);
        },
      ),
    );

    scenarios.push(
      await measureInteraction(
        browser,
        "production-toggle-rythmique",
        `${base}/production-capture.html#confortable-12`,
        async (page) => {
          await page.evaluate(() => {
            const btn = document.querySelector<HTMLButtonElement>(
              ".production-mix-group-toggle[aria-controls='production-group-rythmique']",
            );
            btn?.click();
            btn?.click();
          });
          await page.waitForTimeout(200);
        },
      ),
    );

    scenarios.push(
      await measureInteraction(
        browser,
        "production-mute-solo-burst",
        `${base}/production-capture.html#confortable-12`,
        async (page) => {
          await page.evaluate(() => {
            const muteButtons = [
              ...document.querySelectorAll<HTMLButtonElement>(
                "button[aria-pressed], button.production-mute, button.production-solo, .track-mute, .track-solo",
              ),
            ];
            const candidates =
              muteButtons.length > 0
                ? muteButtons
                : [...document.querySelectorAll<HTMLButtonElement>("button")].filter((b) =>
                    /^(M|S|Muet|Solo)$/i.test((b.textContent || "").trim()),
                  );
            for (let i = 0; i < Math.min(12, candidates.length); i++) {
              candidates[i]!.click();
            }
          });
          await page.waitForTimeout(150);
        },
      ),
    );

    scenarios.push(
      await measureGoto(browser, "create-workspace", `${base}/create-capture.html`, 400),
    );

    scenarios.push(
      await measureInteraction(
        browser,
        "create-fill-lyrics",
        `${base}/create-capture.html`,
        async (page) => {
          const areas = page.locator("textarea");
          const n = await areas.count();
          if (n >= 1) {
            await areas.nth(0).fill("indie dream pop, warm pads, soft drums, melancholic");
          }
          if (n >= 2) {
            await areas.nth(1).fill(`${"verse line\n".repeat(50)}${"chorus line\n".repeat(30)}`);
          }
          await page.waitForTimeout(150);
        },
      ),
    );

    // Score tab micro + open benches (existing harness)
    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await installLongTaskObserver(page);
      const t0 = Date.now();
      await page.goto(`${base}/score-tab-bench.html`, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      const hasApi = await page.evaluate(() => Boolean(window.__scoreTabBench));
      if (hasApi) {
        results.scoreMicro = await page.evaluate(async () =>
          window.__scoreTabBench!.runMicrobenches(),
        );
        results.scorePanelOpen = await page.evaluate(async () =>
          window.__scoreTabBench!.runScorePanelOpen(),
        );
        results.scorePanelOpenLong = await page.evaluate(async () =>
          window.__scoreTabBench!.runScorePanelOpenLong
            ? window.__scoreTabBench!.runScorePanelOpenLong()
            : null,
        );
      }
      const lt = await collectLongTasks(page);
      scenarios.push({
        label: "score-tab-bench-suite",
        wallClockMs: Date.now() - t0,
        ...lt,
      });
      await page.close();
    }

    // Piano-roll path via ScorePanel if expose exists — already covered by score micro
    await browser.close();
  } catch (err) {
    results.error = String(err);
    results.viteLogTail = viteLog.slice(-4000);
  } finally {
    vite.kill("SIGTERM");
  }

  // Rank slowest by longTasksMs then wallClock
  const ranked = [...scenarios].sort(
    (a, b) => b.longTasksMs - a.longTasksMs || b.wallClockMs - a.wallClockMs,
  );
  results.rankedByLongTasks = ranked.map((s) => ({
    label: s.label,
    longTasksMs: s.longTasksMs,
    worstLongTaskMs: s.worstLongTaskMs,
    wallClockMs: s.wallClockMs,
  }));

  mkdirSync(path.join(repoRoot, "bench"), { recursive: true });
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.error) process.exitCode = 1;
}

await main();
