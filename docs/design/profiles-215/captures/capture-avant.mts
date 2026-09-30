/** Captures « avant » : fichiers profil/CSS de `main` (f83c10a), rechargement par scène. */
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../../../../src/dev/captureViteServer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = path.join(__dirname, "avant");
mkdirSync(OUT, { recursive: true });
const PORT = 5189;
const BASE = `http://127.0.0.1:${PORT}/profiles-app-capture.html`;

const cssPath = path.join(ROOT, "src/App.css");
const selectorPath = path.join(ROOT, "src/components/ProfileSelector.tsx");
const cssBackup = path.join(OUT, ".backup-App.css");
const selectorBackup = path.join(OUT, ".backup-ProfileSelector.tsx");

function backupProfileSources(): void {
  copyFileSync(cssPath, cssBackup);
  copyFileSync(selectorPath, selectorBackup);
  execSync(`git show origin/main:src/App.css > "${cssPath}"`, { cwd: ROOT });
  execSync(`git show origin/main:src/components/ProfileSelector.tsx > "${selectorPath}"`, {
    cwd: ROOT,
  });
}

function restoreProfileSources(): void {
  copyFileSync(cssBackup, cssPath);
  copyFileSync(selectorBackup, selectorPath);
}

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

async function capture(
  browser: import("playwright").Browser,
  setup: (page: import("playwright").Page) => Promise<void>,
  fileName: string,
): Promise<void> {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });
  await setup(page);
  await page.waitForTimeout(400);
  const typeErrors = await page.locator("text=TypeError").count();
  if (typeErrors > 0) throw new Error("bannière TypeError invoke visible");
  await page.screenshot({ path: path.join(OUT, fileName) });
  await page.close();
}

backupProfileSources();
const server = await startCaptureViteServer(PORT);
await waitServer(BASE);

try {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  await capture(
    browser,
    async (page) => {
      await page.goto(`${BASE}#selector-collapsed`, { waitUntil: "networkidle" });
      await page.click('[data-testid="profile-selector-trigger"]');
      await page.waitForSelector('[data-testid="profile-selector-menu"]');
    },
    "popover-replie-menu-ouvert-1280x720-avant.png",
  );

  await capture(
    browser,
    async (page) => {
      await page.goto(`${BASE}#selector-closed`, { waitUntil: "networkidle" });
      await page.waitForSelector("#sidebar:not(.is-collapsed)");
      await page.waitForSelector('[data-testid="profile-selector-menu"]', { state: "detached" });
    },
    "barre-depliee-fermee-1280x720-avant.png",
  );

  await capture(
    browser,
    async (page) => {
      await page.goto(`${BASE}#selector-closed`, { waitUntil: "networkidle" });
      await page.waitForSelector("#sidebar:not(.is-collapsed)");
      await page.click('[data-testid="profile-selector-trigger"]');
      await page.waitForSelector('[data-testid="profile-selector-menu"]');
    },
    "barre-depliee-menu-ouvert-1280x720-avant.png",
  );

  await browser.close();
} finally {
  await stopCaptureViteServer(server);
  restoreProfileSources();
}

const md5 = (f: string) =>
  execSync(`md5sum "${path.join(OUT, f)}"`, { encoding: "utf8" }).trim();
for (const f of [
  "popover-replie-menu-ouvert-1280x720-avant.png",
  "barre-depliee-fermee-1280x720-avant.png",
  "barre-depliee-menu-ouvert-1280x720-avant.png",
]) {
  console.log(md5(f));
}
