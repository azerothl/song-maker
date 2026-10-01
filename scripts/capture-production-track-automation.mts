import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../src/dev/captureViteServer";
const server=await startCaptureViteServer(5230);
const browser=await chromium.launch();
const dir="docs/design/production-track-automation/captures";
await mkdir(dir,{recursive:true});
try {
  for(const width of [1280,640]) {
    const page=await browser.newPage({viewport:{width,height:720}});
    await page.goto("http://127.0.0.1:5230/production-capture.html#confortable-12",{waitUntil:"networkidle"});
    await page.locator(".production-track-tools-btn").first().click();
    await page.getByRole("tab", { name: "Automation", exact: true }).click();
    await page.locator(".production-track-auto-toggle").click();
    await page.keyboard.press("Escape");
    const editor=page.locator(".production-track-automation").first();
    await editor.getByRole("button",{name:"Ajouter à la position de lecture",exact:true}).click();
    await editor.locator(".production-auto-points input").nth(1).fill("-6");
    await editor.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${dir}/volume-${width}.png`});
    await editor.locator("select").selectOption("pan");
    await editor.getByRole("button",{name:"Ajouter à la position de lecture",exact:true}).click();
    await editor.locator(".production-auto-points input").nth(1).fill("0.5");
    await page.screenshot({path:`${dir}/pan-${width}.png`});
    await page.close();
  }
  await writeFile(`${dir}/README.md`,"Captures Chromium sous Windows du composant React, données synthétiques. Test natif Tauri non effectué.\n");
} finally {await browser.close();await stopCaptureViteServer(server);}