import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../src/dev/captureViteServer.ts";

const PORT = 5192;
const BASE = `http://127.0.0.1:${PORT}/player-dock-capture.html`;
const OUT = "E:/song-maker-test-artifacts/ui-review-final-20261012";
mkdirSync(OUT, { recursive: true });

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Capture server is unavailable: ${url}`);
}

const server = await startCaptureViteServer(PORT);
try {
  await waitServer(BASE);
  const browser = await chromium.launch({
    channel: "msedge",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    const rows = page.locator(".user-library-track");
    await rows.first().waitFor({ state: "visible" });
    if (await rows.count() !== 3) {
      throw new Error(`Expected 3 library titles, got ${await rows.count()}.`);
    }
    await page.evaluate(() => window.__captureReleaseGenerationWaveform?.());
    await page.locator(".library-track-waveform .waveform-canvas[data-peak-count]").nth(2).waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(OUT, "library-wave-colors-review.png"),
      fullPage: true,
    });
    await page.close();
  } finally {
    await browser.close();
  }
} finally {
  await stopCaptureViteServer(server);
}
