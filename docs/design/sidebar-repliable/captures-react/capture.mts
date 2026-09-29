import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5180;
const BASE = `http://127.0.0.1:${PORT}/sidebar-capture.html`;

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

type Metrics = Record<string, unknown>;

async function metrics(page: import("playwright").Page): Promise<Metrics | null> {
  return page.evaluate(() => window.__sidebarCaptureMetrics?.() ?? null);
}

async function waitTooltipVisible(page: import("playwright").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const tips = document.querySelectorAll(".sidebar.is-collapsed .sidebar-tip");
      return Array.from(tips).some((tip) => {
        const style = getComputedStyle(tip);
        const opacity = parseFloat(style.opacity);
        const rect = tip.getBoundingClientRect();
        return opacity >= 0.95 && rect.width > 4 && rect.height > 4;
      });
    },
    { timeout: 5000 },
  );
}

async function shot(
  page: import("playwright").Page,
  filename: string,
): Promise<Metrics | null> {
  await page.waitForTimeout(150);
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
  await page.waitForSelector("#sidebar", { timeout: 30_000 });
  results.deplie_1280 = await shot(page, "sidebar-react-deplie-1280x720.png");
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  results.replie_1280 = await shot(page, "sidebar-react-replie-1280x720.png");
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  const libraryBtn = page.locator("#sidebar-nav button").first();
  await libraryBtn.hover();
  await waitTooltipVisible(page);
  results.tooltip_1280 = await shot(page, "sidebar-react-replie-tooltip-1280x720.png");
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  await page.locator("#sidebar-nav button").first().hover();
  await waitTooltipVisible(page);
  results.tooltip_escape_before = await shot(
    page,
    "sidebar-react-replie-tooltip-avant-echap-1280x720.png",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => {
      const row = document.querySelector("#sidebar-nav .sidebar-row");
      return row?.classList.contains("tip-off") === true;
    },
    { timeout: 3000 },
  );
  await page.waitForTimeout(150);
  results.tooltip_escape_after = await shot(
    page,
    "sidebar-react-replie-tooltip-apres-echap-1280x720.png",
  );
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#expanded`);
  await page.waitForSelector("#sidebar", { timeout: 30_000 });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, "sidebar-react-focus-toggle-1280x720.png"),
    fullPage: false,
    clip: { x: 0, y: 0, width: 320, height: 220 },
  });
  results.focus_toggle = await metrics(page);
  await page.close();

  page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  await page.goto(`${BASE}#auto`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  results.auto_1024 = await shot(page, "sidebar-react-auto-1024x700.png");
  await page.close();

  await browser.close();

  writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2), "utf8");
} finally {
  vite.kill("SIGTERM");
}
