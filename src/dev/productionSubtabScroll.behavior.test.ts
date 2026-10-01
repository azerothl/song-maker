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
