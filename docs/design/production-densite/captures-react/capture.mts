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

type CaptureMetrics = Record<string, unknown>;

async function metrics(page: import("playwright").Page): Promise<CaptureMetrics | null> {
  return page.evaluate(() => window.__productionCaptureMetrics?.() ?? null);
}

async function shot(
  page: import("playwright").Page,
  filename: string,
): Promise<CaptureMetrics | null> {
  await page.waitForTimeout(500);
  const m = await metrics(page);
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false });
  console.log(JSON.stringify({ file: filename, ...m }, null, 0));
  return m;
}

const SCENARIOS: Array<{ hash: string; file: string; key: string }> = [
  { hash: "6,auto,expanded", file: "production-react-6pistes-auto-1280x720.png", key: "six_auto" },
  {
    hash: "6,confortable,expanded",
    file: "production-react-6pistes-confortable-1280x720.png",
    key: "six_confortable",
  },
  { hash: "6,compact,expanded", file: "production-react-6pistes-compact-1280x720.png", key: "six_compact" },
  { hash: "16,auto,expanded", file: "production-react-16pistes-auto-1280x720.png", key: "sixteen_auto" },
  {
    hash: "16,confortable,expanded",
    file: "production-react-16pistes-confortable-1280x720.png",
    key: "sixteen_confortable",
  },
  {
    hash: "16,compact,expanded",
    file: "production-react-16pistes-compact-1280x720.png",
    key: "sixteen_compact",
  },
  {
    hash: "12,compact,expanded",
    file: "production-react-compact-1280x720.png",
    key: "twelve_compact",
  },
  {
    hash: "12,confortable,expanded",
    file: "production-react-confortable-1280x720.png",
    key: "twelve_confortable",
  },
];

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const results: Record<string, CaptureMetrics | null> = {};

  for (const scenario of SCENARIOS) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`${BASE}#${scenario.hash}`);
    results[scenario.key] = await shot(page, scenario.file);
    await page.close();
  }

  await browser.close();

  writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2), "utf8");

  const sixteenCompact = results.sixteen_compact as {
    rowsFullyVisible?: number;
    msButtonPx?: { minWAllRows?: number; minHAllRows?: number };
  } | null;
  console.log(`SIXTEEN_COMPACT_FULLY_VISIBLE_ROWS=${sixteenCompact?.rowsFullyVisible ?? "?"}`);
  console.log(
    `SIXTEEN_COMPACT_MS_MIN=${sixteenCompact?.msButtonPx?.minWAllRows ?? "?"}x${sixteenCompact?.msButtonPx?.minHAllRows ?? "?"}`,
  );
} finally {
  vite.kill("SIGTERM");
}
