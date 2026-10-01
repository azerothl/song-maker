#!/usr/bin/env node
/**
 * Mesure le blocage à l'ouverture de l'onglet Partition (ScorePanel + portée).
 *
 * Usage : pnpm bench:score-tab
 * Sortie JSON sur stdout + fichier bench/score-tab-last.json
 */
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(repoRoot, "bench");
const outFile = path.join(outDir, "score-tab-last.json");

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

async function main() {
  const port = 5199;
  const baseUrl = `http://127.0.0.1:${port}/score-tab-bench.html`;

  const vite = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "--port",
      String(port),
      "--strictPort",
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    },
  );

  let viteLog = "";
  vite.stderr?.on("data", (c) => {
    viteLog += String(c);
  });

  try {
    await waitForUrl(baseUrl, 45_000);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const micro = await page.evaluate(async () => {
      const api = window.__scoreTabBench;
      if (!api) throw new Error("bench API missing");
      return await api.runMicrobenches();
    });

    await page.evaluate(() => {
      const w = window as Window & { __benchLongTasks?: { duration: number }[] };
      w.__benchLongTasks = [];
    });

    await page.click("#bench-run-full");
    await page.waitForSelector(".abc-staff-paper svg", { timeout: 120_000 });
    await page.waitForSelector("#bench-result", { timeout: 120_000 });
    const full = await page.evaluate(() => {
      const el = document.getElementById("bench-result");
      return el ? JSON.parse(el.textContent ?? "{}") : null;
    });

    await page.evaluate(() => {
      const w = window as Window & { __benchLongTasks?: { duration: number }[] };
      w.__benchLongTasks = [];
    });
    await page.click("#bench-run-long");
    await page.waitForSelector("#bench-result-long", { timeout: 180_000 });
    const longOpen = await page.evaluate(() => {
      const el = document.getElementById("bench-result-long");
      return el ? JSON.parse(el.textContent ?? "{}") : null;
    });

    await page.evaluate(() => {
      const w = window as Window & { __benchLongTasks?: { duration: number }[] };
      w.__benchLongTasks = [];
    });
    const staffToPianoRef = await page.evaluate(async () => {
      const api = window.__scoreTabBench;
      if (!api) throw new Error("bench API missing");
      return await api.measureStaffToPianoSwitch(
        api.referenceDoc,
        "Bench reference",
      );
    });

    await page.evaluate(() => {
      const w = window as Window & { __benchLongTasks?: { duration: number }[] };
      w.__benchLongTasks = [];
    });
    const staffToPianoLong = await page.evaluate(async () => {
      const api = window.__scoreTabBench;
      if (!api) throw new Error("bench API missing");
      return await api.measureStaffToPianoSwitch(
        api.longReferenceDoc,
        "Bench long reference",
      );
    });

    await browser.close();

    const report = {
      capturedAt: new Date().toISOString(),
      microbenches: micro,
      scorePanelOpen: full,
      scorePanelOpenLong: longOpen,
      staffToPiano: staffToPianoRef,
      staffToPianoLong: staffToPianoLong,
    };

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    vite.kill("SIGTERM");
    if (viteLog && process.env.BENCH_DEBUG) {
      console.error(viteLog);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
