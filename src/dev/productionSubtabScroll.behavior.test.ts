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
  it("PageDown scrolls from a toolbar button and Tab leaves the timeline", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
      const top = page.getByTestId("production-clips-scroll");
      await top.evaluate(el => { el.scrollTop = 0; });
      await page.locator(".clip-edit-toolbar button").first().focus();
      await page.keyboard.press("PageDown");
      assert.ok(await top.evaluate(el => el.scrollTop) > 0);
      let reachedAdvanced = false;
      for (let i = 0; i < 60; i++) {
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
      const tempo = page.locator(".clip-arrangement-bar > button").first();
      await tempo.click();
      await page.locator(".clip-tempo-editor input").first().waitFor();
      assert.equal(await page.locator(".clip-tempo-editor input").first().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Escape");
      assert.equal(await tempo.evaluate(el => el === document.activeElement), true);
      const markers = page.locator(".clip-arrangement-bar > button").nth(1);
      await markers.click();
      await page.locator(".clip-marker-editor select").waitFor();
      await page.keyboard.press("Escape");
      assert.equal(await markers.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator(".clip-tempo-lane .clip-tempo-flag").count() > 0, true);
    } finally { await page.close(); }
  });
  it("editing tools switch by keyboard and Cut selects the created clip", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.locator("#production-panel-clips").scrollIntoViewIfNeeded();
      const toolbar = page.locator(".clip-edit-toolbar");
      const buttons = toolbar.locator("button");
      await buttons.first().focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await buttons.nth(1).getAttribute("aria-pressed"), "true");
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
      await lanes.focus();
      await page.keyboard.press("ArrowRight");
      assert.notEqual(await start.inputValue(), oldValue);
    } finally { await page.close(); }
  });
});
