/**
 * Lance le harness Vite (mock Tauri) et capture l’onglet Versions à 1280×720.
 * Usage : node capture-screenshots.mjs
 */
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const outDir = here;

async function waitForPort(port, host = "127.0.0.1", ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      await new Promise((resolve, reject) => {
        const sock = createConnection({ port, host }, () => {
          sock.end();
          resolve(undefined);
        });
        sock.on("error", reject);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`Port ${port} indisponible après ${ms}ms`);
}

function startVite() {
  const child = spawn(
    "pnpm",
    ["exec", "vite", "--config", path.join(here, "vite.config.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
    },
  );
  child.stdout?.on("data", (d) => process.stdout.write(d));
  child.stderr?.on("data", (d) => process.stderr.write(d));
  return child;
}

async function main() {
  const vite = startVite();
  try {
    await waitForPort(1420);
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.goto("http://127.0.0.1:1420/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#song-tab-versions", { timeout: 30_000 });
    await page.locator("#song-tab-versions").click();
    await page.waitForSelector(".version-history-panel", { timeout: 15_000 });
    const errorDismiss = page.locator(".banner.error button");
    if (await errorDismiss.count()) {
      await errorDismiss.first().click();
    }
    await page.waitForTimeout(400);

    await page.screenshot({
      path: path.join(outDir, "versions-react-default-1280x720.png"),
    });

    await page.getByRole("heading", { name: "Hier" }).scrollIntoViewIfNeeded();
    const separation = page
      .locator(".version-between-global")
      .filter({ hasText: "Pistes séparées" })
      .filter({ hasNotText: "à nouveau" });
    await separation.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(outDir, "versions-react-defilement-hier-1280x720.png"),
    });

    await page.evaluate(() => window.scrollTo(0, 0));
    const take11 = page.locator("h3", { hasText: "Prise 11" }).first();
    await take11.scrollIntoViewIfNeeded();
    const detailsBtn = page
      .locator(".version-take-card")
      .filter({ has: take11 })
      .getByRole("button", { name: "Détails" });
    await detailsBtn.click();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(outDir, "versions-react-details-ouvert-1280x720.png"),
    });

    await detailsBtn.click();
    const take10 = page.locator("h3", { hasText: "Essai plus lumineux" });
    await take10.scrollIntoViewIfNeeded();
    const renameBtn = page
      .locator(".version-take-card")
      .filter({ has: take10 })
      .getByRole("button", { name: /Renommer/ });
    await renameBtn.click();
    await page.waitForTimeout(250);
    await page.screenshot({
      path: path.join(outDir, "versions-react-renommer-1280x720.png"),
    });

    await browser.close();
    console.log("Captures enregistrées dans", outDir);
  } finally {
    vite.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
