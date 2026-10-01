import assert from "node:assert/strict";
import {after,before,it} from "node:test";
import {chromium,type Browser} from "playwright";
import type {ViteDevServer} from "vite";
import {startCaptureViteServer,stopCaptureViteServer} from "./captureViteServer";
let server:ViteDevServer,browser:Browser;
before(async()=>{server=await startCaptureViteServer(5241);browser=await chromium.launch();});
after(async()=>{await browser?.close();if(server)await stopCaptureViteServer(server);});
it("opens export for imported audio without an AI generation, retaining empty and busy guards",async()=>{
 const page=await browser.newPage();
 try{
  await page.goto("http://127.0.0.1:5241/export-import-capture.html");
  const trigger=page.locator("[data-capture-export-trigger]");
  assert.equal(await trigger.isEnabled(),true);
  await trigger.click();
  await page.getByRole("dialog").waitFor();
  for(const variant of ["empty","no-source","zero-duration","busy"]){
   await page.goto(`http://127.0.0.1:5241/export-import-capture.html?variant=${variant}`);
   assert.equal(await trigger.isDisabled(),true,variant);
  }
  await page.goto("http://127.0.0.1:5241/export-import-capture.html?variant=generation");
  assert.equal(await trigger.isEnabled(),true);
 }finally{await page.close();}
});
