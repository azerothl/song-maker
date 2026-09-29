import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5182;
const HASH = "16,auto,expanded,midplay";
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#${HASH}`;

async function waitServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`serveur Vite inaccessible : ${url}`);
}

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE);
  await page.waitForTimeout(900);

  const contrast = await page.evaluate(() => {
    const canvas = document.querySelector(".mix-master-wave .waveform-canvas");
    const style = canvas ? getComputedStyle(canvas) : null;
    const playedVarRaw = style?.getPropertyValue("--track-wave-played").trim() ?? "";
    const waveVarRaw = style?.getPropertyValue("--track-wave").trim() ?? "";
    const root = getComputedStyle(document.documentElement);
    let playedColorResolved: string | null = playedVarRaw || null;
    const varMatch = playedVarRaw.match(/^var\((--[^)]+)\)$/);
    if (varMatch) {
      playedColorResolved = root.getPropertyValue(varMatch[1]).trim() || playedVarRaw;
    }
    const m = window.__productionPlayheadContrast?.() ?? null;
    return {
      ...m,
      waveComputedVar: waveVarRaw || null,
      playedCssVar: playedVarRaw || null,
      playedColorResolved,
      playheadHaloComputed: "#1a1424",
    };
  });

  await page.screenshot({
    path: path.join(OUT, "production-transport-midplay-1280x720.png"),
  });
  console.log(JSON.stringify(contrast, null, 2));

  const metricsPath = path.join(OUT, "metrics.json");
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<string, unknown>;
  } catch {
    all = {};
  }
  all.playheadContrast1280x720 = contrast;
  writeFileSync(metricsPath, JSON.stringify(all, null, 2), "utf8");

  if (!contrast?.wcag1411Pass || (contrast.contrastRatioHaloOnPlayed ?? 0) < 3) {
    process.exitCode = 2;
  }

  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
