import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { startCaptureViteServer, stopCaptureViteServer } from "../src/dev/captureViteServer";
const server=await startCaptureViteServer(5232),browser=await chromium.launch();
const dir="docs/design/qwen-mix-assistant/captures";await mkdir(dir,{recursive:true});
try {for(const width of [1280,640]){
 const page=await browser.newPage({viewport:{width,height:720}});
 await page.goto("http://127.0.0.1:5232/production-capture.html#confortable-12",{waitUntil:"networkidle"});
 await page.getByTestId("production-mix-settings-trigger").click();
 await page.getByRole("button",{name:"Assistant de mix",exact:true}).click();
 await page.locator(".qwen-mix-assistant").waitFor();
 await page.waitForTimeout(250);
 await page.screenshot({path:`${dir}/assistant-${width}.png`});await page.close();
}}finally{await browser.close();await stopCaptureViteServer(server);}
