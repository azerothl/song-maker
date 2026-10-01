import assert from "node:assert/strict";
import {after,before,it} from "node:test";
import {chromium,type Browser} from "playwright";
import type {ViteDevServer} from "vite";
import {startCaptureViteServer,stopCaptureViteServer} from "./captureViteServer";
let server:ViteDevServer,browser:Browser;
before(async()=>{server=await startCaptureViteServer(5239);browser=await chromium.launch();});
after(async()=>{await browser?.close();if(server)await stopCaptureViteServer(server);});
it("marker position stays within the ruler duration instead of extending it",async()=>{
 const page=await browser.newPage();
 try {
  await page.addInitScript(()=>localStorage.setItem("song-maker.locale","en"));
  await page.goto("http://127.0.0.1:5239/arrangement-capture.html");
  const initial=Number(await page.locator(".clip-ruler").getAttribute("aria-valuemax"));
  const before=await page.evaluate(()=>(window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks);
  assert.equal(initial,30000);
  await page.locator(".clip-marker-flag").click();
  await page.getByRole("checkbox",{name:"Move clips with the marker (without changing the source)",exact:true}).uncheck();
  await page.getByLabel("Position (ms)",{exact:true}).fill("60000");
  const marker=await page.evaluate(()=>(window as unknown as {__arrangementMix:{markers:Array<{startMs:number}>}}).__arrangementMix.markers[0]);
  assert.ok(marker.startMs<=initial,`marker ${marker.startMs} exceeds initial ruler ${initial}`);
  assert.equal(Number(await page.locator(".clip-ruler").getAttribute("aria-valuemax")),initial);
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks),before);
  assert.match(await page.getByTestId("arrangement-status").innerText(),/My chorus.*0:30/);
 }finally{await page.close();}
});
it("tempo updates clamp BPM, avoid duplicates and preserve every clip",async()=>{
 const page=await browser.newPage();
 try {
  await page.addInitScript(()=>localStorage.setItem("song-maker.locale","en"));
  await page.goto("http://127.0.0.1:5239/arrangement-capture.html");
  const before=await page.evaluate(()=>(window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks);
  await page.locator(".clip-arrangement-bar > button").first().click();
  for(const[input,expected]of [["0",1],["401",400],["120.4",120]] as const){
   await page.getByLabel("BPM",{exact:true}).fill(input);
   await page.getByRole("button",{name:"Add / update",exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>(window as unknown as {__arrangementMix:{tempoMap:unknown}}).__arrangementMix.tempoMap),[{startMs:0,quarterBpm:expected}]);
   assert.match(await page.getByTestId("arrangement-status").innerText(),new RegExp(`Tempo ${expected} BPM`));
  }
  await page.getByLabel("At (ms)",{exact:true}).fill("8000");
  await page.getByLabel("BPM",{exact:true}).fill("150");
  await page.getByRole("button",{name:"Add / update",exact:true}).click();
  await page.getByRole("button",{name:"Add / update",exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {__arrangementMix:{tempoMap:unknown}}).__arrangementMix.tempoMap),[{startMs:0,quarterBpm:120},{startMs:8000,quarterBpm:150}]);
  await page.getByRole("button",{name:/Delete tempo 150 BPM/}).click();
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {__arrangementMix:{tempoMap:unknown}}).__arrangementMix.tempoMap),[{startMs:0,quarterBpm:120}]);
  assert.match(await page.getByTestId("arrangement-status").innerText(),/Tempo change deleted/);
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks),before);
 }finally{await page.close();}
});
it("marker keyboard boundaries, fine steps and deletion keep clips unchanged",async()=>{
 const page=await browser.newPage();
 try {
  await page.addInitScript(()=>localStorage.setItem("song-maker.locale","en"));
  await page.goto("http://127.0.0.1:5239/arrangement-capture.html");
  const before=await page.evaluate(()=>(window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks);
  const flag=page.locator(".clip-marker-flag");
  await flag.click();
  await page.getByRole("checkbox",{name:"Move clips with the marker (without changing the source)",exact:true}).uncheck();
  await page.keyboard.press("Escape");
  await flag.focus();
  for(const[key,time]of [["End",30000],["ArrowRight",30000],["Shift+ArrowLeft",29950],["Home",0],["Shift+ArrowRight",50]] as const){
   await page.keyboard.press(key);
   assert.equal(await page.evaluate(()=>(window as unknown as {__arrangementMix:{markers:Array<{startMs:number}>}}).__arrangementMix.markers[0].startMs),time);
   assert.equal(Number(await page.locator(".clip-ruler").getAttribute("aria-valuemax")),30000);
  }
  assert.match(await flag.getAttribute("aria-label")??"",/Marker: My chorus/);
  await page.keyboard.press("Delete");
  assert.equal(await flag.count(),0);
  assert.match(await page.getByTestId("arrangement-status").innerText(),/My chorus.*deleted/);
  assert.equal(await page.locator(".clip-arrangement-bar > button").nth(1).evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(await page.evaluate(()=>(window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks),before);
 }finally{await page.close();}
});
