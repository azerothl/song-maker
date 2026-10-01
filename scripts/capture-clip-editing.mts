import {mkdir,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {chromium} from "playwright";
import {startCaptureViteServer,stopCaptureViteServer} from "../src/dev/captureViteServer";
const dir="docs/maintenance/clip-editing-2026-10-01/captures-react";
await mkdir(dir,{recursive:true});
const server=await startCaptureViteServer(5242),browser=await chromium.launch();
const records=[];
try{
 for(const locale of ["fr","en"] as const)for(const width of [1280,640]){
  const page=await browser.newPage({viewport:{width,height:720}});
  try{
   await page.addInitScript(locale=>localStorage.setItem("song-maker.locale",locale),locale);
   await page.goto("http://127.0.0.1:5242/production-capture.html#confortable-12",{waitUntil:"networkidle"});
   const buttons=page.locator(".clip-edit-toolbar button");
   for(const [index,tool] of ["select","split","fade"].entries()){
    await buttons.nth(index).click();
    await buttons.nth(index).focus();
    await page.locator(".clip-edit-toolbar").scrollIntoViewIfNeeded();
    const states=await buttons.evaluateAll(elements=>elements.map(el=>{
     const r=el.getBoundingClientRect();return {label:el.textContent,pressed:el.getAttribute("aria-pressed"),width:r.width,height:r.height,tabIndex:el.getAttribute("tabindex"),check:el.querySelector(".clip-edit-tool-check")?.textContent,decoration:getComputedStyle(el).textDecorationLine};
    }));
    if(states.filter(s=>s.pressed==="true").length!==1||states[index].check!=="✓"||!states[index].decoration.includes("underline")||states.some(s=>s.width<44||s.height<44))throw Error(JSON.stringify(states));
    if(locale==="en"&&index===1&&!states[index].label?.includes("Split"))throw Error("Split translation missing");
    const filename=`palette-${tool}-${locale}-${width}.png`,pixels=await page.screenshot({path:`${dir}/${filename}`});
    records.push({filename,locale,width,height:720,tool,states,sha256:createHash("sha256").update(pixels).digest("hex"),evidence:"React Chromium fixture; not native Tauri"});
   }
  }finally{await page.close();}
 }
 await writeFile(`${dir}/metrics.json`,JSON.stringify(records,null,2)+"\n");
}finally{await browser.close();await stopCaptureViteServer(server);}
