import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../src/dev/captureViteServer";
const server = await startCaptureViteServer(5234);
const browser = await chromium.launch();
const dir = "docs/design/production-editing/captures";
await mkdir(dir, { recursive: true });
const metrics = [];
try {
  for (const width of [1280, 640]) {
    const page = await browser.newPage({ viewport: { width, height: 720 } });
    await page.goto("http://127.0.0.1:5234/production-capture.html#confortable-12", {waitUntil:"networkidle"});
    await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
    const images = [];
    for (const mode of ["editing", "tempo", "markers"]) {
      if (mode !== "editing") {
        await page.locator(".clip-arrangement-bar > button").nth(mode === "tempo" ? 0 : 1).click();
        await page.waitForTimeout(250);
      }
      const path = `${dir}/${mode}-${width}.png`;
      const buffer = await page.screenshot({path});
      images.push({path,sha256:createHash("sha256").update(buffer).digest("hex")});
      if (mode !== "editing") await page.keyboard.press("Escape");
    }
    metrics.push({width,images,geometry:await page.locator(".clip-edit-toolbar button, .clip-ruler, .clip-tempo-flag").evaluateAll(elements => elements.map(el => ({role:el.getAttribute("role"),text:el.textContent,rect:el.getBoundingClientRect().toJSON()})))});
    await page.close();
  }
  await writeFile(`${dir}/metrics.json`,JSON.stringify(metrics,null,2)+"\n");
} finally { await browser.close(); await stopCaptureViteServer(server); }
