/** Shared Production page: replaces the former subtab geometry contract. */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

const PORT = 5194;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#confortable-12`;
let server: ViteDevServer;
let browser: Browser;
before(async () => {
  server = await startCaptureViteServer(PORT);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

describe("Production commune (#223, #230)", () => {
  it("export popin stays above the sticky ruler, tempo and marker zones", async () => {
    for (const width of [1280,640]) {
      const page=await browser.newPage({viewport:{width,height:720}});
      try {
        await page.goto(BASE,{waitUntil:"networkidle"});
        await page.locator(".production-mix-toolbar [data-capture-export-trigger]").click();
        const panel=page.getByRole("dialog");
        await panel.waitFor();
        const intersections=await page.evaluate(()=>{
          const dialog=document.querySelector('[role="dialog"]')!;
          const d=dialog.getBoundingClientRect();
          return Array.from(document.querySelectorAll(".clip-ruler,.clip-tempo-lane,.clip-marker-lane")).flatMap(row=>{
            const r=row.getBoundingClientRect(),left=Math.max(d.left,r.left),right=Math.min(d.right,r.right),top=Math.max(d.top,r.top),bottom=Math.min(d.bottom,r.bottom);
            if(right<=left||bottom<=top)return [];
            const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
            return [{row:row.className,dialogOnTop:Boolean(hit&&dialog.contains(hit))}];
          });
        });
        assert.ok(intersections.length>0,`no overlapping zones at ${width}`);
        for(const overlap of intersections)assert.equal(overlap.dialogOnTop,true,`${width}: ${overlap.row}`);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator(".production-mix-sticky-master").evaluate(el=>getComputedStyle(el).zIndex),"6");
      }finally{await page.close();}
    }
  });
  it("the master stays above intersecting timeline zones during outer scroll", async () => {
    for (const width of [1280,640]) {
      const page=await browser.newPage({viewport:{width,height:720}});
      try {
        await page.goto(BASE,{waitUntil:"networkidle"});
        const overlaps=await page.evaluate(()=>{
          const outer=document.querySelector(".production-workspace-common")!;
          const master=document.querySelector(".production-mix-sticky-master")!;
          const rows=Array.from(document.querySelectorAll(".clip-ruler,.clip-tempo-lane,.clip-marker-lane"));
          const results:{row:string; masterOnTop:boolean}[]=[];
          for(let offset=0;offset<=outer.scrollHeight-outer.clientHeight;offset+=20){
            outer.scrollTop=offset;
            const m=master.getBoundingClientRect();
            for(const row of rows){
              const r=row.getBoundingClientRect();
              const left=Math.max(m.left,r.left),right=Math.min(m.right,r.right),top=Math.max(m.top,r.top),bottom=Math.min(m.bottom,r.bottom);
              if(right<=left||bottom<=top)continue;
              const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
              results.push({row:row.className,masterOnTop:Boolean(hit&&master.contains(hit))});
            }
          }
          return results;
        });
        assert.ok(overlaps.length>0,`no master/ruler overlap at ${width}`);
        for(const overlap of overlaps)assert.equal(overlap.masterOnTop,true,`${width}: ${overlap.row}`);
      } finally {await page.close();}
    }
  });
  it("PageDown scrolls from a toolbar button and Tab leaves the timeline", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
      const top = page.locator(".production-workspace-common");
      await top.evaluate(el => { el.scrollTop = 0; });
      await page.locator(".clip-edit-toolbar button").first().focus();
      await page.keyboard.press("PageDown");
      assert.ok(await top.evaluate(el => el.scrollTop) > 0);
      let reachedAdvanced = false;
      for (let i = 0; i < 220; i++) {
        await page.keyboard.press("Tab");
        reachedAdvanced = await page.locator(".production-advanced-disclosure > summary").evaluate(el => el === document.activeElement);
        if (reachedAdvanced) break;
      }
      assert.equal(reachedAdvanced, true);
    } finally { await page.close(); }
  });
  it("tempo and marker panels close with Escape and return focus", async () => {
    const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
      const tempo = page.locator(".clip-tempo-add");
      await tempo.click();
      await page.locator(".clip-tempo-editor input").first().waitFor();
      assert.equal(await page.locator(".clip-tempo-editor input").first().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      assert.equal(await tempo.evaluate(el => el === document.activeElement), true);
      const markers = page.locator(".clip-marker-add");
      await markers.click();
      await page.locator(".clip-marker-editor select").waitFor();
      await page.locator(".clip-marker-editor input[type=checkbox]").uncheck();
      const clipsBefore = await page.locator(".clip-block").evaluateAll(elements => elements.map(el => el.getAttribute("style")));
      await page.locator(".clip-marker-editor > button").first().click();
      await page.keyboard.press("Escape");
      assert.equal(await markers.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator(".clip-tempo-lane .clip-tempo-flag").count() > 0, true);
      const flag = page.locator(".clip-marker-flag").first();
      const oldPosition = await flag.getAttribute("style");
      await flag.focus();
      await page.keyboard.press("ArrowRight");
      assert.notEqual(await flag.getAttribute("style"), oldPosition);
      assert.deepEqual(await page.locator(".clip-block").evaluateAll(elements => elements.map(el => el.getAttribute("style"))), clipsBefore);
      await page.keyboard.press("Enter");
      assert.ok(Number(await page.locator(".clip-ruler").getAttribute("aria-valuenow")) > 0);
    } finally { await page.close(); }
  });
  it("editing tools switch by keyboard and Split selects the created clip", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.addInitScript(()=>localStorage.setItem("song-maker.locale","en"));
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
      const toolbar = page.locator(".clip-edit-toolbar");
      const buttons = toolbar.locator("button");
      await buttons.first().focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await buttons.nth(1).getAttribute("aria-pressed"), "true");
      assert.equal(await buttons.nth(1).locator("span").last().innerText(),"Split");
      assert.equal(await buttons.nth(1).locator(".clip-edit-tool-check").innerText(),"✓");
      assert.equal(await buttons.nth(1).getAttribute("tabindex"),"0");
      assert.equal(await buttons.first().getAttribute("tabindex"),"-1");
      assert.equal(await buttons.first().locator(".clip-edit-tool-check").innerText(),"");
      assert.match(await buttons.nth(1).evaluate(el=>getComputedStyle(el).textDecorationLine),/underline/);
      assert.equal(await buttons.nth(1).evaluate(el => el === document.activeElement), true);
      const count = await page.locator(".clip-block").count();
      await page.locator(".clip-block").first().click();
      assert.equal(await page.locator(".clip-block").count(), count + 1);
      assert.equal(await page.locator('.clip-block[aria-pressed="true"]').count(), 1);
      await toolbar.scrollIntoViewIfNeeded();
      await buttons.nth(1).focus();
      await page.keyboard.press("End");
      assert.equal(await buttons.nth(2).getAttribute("aria-pressed"), "true");
      const fade = page.locator(".clip-inspector input[type=number]").nth(3);
      await fade.fill("50");
      await fade.press("Tab");
      assert.equal(await fade.inputValue(), "50");
    } finally { await page.close(); }
  });
  it("the ruler seeks by keyboard without moving the selected clip", async () => {
    const page = await browser.newPage({ viewport: { width: 640, height: 720 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
      await page.locator(".clip-block").first().click();
      const start = page.locator(".clip-inspector .clip-field input").first();
      const oldValue = await start.inputValue();
      const ruler = page.locator(".clip-ruler");
      await ruler.focus();
      await page.keyboard.press("Home");
      assert.equal(await ruler.getAttribute("aria-valuenow"), "0");
      await page.keyboard.press("Shift+ArrowRight");
      assert.equal(await ruler.getAttribute("aria-valuenow"), "50");
      await page.keyboard.press("End");
      assert.equal(await ruler.getAttribute("aria-valuenow"), await ruler.getAttribute("aria-valuemax"));
      assert.equal(await start.inputValue(), oldValue);
      assert.ok((await ruler.boundingBox())!.height >= 44);
    } finally { await page.close(); }
  });
  for (const width of [1280, 640]) {
    it(`${width}px: tracks, clips and advanced functions share one page`, async () => {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(BASE, { waitUntil: "networkidle" });
        await page.locator(".production-mix-scroll").waitFor();
        assert.equal(await page.locator(".production-subnav").count(), 0);
        assert.equal(await page.locator("#production-panel-mix").isVisible(), true);
        assert.equal(await page.locator("#production-panel-clips").isVisible(), true);
        assert.equal(await page.locator(".clip-lane-label").filter({hasText:/Voix|Batterie/}).count(),0);
        assert.equal(await page.locator(".common-track-lane").count(),12);
        const lanes=page.getByTestId("clip-timeline-lanes");
        const stickyRows=page.locator(".clip-ruler, .clip-tempo-lane, .clip-marker-lane:not(.clip-tempo-lane)");
        const beforeSticky=await stickyRows.evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().top));
        await lanes.evaluate(el=>{el.scrollTop=120;});
        const afterSticky=await stickyRows.evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().top));
        assert.ok(await lanes.evaluate(el=>el.scrollTop)>0);
        afterSticky.forEach((top,index)=>assert.ok(Math.abs(top-beforeSticky[index])<=0.5,JSON.stringify({beforeSticky,afterSticky})));
        await lanes.evaluate(el=>{el.scrollTop=0;});
        const rail=page.locator(".production-mix-row .clip-lane-rail").first();
        const railBox=await rail.boundingBox();
        const rulerBox=await page.locator(".clip-ruler-marks-abs").boundingBox();
        assert.ok(railBox && rulerBox);
        assert.ok(Math.abs(railBox.x-rulerBox.x)<=1,JSON.stringify({railBox,rulerBox}));
        assert.ok(Math.abs(railBox.width-rulerBox.width)<=1,JSON.stringify({railBox,rulerBox}));
        await page.locator(".production-track-tools-btn").first().click();
        await page.locator(".production-track-auto-toggle").click();
        await page.keyboard.press("Escape");
        const auto=page.locator(".production-auto-curve").first();
        const autoBox=await auto.boundingBox();
        assert.ok(autoBox);
        assert.ok(Math.abs(autoBox.x-railBox.x)<=1,JSON.stringify({autoBox,railBox}));
        assert.ok(Math.abs(autoBox.width-railBox.width)<=1,JSON.stringify({autoBox,railBox}));
        const ruler=page.locator(".clip-ruler");
        await ruler.focus();
        await page.keyboard.press("Shift+ArrowRight");
        const rulerLine=await ruler.locator(".production-playback-line").boundingBox();
        const clipLine=await rail.locator(".production-playback-line").boundingBox();
        const autoLine=await auto.locator(".production-auto-playback-line").boundingBox();
        assert.ok(rulerLine && clipLine && autoLine);
        assert.ok(Math.abs(rulerLine.x-clipLine.x)<=1);
        assert.ok(Math.abs(rulerLine.x-autoLine.x)<=1);
        const labelsBefore=await page.locator(".clip-ruler-tick").evaluateAll(elements=>elements.filter(el=>el.textContent?.trim()).length);
        const zoom=page.locator(".clip-tool-zoom input");
        await zoom.focus();
        await zoom.press("End");
        await page.waitForFunction(count=>Array.from(document.querySelectorAll(".clip-ruler-tick")).filter(el=>el.textContent?.trim()).length>count,labelsBefore);
        const zoomRail=await rail.boundingBox();
        const zoomRuler=await page.locator(".clip-ruler-marks-abs").boundingBox();
        const zoomCurve=await auto.boundingBox();
        assert.ok(zoomRail && zoomRuler && zoomCurve);
        assert.ok(Math.abs(zoomRail.x-zoomRuler.x)<=1);
        assert.ok(Math.abs(zoomCurve.x-zoomRuler.x)<=1);
        assert.ok(Math.abs(zoomRail.width-zoomRuler.width)<=1);
        assert.ok(Math.abs(zoomCurve.width-zoomRuler.width)<=1);
        const advanced = page.locator(".production-advanced-disclosure");
        assert.equal(await advanced.getAttribute("open"), null);
        assert.equal(await page.locator(".phase3-mix").isVisible(), false);
        const summary = advanced.locator("summary");
        await summary.focus();
        await page.keyboard.press("Enter");
        await page.locator(".phase3-mix").waitFor();
        assert.equal(await page.locator(".phase3-mix select").count() > 1, true);
        assert.equal(await page.locator(".export-wizard").count() > 0, true);
        await summary.focus();
        await page.keyboard.press("Enter");
        assert.equal(await advanced.getAttribute("open"), null);
        assert.equal(await summary.evaluate(el => document.activeElement === el), true);
        const overflow = await page.locator(".production-workspace-common").evaluate(el => ({
          client: el.clientWidth, scroll: el.scrollWidth,
        }));
        assert.ok(overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }
  it("clips retain keyboard editing and their scroll region", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      const lanes = page.getByTestId("clip-timeline-lanes");
      await lanes.scrollIntoViewIfNeeded();
      await lanes.focus();
      const before = await lanes.evaluate(el => el.scrollTop);
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(300);
      assert.ok(await lanes.evaluate(el => el.scrollTop) > before);
      await page.locator(".clip-block").first().click();
      const start = page.locator(".clip-inspector .clip-field input").first();
      const oldValue = await start.inputValue();
      const gain=page.locator('.track-gain-knob [role="slider"]').first();
      const oldGain=await gain.getAttribute("aria-valuenow");
      await gain.focus();
      await page.keyboard.press("ArrowRight");
      assert.notEqual(await gain.getAttribute("aria-valuenow"),oldGain);
      assert.equal(await start.inputValue(),oldValue);
      await lanes.focus();
      await page.keyboard.press("ArrowRight");
      assert.notEqual(await start.inputValue(), oldValue);
    } finally { await page.close(); }
  });
});
