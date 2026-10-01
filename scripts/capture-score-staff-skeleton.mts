#!/usr/bin/env node
/**
 * Captures #249 — squelette d’ouverture portée (1280 / 640, FR / EN).
 * Usage : pnpm exec tsx scripts/capture-score-staff-skeleton.mts
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(
  repoRoot,
  "docs/design/score-staff-skeleton/captures",
);
const PORT = 5211;

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
  mkdirSync(outDir, { recursive: true });
  const vite = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "--port",
      String(PORT),
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
    const base = `http://127.0.0.1:${PORT}/score-tab-bench.html?staffSkeleton=1`;
    await waitForUrl(base, 45_000);
    const browser = await chromium.launch({ headless: true });

    for (const locale of ["fr", "en"] as const) {
      for (const [label, viewport] of [
        ["1280x720", { width: 1280, height: 720 }],
        ["640x720", { width: 640, height: 720 }],
      ] as const) {
        const page = await browser.newPage({ viewport });
        await page.addInitScript((loc) => {
          localStorage.setItem("song-maker.locale", loc);
        }, locale);
        await page.goto(base, { waitUntil: "networkidle" });
        await page.click("#bench-run-long");
        await page.waitForSelector("[data-score-staff-skeleton]", {
          timeout: 15_000,
        });
        await page.waitForTimeout(400);
        const file = path.join(
          outDir,
          `skeleton-${locale}-${label}.png`,
        );
        await page.locator(".score-panel").screenshot({ path: file });
        await page.close();
        console.log("wrote", file);
      }
    }

    await browser.close();
  } finally {
    vite.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
