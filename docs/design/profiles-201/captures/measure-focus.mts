import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const PORT = 5182;
const BASE = `http://127.0.0.1:${PORT}/profiles-capture.html#selector-closed`;

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error("server down");
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
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="profile-selector-trigger"]', { timeout: 15_000 });
  const trigger = page.locator('[data-testid="profile-selector-trigger"]');
  await trigger.focus();
  const outline = await trigger.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outlineWidth: s.outlineWidth,
      outlineStyle: s.outlineStyle,
      outlineColor: s.outlineColor,
      outlineOffset: s.outlineOffset,
    };
  });
  console.log(JSON.stringify(outline, null, 2));
  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
