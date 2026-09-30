import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../../../../src/dev/captureViteServer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = path.join(__dirname, "apres");
mkdirSync(OUT, { recursive: true });
const PORT = 5188;
const BASE = `http://127.0.0.1:${PORT}/profiles-app-capture.html`;

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`serveur inaccessible : ${url}`);
}

const SCENES = [
  { hash: "selector-collapsed-open", name: "popover-replie-menu-ouvert-1280x720" },
  { hash: "selector-closed", name: "barre-depliee-fermee-1280x720" },
  { hash: "selector-open", name: "barre-depliee-menu-ouvert-1280x720" },
  {
    hash: "many-profiles-collapsed-menu-open",
    name: "six-profils-popover-replie-1280x720",
  },
];

async function assertNoInvokeError(page: import("playwright").Page): Promise<void> {
  const banner = await page.locator("text=TypeError").count();
  if (banner > 0) {
    throw new Error("bannière TypeError invoke visible");
  }
}

async function captureScene(
  browser: import("playwright").Browser,
  hash: string,
  filePath: string,
): Promise<void> {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${BASE}#${hash}`, { waitUntil: "networkidle" });
  if (hash.includes("menu-open") || hash.includes("collapsed-open") || hash === "selector-open") {
    await page.waitForSelector('[data-testid="profile-selector-menu"]', {
      timeout: 15_000,
    });
  } else {
    await page.waitForSelector("#sidebar:not(.is-collapsed)", { timeout: 15_000 });
    await page.waitForSelector('[data-testid="profile-selector-menu"]', {
      state: "detached",
      timeout: 5_000,
    });
  }
  await page.waitForTimeout(400);
  await assertNoInvokeError(page);
  await page.screenshot({ path: filePath, fullPage: false });
  await page.close();
}

async function measurePopoverWidths(page: import("playwright").Page): Promise<unknown> {
  const widths = [1280, 1024, 640];
  const out: Record<string, unknown> = {};
  for (const width of widths) {
    await page.setViewportSize({ width, height: 720 });
    await page.goto(`${BASE}#selector-collapsed-open`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="profile-selector-menu"]');
    await page.waitForTimeout(250);
    out[String(width)] = await page.evaluate(() => window.__profileIssue215PopoverMetrics?.());
  }
  return out;
}

async function measureExpandedMenu(page: import("playwright").Page): Promise<unknown> {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${BASE}#selector-open`, { waitUntil: "networkidle" });
  await page.waitForSelector("#sidebar:not(.is-collapsed)", { timeout: 15_000 });
  await page.waitForSelector('[data-testid="profile-selector-menu"]');
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__profileIssue215ExpandedMenu?.());
}

async function measureSixProfilesViewport(page: import("playwright").Page): Promise<unknown> {
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto(`${BASE}#many-profiles-collapsed-menu-open`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="profile-selector-menu"]');
  return page.evaluate(() => window.__profileIssue215MenuSixViewport?.());
}

const server = await startCaptureViteServer(PORT);
await waitServer(BASE);

try {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  for (const scene of SCENES) {
    await captureScene(browser, scene.hash, path.join(OUT, `${scene.name}.png`));
  }

  const popoverPage = await browser.newPage();
  await popoverPage.addInitScript(() => {
    localStorage.setItem("song-maker.sidebar.collapsed", "1");
  });
  const popover = await measurePopoverWidths(popoverPage);
  await popoverPage.close();

  const expandedPage = await browser.newPage();
  await expandedPage.addInitScript(() => {
    localStorage.setItem("song-maker.sidebar.collapsed", "0");
  });
  const expandedMenu = await measureExpandedMenu(expandedPage);
  await expandedPage.close();

  const sixPage = await browser.newPage();
  await sixPage.addInitScript(() => {
    localStorage.setItem("song-maker.sidebar.collapsed", "1");
  });
  const sixProfilesViewport = await measureSixProfilesViewport(sixPage);
  await sixPage.close();
  await browser.close();

  const metricsBody = { popover, expandedMenu, sixProfilesViewport };
  const metricsPath = path.join(OUT, "metrics.json");
  writeFileSync(metricsPath, JSON.stringify(metricsBody, null, 2));
  const sha256 = createHash("sha256").update(readFileSync(metricsPath)).digest("hex");
  writeFileSync(
    path.join(OUT, "metrics.sha256"),
    `${sha256}  metrics.json\n`,
  );
} finally {
  await stopCaptureViteServer(server);
}
