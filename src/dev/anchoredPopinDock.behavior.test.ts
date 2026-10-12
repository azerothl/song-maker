import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "./captureViteServer.ts";
import type { ViteDevServer } from "vite";

const PORT = 5194;
const BASE = captureBaseUrl(PORT);

let activeServer: ViteDevServer | null = null;

afterEach(async () => {
  if (activeServer) {
    await stopCaptureViteServer(activeServer);
    activeServer = null;
  }
});

describe("AnchoredPopin — persistent player dock", () => {
  it("keeps the panel and its controls above the dock", { timeout: 60_000 }, async () => {
    activeServer = await startCaptureViteServer(PORT);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.goto(`${BASE}#sep-header`);
      await page.waitForSelector(".separation-recommend-popin");
      await page.evaluate(() => {
        const dock = document.createElement("div");
        dock.className = "persistent-player-dock";
        Object.assign(dock.style, {
          position: "fixed",
          inset: "auto 0 0",
          height: "76px",
          zIndex: "20",
        });
        document.body.append(dock);
        window.dispatchEvent(new Event("resize"));
      });

      await page.waitForFunction(() => {
        const panel = document.querySelector(
          ".separation-recommend-popin",
        ) as HTMLElement | null;
        const dock = document.querySelector(
          ".persistent-player-dock",
        ) as HTMLElement | null;
        return Boolean(
          panel && dock &&
            panel.getBoundingClientRect().bottom <=
              dock.getBoundingClientRect().top - 7,
        );
      });
      const capturePath = process.env.SONG_MAKER_DOCK_CAPTURE;
      if (capturePath) await page.screenshot({ path: capturePath });

      const metrics = await page.evaluate(() => {
        const panel = document.querySelector(
          ".separation-recommend-popin",
        ) as HTMLElement;
        const dock = document.querySelector(
          ".persistent-player-dock",
        ) as HTMLElement;
        const footer = panel.querySelector(
          '[data-testid="sep-recommend-footer"]',
        ) as HTMLElement | null;
        footer?.scrollIntoView({ block: "nearest" });
        const panelRect = panel.getBoundingClientRect();
        const dockTop = dock.getBoundingClientRect().top;
        const footerRect = footer?.getBoundingClientRect();
        return {
          panelTop: panelRect.top,
          panelBottom: panelRect.bottom,
          dockTop,
          footerBottom: footerRect?.bottom ?? null,
        };
      });

      assert.ok(metrics.panelTop >= 7, `panel top=${metrics.panelTop}`);
      assert.ok(
        metrics.panelBottom <= metrics.dockTop - 7,
        `panel bottom=${metrics.panelBottom}, dock top=${metrics.dockTop}`,
      );
      assert.ok(
        metrics.footerBottom === null || metrics.footerBottom <= metrics.dockTop,
        `footer bottom=${metrics.footerBottom}, dock top=${metrics.dockTop}`,
      );
    } finally {
      await browser.close();
    }
  });
});
