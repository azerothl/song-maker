#!/usr/bin/env node
/**
 * Captures #234 — indicateur rebake mix (FR/EN, 1280×720 et 640).
 *
 * Usage: pnpm capture:mix-bake-indicator
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs/design/production/captures-react/mix-bake-234");
const PORT = 5185;
const HASH = "12,auto,expanded,mixbake-indicator";
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#${HASH}`;

async function waitServer(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
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

const vite = spawn(
  "pnpm",
  ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
  {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, VITE_CAPTURE: "1" },
  },
);

try {
  await waitServer(BASE);
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const [locale, suffix] of [
    ["fr", "fr"],
    ["en", "en"],
  ] as const) {
    for (const [w, h, tag] of [
      [1280, 720, "1280x720"],
      [640, 720, "640"],
    ] as const) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.addInitScript((loc) => {
        localStorage.setItem("song-maker.locale", loc);
      }, locale);
      await page.goto(BASE);
      await page
        .locator(".production-mix-bake-chrome .player-mix-bake-status")
        .waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(outDir, `mix-bake-indicator-${suffix}-${tag}.png`),
      });
      await page.close();
    }
  }
  await browser.close();
  console.log(`Captures écrites dans ${outDir}`);
} finally {
  vite.kill("SIGTERM");
}
