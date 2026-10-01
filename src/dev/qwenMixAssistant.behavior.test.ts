import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";
let server:ViteDevServer, browser:Browser;
const wav=Buffer.alloc(44+960);
wav.write("RIFF",0);wav.writeUInt32LE(wav.length-8,4);wav.write("WAVEfmt ",8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write("data",36);wav.writeUInt32LE(960,40);
for(let i=0;i<480;i++)wav.writeInt16LE(Math.round(Math.sin(i/10)*1000),44+i*2);
before(async()=>{server=await startCaptureViteServer(5231);browser=await chromium.launch();});
after(async()=>{await browser?.close();if(server)await stopCaptureViteServer(server);});
it("Qwen settings require confirmation and can be undone; manual functions remain",async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 try {
  await page.route("**/dev/null/*.wav",route=>route.fulfill({status:200,contentType:"audio/wav",body:wav}));
  await page.addInitScript(()=>{
    localStorage.setItem("song-maker.locale","en");
    (window as unknown as {__captureQwenMix:(args:unknown)=>unknown}).__captureQwenMix=(args:unknown)=>{
      const req=(args as {req:{tracks:Array<{id:string;gainDb:number}>}}).req;
      return {model:"fixture",elapsedMs:100,explanation:"Measured level adjustment.",adjustments:[{trackId:req.tracks[0].id,gainDb:req.tracks[0].gainDb-2,pan:0.2}]};
    };
  });
  await page.goto("http://127.0.0.1:5231/production-capture.html#confortable-12",{waitUntil:"networkidle"});
  const gain=page.locator(".track-gain-knob .mix-knob-value").first();
  const before=await gain.innerText();
  await page.getByTestId("production-mix-settings-trigger").click();
  await page.getByRole("button",{name:"Mix assistant",exact:true}).click();
  assert.equal(await page.getByRole("menuitem").count(),0);
  const panel=page.locator(".qwen-mix-assistant");
  await panel.getByRole("button",{name:"Propose settings with Qwen",exact:true}).click();
  await panel.getByRole("button",{name:"Review and apply",exact:true}).waitFor();
  assert.equal(await gain.innerText(),before);
  await panel.getByRole("button",{name:"Review and apply",exact:true}).click();
  assert.equal(await gain.innerText(),before);
  await panel.getByRole("button",{name:"Confirm settings",exact:true}).click();
  assert.notEqual(await gain.innerText(),before);
  await panel.getByRole("button",{name:"Undo Qwen settings",exact:true}).click();
  assert.equal(await gain.innerText(),before);
  await page.locator(".mix-assistant-manual > summary").click();
  assert.equal(await page.locator(".production-copilot").isVisible(),true);
 } finally {await page.close();}
});