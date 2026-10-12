import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../src/dev/captureViteServer.ts";

const PORT = 5191;
const BASE = `http://127.0.0.1:${PORT}/primary-remaining-capture.html#midi-vst`;
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
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.locator(".studio-midi-instrument-settings > summary").click();
    const pluginTab = page.getByRole("tab", { name: "Plug-in" });
    await pluginTab.waitFor({ state: "visible" });
    await pluginTab.click();
    await page.locator(".midi-vst3-block").waitFor({ state: "visible" });
    const instrument = page.locator(".midi-vst3-block select").first();
    await instrument.waitFor({ state: "visible" });
    if (!(await instrument.inputValue()).includes("Odin2.vst3")) {
      throw new Error("The VST capture fixture is not assigned to the score voice.");
    }
    await page.locator(".piano-roll").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(OUT, "midi-vst-review.png"), fullPage: true });
    await page.close();
  } finally {
    await browser.close();
  }
} finally {
  await stopCaptureViteServer(server);
}
