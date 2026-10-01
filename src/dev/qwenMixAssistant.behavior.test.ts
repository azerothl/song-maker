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
for (const locale of ["fr", "en"] as const) it(`missing Qwen model has a readable ${locale} state without changing the mix`,async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:830}});
 try {
  await page.route("**/dev/null/*.wav",route=>route.fulfill({status:200,contentType:"audio/wav",body:wav}));
  await page.addInitScript(locale=>{
   localStorage.setItem("song-maker.locale",locale);
   (window as unknown as {__captureQwenMix:()=>never}).__captureQwenMix=()=>{throw new Error("MODEL_MISSING private diagnostic");};
  },locale);
  await page.goto("http://127.0.0.1:5231/production-capture.html#confortable-12",{waitUntil:"networkidle"});
  const gain=page.locator(".track-gain-knob .mix-knob-value").first();
  const initial=await gain.innerText();
  await page.getByTestId("production-mix-settings-trigger").click();
  await page.getByRole("button",{name:locale==="fr"?"Assistant de mix":"Mix assistant",exact:true}).click();
  const panel=page.locator(".qwen-mix-assistant");
  await panel.getByRole("button",{name:locale==="fr"?"Proposer des réglages avec Qwen":"Propose settings with Qwen",exact:true}).click();
  await panel.getByText(locale==="fr"?"Le modèle Qwen 3.5 2B est absent. Installez qwen3.5:2b dans Ollama puis relancez.":"Qwen 3.5 2B is missing. Install qwen3.5:2b in Ollama and try again.",{exact:true}).waitFor();
  assert.equal(await gain.innerText(),initial);
  assert.doesNotMatch(await panel.innerText(),/MODEL_MISSING|private diagnostic|qwen\.mix\./);
 } finally {await page.close();}
});
it("Qwen settings require confirmation and can be undone; manual functions remain",async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:830}});
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
  // Reproduce the trigger height observed in the native seven-track project.
  await page.waitForTimeout(250);
  await page.getByRole("button",{name:"Mix assistant",exact:true}).evaluate(el => {
    Object.assign((el as HTMLElement).style,{position:"fixed",top:"665px",left:"420px"});
  });
  await page.getByRole("button",{name:"Mix assistant",exact:true}).click();
  assert.equal(await page.getByRole("menuitem").count(),0);
  const panel=page.locator(".qwen-mix-assistant");
  await panel.waitFor();
  const license=panel.locator(".qwen-mix-license");
  await license.locator("summary").click();
  assert.match(await license.locator("pre").innerText(),/Copyright 2026 Alibaba Cloud/);
  assert.match(await license.locator("pre").innerText(),/Apache License/);
  await license.locator("summary").click();
  await page.waitForTimeout(250);
  const initialVisibility=await page.locator(".mix-assist-popin").evaluate(el=>{
    const title=el.querySelector("h3")!.getBoundingClientRect();
    const action=el.querySelector(".qwen-mix-assistant button")!.getBoundingClientRect();
    const panel=el.getBoundingClientRect();
    return {titleTop:title.top,actionBottom:action.bottom,panelTop:panel.top,panelBottom:panel.bottom,vh:innerHeight};
  });
  assert.ok(initialVisibility.titleTop>=initialVisibility.panelTop && initialVisibility.actionBottom<=initialVisibility.panelBottom && initialVisibility.panelBottom<=initialVisibility.vh,JSON.stringify(initialVisibility));
  await panel.getByRole("button",{name:"Propose settings with Qwen",exact:true}).click();
  await panel.getByRole("button",{name:"Review and apply",exact:true}).waitFor();
  assert.match(await panel.innerText(),/Complete analysis, including track decoding: [\d.,]+ s\./);
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
it("invalid local answers leave gains unchanged and disclose only a closed diagnostic code",async()=>{
 const page=await browser.newPage({viewport:{width:1280,height:830}});
 try {
  await page.route("**/dev/null/*.wav",route=>route.fulfill({status:200,contentType:"audio/wav",body:wav}));
  await page.addInitScript(()=>{
    localStorage.setItem("song-maker.locale","en");
    (window as unknown as {__captureQwenMix:()=>never}).__captureQwenMix=()=>{
      throw new Error("INVALID_RESPONSE:GAIN_DELTA private model text");
    };
  });
  await page.goto("http://127.0.0.1:5231/production-capture.html#confortable-12",{waitUntil:"networkidle"});
  const gain=page.locator(".track-gain-knob .mix-knob-value").first();
  const before=await gain.innerText();
  await page.getByTestId("production-mix-settings-trigger").click();
  await page.getByRole("button",{name:"Mix assistant",exact:true}).click();
  const panel=page.locator(".qwen-mix-assistant");
  await panel.getByRole("button",{name:"Propose settings with Qwen",exact:true}).click();
  await panel.getByText("The model returned invalid settings. No settings were applied.",{exact:true}).waitFor();
  assert.equal(await gain.innerText(),before);
  assert.equal(await panel.getByRole("button",{name:"Review and apply",exact:true}).count(),0);
  const detail=panel.locator("details").filter({has:page.locator("code")});
  assert.equal(await detail.getAttribute("open"),null);
  assert.equal(await detail.locator("code").textContent(),"INVALID_RESPONSE:GAIN_DELTA");
  assert.equal((await panel.innerText()).includes("private model text"),false);
 } finally {await page.close();}
});
