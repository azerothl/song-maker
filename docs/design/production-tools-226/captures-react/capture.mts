import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  startCaptureViteServer,
  stopCaptureViteServer,
  captureBaseUrl,
} from "../../../../src/dev/captureViteServer.ts";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dir;
const PORT = 5196;
const BASE = `${captureBaseUrl(PORT)}/production-capture.html`;

async function shaFile(p: string): Promise<string> {
  const buf = await import("node:fs/promises").then((fs) => fs.readFile(p));
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const tag = process.argv[2] === "avant" ? "avant" : "apres";
  const server = await startCaptureViteServer(PORT);
  const browser = await chromium.launch();
  const metrics: Record<string, unknown> = { tag, scenes: [] as unknown[] };
  try {
    for (const vp of [
      { w: 1280, h: 720, suffix: "1280x720" },
      { w: 640, h: 720, suffix: "640x720" },
    ]) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto(`${BASE}#12,auto,tools-open`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const name = `production-tools-${tag}-${vp.suffix}.png`;
      const outPath = path.join(OUT, name);
      await page.screenshot({ path: outPath });
      metrics.scenes.push({
        file: name,
        sha256: await shaFile(outPath),
        viewport: vp,
      });
      await page.close();
    }
  } finally {
    await browser.close();
    await stopCaptureViteServer(server);
  }
  const metricsPath = path.join(OUT, "metrics.json");
  writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "metrics.sha256"),
    `${createHash("sha256").update(JSON.stringify(metrics)).digest("hex")}\n`,
  );
  mkdirSync(OUT, { recursive: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
