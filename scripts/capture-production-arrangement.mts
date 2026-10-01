import { mkdir,writeFile } from "node:fs/promises";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
import {startCaptureViteServer,stopCaptureViteServer} from "../src/dev/captureViteServer";
const dir="docs/maintenance/arrangement-2026-10-01/captures-react";
await mkdir(dir,{recursive:true});
const server=await startCaptureViteServer(5240),browser=await chromium.launch();
const records=[];
try{
 for(const locale of ["fr","en"] as const)for(const width of [1280,640]){
  const page=await browser.newPage({viewport:{width,height:720}});
  try{
   await page.addInitScript(locale=>localStorage.setItem("song-maker.locale",locale),locale);
   await page.goto("http://127.0.0.1:5240/arrangement-capture.html");
   const initial=await page.locator(".clip-ruler").getAttribute("aria-valuemax");
   const clipsBefore=await page.evaluate(()=>JSON.stringify((window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks));
   await page.locator(".clip-marker-flag").click();
   await page.locator(".clip-marker-editor input[type=checkbox]").uncheck();
   await page.getByLabel("Position (ms)",{exact:true}).fill("60000");
   await page.keyboard.press("Escape");
   await page.getByTestId("arrangement-status").scrollIntoViewIfNeeded();
   const filename=`marker-bounded-${locale}-${width}.png`;
   const pixels=await page.screenshot({path:`${dir}/${filename}`});
   const measured=await page.evaluate(()=>{
    const ruler=document.querySelector(".clip-ruler")!;
    const flag=document.querySelector(".clip-marker-flag")!;
    return {rulerMax:ruler.getAttribute("aria-valuemax"),markerName:flag.getAttribute("aria-label"),flag:flag.getBoundingClientRect().toJSON(),clips:JSON.stringify((window as unknown as {__arrangementMix:{tracks:unknown}}).__arrangementMix.tracks)};
   });
   if(initial!==measured.rulerMax||clipsBefore!==measured.clips)throw new Error("Arrangement capture changed clips or ruler duration");
   records.push({filename,locale,width,height:720,sha256:createHash("sha256").update(pixels).digest("hex"),rulerMax:measured.rulerMax,markerName:measured.markerName,markerRect:measured.flag,clipsUnchanged:true,status:await page.getByTestId("arrangement-status").innerText(),evidence:"React Chromium fixture; not native Tauri"});
  }finally{await page.close();}
 }
 await writeFile(`${dir}/metrics.json`,JSON.stringify(records,null,2)+"\n");
}finally{await browser.close();await stopCaptureViteServer(server);}
