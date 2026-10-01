import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#confortable-12`;

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

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const vite = spawn(
  "pnpm",
  ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
  {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env, VITE_CAPTURE: "1" },
  },
);

const shots: { name: string; file: string; viewport: { width: number; height: number } }[] =
  [];

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  for (const viewport of [
    { width: 1280, height: 720, tag: "1280x720" },
    { width: 640, height: 720, tag: "640x720" },
  ] as const) {
    const page = await browser.newPage({ viewport });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="production-mix-settings-trigger"]');

    const closed = `mix-settings-closed-${viewport.tag}.png`;
    await page.screenshot({ path: path.join(OUT, closed) });
    shots.push({ name: closed, file: closed, viewport });

    await page.click('[data-testid="production-mix-settings-trigger"]');
    await page.waitForSelector('[data-testid="production-mix-settings-popin"]');
    const open = `mix-settings-open-${viewport.tag}.png`;
    await page.screenshot({ path: path.join(OUT, open) });
    shots.push({ name: open, file: open, viewport });

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () =>
        document.activeElement?.getAttribute("data-testid") ===
        "production-mix-settings-trigger",
    );
    const esc = `mix-settings-esc-focus-${viewport.tag}.png`;
    await page.screenshot({ path: path.join(OUT, esc) });
    shots.push({ name: esc, file: esc, viewport });

    await page.click('[data-testid="production-mix-settings-trigger"]');
    await page.waitForSelector('[data-testid="production-mix-settings-separate"]');
    await page.click('[data-testid="production-mix-settings-separate"]');
    await page.waitForSelector(".separation-recommend-popin", {
      state: "visible",
      timeout: 15_000,
    });
    const sep = `mix-settings-sep-open-${viewport.tag}.png`;
    await page.screenshot({ path: path.join(OUT, sep) });
    shots.push({ name: sep, file: sep, viewport });
  }
  await browser.close();
} finally {
  vite.kill("SIGTERM");
}

const metrics = {
  method: "production-capture.html #confortable-12, Playwright",
  shots: shots.map((s) => ({
    ...s,
    sha256: sha256File(path.join(OUT, s.file)),
  })),
  metricsSha256: "",
};
metrics.metricsSha256 = createHash("sha256")
  .update(JSON.stringify(metrics.shots))
  .digest("hex");

writeFileSync(path.join(OUT, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
console.log("metrics.json", metrics.metricsSha256);
