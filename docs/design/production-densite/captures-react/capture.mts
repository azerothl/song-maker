import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5179;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;

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

type Metrics = {
  totalRows: number;
  visibleRows: number;
  fullyVisibleRows: number;
  rowHeightPx: number;
  density: string;
};

async function metrics(page: import("playwright").Page): Promise<Metrics | null> {
  return page.evaluate(() => window.__productionCaptureMetrics?.() ?? null);
}

async function shot(
  page: import("playwright").Page,
  filename: string,
): Promise<Metrics | null> {
  await page.waitForTimeout(400);
  const m = await metrics(page);
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false });
  console.log(JSON.stringify({ file: filename, ...m }, null, 0));
  return m;
}

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const results: Record<string, Metrics | null> = {};

  let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#expanded`);
  results.compact = await shot(page, "production-react-compact-1280x720.png");
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#confortable`);
  await page.waitForTimeout(200);
  results.confortable = await shot(page, "production-react-confortable-1280x720.png");
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  results.collapsed = await shot(page, "production-react-rythmique-replie-1280x720.png");
  await page.close();

  await browser.close();

  writeFileSync(
    path.join(OUT, "metrics.json"),
    JSON.stringify(results, null, 2),
    "utf8",
  );
  const compactN = results.compact?.fullyVisibleRows;
  console.log(`COMPACT_FULLY_VISIBLE_ROWS=${compactN ?? "?"}`);
} finally {
  vite.kill("SIGTERM");
}
