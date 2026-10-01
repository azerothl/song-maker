#!/usr/bin/env node
/**
 * Bench lecture waveforms Production (#232) — legacy React vs bus RAF optimisé.
 *
 * Usage : pnpm bench:waveform-playback
 * Écrit bench/waveform-playback-last.json (+ copie before/after si absentes).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(repoRoot, "bench");
const outFile = path.join(outDir, "waveform-playback-last.json");
const beforeFile = path.join(outDir, "waveform-playback-before.json");
const afterFile = path.join(outDir, "waveform-playback-after.json");

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
  const port = 5202;
  const baseUrl = `http://127.0.0.1:${port}/waveform-playback-bench.html`;

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

  try {
    await waitForUrl(baseUrl, 45_000);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const payload = await page.evaluate(async () => {
      const api = window.__waveformPlaybackBench;
      if (!api) throw new Error("bench API missing");
      return await api.run();
    });

    const report = {
      command: "pnpm bench:waveform-playback",
      viewport: "1280×720",
      chromium: "playwright headless",
      ...payload,
    };

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

    const legacyOnly = {
      ...report,
      scenarios: report.scenarios.filter(
        (s: { mode: string }) => s.mode === "legacy-react",
      ),
    };
    const optimizedOnly = {
      ...report,
      scenarios: report.scenarios.filter(
        (s: { mode: string }) => s.mode === "optimized-bus",
      ),
    };

    if (!existsSync(beforeFile)) {
      writeFileSync(beforeFile, `${JSON.stringify(legacyOnly, null, 2)}\n`);
    }
    writeFileSync(afterFile, `${JSON.stringify(optimizedOnly, null, 2)}\n`);

    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  } finally {
    vite.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
