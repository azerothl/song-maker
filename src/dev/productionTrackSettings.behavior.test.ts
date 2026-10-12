import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

const PORT = 5197;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#studio-compact-6`;
let vite: ViteDevServer | undefined;
let browser: Browser;

before(async () => {
  vite = await startCaptureViteServer(PORT);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (vite) await stopCaptureViteServer(vite);
});

describe("Studio track settings and reorder", () => {
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 800, height: 650 },
    { width: 390, height: 844 },
  ]) {
    it(`keeps the four settings tabs readable at ${viewport.width}px`, async () => {
      const page = await browser.newPage({ viewport });
      try {
        await page.goto(BASE, { waitUntil: "networkidle" });
        await page.locator(".production-track-tools-btn").first().click();
        const popin = page.locator(".production-track-detail-popin");
        await popin.waitFor();
        const tabs = popin.getByRole("tab");
        assert.equal(await tabs.count(), 4);
        const rects = await tabs.evaluateAll((elements) => elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, scrollWidth: (element as HTMLElement).scrollWidth, clientWidth: (element as HTMLElement).clientWidth };
        }));
        for (let index = 0; index < rects.length; index += 1) {
          const rect = rects[index]!;
          assert.ok(rect.width > 40 && rect.height >= 36, `tab ${index} is too small: ${JSON.stringify(rect)}`);
          assert.ok(rect.scrollWidth <= rect.clientWidth + 1, `tab ${index} text overflows: ${JSON.stringify(rect)}`);
          if (index > 0) {
            const previous = rects[index - 1]!;
            if (Math.abs(previous.top - rect.top) < 2) {
              assert.ok(previous.right <= rect.left + 1, `tabs ${index - 1} and ${index} overlap`);
            }
          }
        }
        assert.equal(await popin.getByRole("tab", { selected: true }).count(), 1);
        const bounds = await popin.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        assert.ok(bounds.left >= -1 && bounds.right <= viewport.width + 1, `popin escapes viewport: ${JSON.stringify(bounds)}`);
      } finally {
        await page.close();
      }
    });
  }

  it("moves a track with the pointer and with the keyboard", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      const rows = page.locator(".production-mix-row[data-track-id]");
      const before = await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-track-id")));
      const handle = page.locator(".studio-track-reorder").first();
      const secondRow = rows.nth(1);
      const firstRect = await handle.boundingBox();
      const secondRect = await secondRow.boundingBox();
      assert.ok(firstRect && secondRect);
      await page.mouse.move(firstRect.x + firstRect.width / 2, firstRect.y + firstRect.height / 2);
      await page.mouse.down();
      await page.mouse.move(secondRect.x + secondRect.width / 2, secondRect.y + secondRect.height * 0.8, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction((expected) => {
        const current = Array.from(document.querySelectorAll<HTMLElement>(".production-mix-row[data-track-id]"))
          .map((element) => element.dataset.trackId);
        return current[0] === expected[1] && current[1] === expected[0];
      }, before);
      const keyboardHandle = page.locator(".studio-track-reorder").first();
      await keyboardHandle.focus();
      await page.keyboard.press("ArrowDown");
      await page.waitForFunction((expected) => {
        const current = Array.from(document.querySelectorAll<HTMLElement>(".production-mix-row[data-track-id]"))
          .map((element) => element.dataset.trackId);
        return current[0] === expected[0] && current[1] === expected[1];
      }, before);
    } finally {
      await page.close();
    }
  });
});
