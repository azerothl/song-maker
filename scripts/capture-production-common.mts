import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../src/dev/captureViteServer";
const server = await startCaptureViteServer(5228);
const browser = await chromium.launch();
const dir = "docs/design/production-common-page/captures";
await mkdir(dir, { recursive: true });
const metrics = [];
try {
  for (const width of [1280, 640]) {
    const page = await browser.newPage({ viewport: { width, height: 720 } });
    await page.goto("http://127.0.0.1:5228/production-capture.html#view-clips-16", { waitUntil: "networkidle" });
    await page.screenshot({ path: `${dir}/tracks-${width}.png` });
    await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${dir}/clips-${width}.png` });
    const trigger = page.getByTestId("production-mix-settings-trigger-clips");
    await trigger.click();
    await page.locator(".clip-lane .clip-block").first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    metrics.push(await page.evaluate(() => ({
      width: innerWidth,
      trackRows: document.querySelectorAll(".production-mix-row").length,
      clipRails: document.querySelectorAll(".common-track-lane").length,
      ruler: document.querySelector(".clip-ruler-marks-abs")?.getBoundingClientRect().toJSON(),
      rail: document.querySelector(".production-mix-row .clip-lane-rail")?.getBoundingClientRect().toJSON(),
      rulerLabels: Array.from(document.querySelectorAll(".clip-ruler-tick")).filter(el=>el.textContent?.trim()).map(el=>({
        text:el.textContent, rect:el.getBoundingClientRect().toJSON(),
      })),
      clips: Array.from(document.querySelectorAll(".clip-lane .clip-block")).slice(0,3).map(el => {
        const r=el.getBoundingClientRect();
        return {rect:r.toJSON(), hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.outerHTML.slice(0,180)};
      }),
    })));
    await page.screenshot({ path: `${dir}/settings-${width}.png` });
    await page.keyboard.press("Escape");
    await page.locator(".production-advanced-disclosure > summary").click();
    await page.screenshot({ path: `${dir}/advanced-${width}.png` });
    await page.close();
  }
  await writeFile(`${dir}/metrics.json`,JSON.stringify(metrics,null,2)+"\n");
  const files=(await readdir(dir)).filter(name=>name.endsWith(".png") || name==="metrics.json").sort();
  const hashes=await Promise.all(files.map(async name=>`${createHash("sha256").update(await readFile(`${dir}/${name}`)).digest("hex")}  ${name}`));
  await writeFile(`${dir}/sha256.txt`,hashes.join("\n")+"\n");
  console.log(JSON.stringify(metrics));
} finally { await browser.close(); await stopCaptureViteServer(server); }
