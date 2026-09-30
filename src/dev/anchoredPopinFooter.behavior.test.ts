import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import { VISIBILITY_BROWSER_BUNDLE } from "../../docs/design/separation-export-a11y/captures-react/visibility.browser.ts";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "./captureViteServer.ts";
import type { ViteDevServer } from "vite";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PORT = 5188;
const BASE = captureBaseUrl(PORT);
const IT_TIMEOUT_MS = 60_000;

type B1Metrics = {
  footer?: { reachable?: boolean } | null;
  run?: { reachable?: boolean } | null;
  popinBottom: number;
  popinTop: number;
  anchorBottom: number;
  expectedAnchorBottom: number;
  vh: number;
  resultVisible?: boolean;
};

let activeServer: ViteDevServer | null = null;

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`serveur inaccessible : ${url}`);
}

async function waitExportAnchorStable(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector("[data-capture-export-trigger]");
      if (!el) return false;
      const h = el.getBoundingClientRect().height;
      return h >= 43.5;
    },
    { timeout: 12_000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.querySelector("[data-capture-export-trigger]");
      const root = document.querySelector(
        ".production-capture-root[data-capture-drawer='1']",
      );
      if (!el || !root) return false;
      const expected = parseFloat(
        getComputedStyle(root).getPropertyValue("--capture-b1-anchor-bottom"),
      );
      const bottom = el.getBoundingClientRect().bottom;
      return Number.isFinite(expected) && Math.abs(bottom - expected) < 0.6;
    },
    { timeout: 12_000 },
  );
}

async function measureExportDrawer(
  page: Page,
  hash: string,
  viewport: { width: number; height: number },
  baseUrl: string = BASE,
  waitMs = 1100,
): Promise<B1Metrics> {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}?v=${encodeURIComponent(hash)}#${hash}`);
  const settleMs = hash.includes("after") ? Math.max(waitMs, 1600) : waitMs;
  await page.waitForTimeout(settleMs);
  if (hash.includes("after")) {
    await page.waitForSelector('[data-testid="export-dialog-footer"]', {
      timeout: 10_000,
    });
    await page.waitForSelector('[data-testid="export-result"]', {
      timeout: 12_000,
    });
  }
  await page.waitForSelector('[data-testid="export-dialog-footer"]');
  if (hash === "export-drawer-b1-12") {
    await waitExportAnchorStable(page);
    await page.waitForFunction(
      () => {
        const radios = document.querySelectorAll<HTMLInputElement>(
          'input[name="export-mode"]',
        );
        return radios.length >= 2 && radios[1]?.checked;
      },
      { timeout: 8000 },
    );
    const stemsOk = await page.evaluate(() => {
      const boxes = document.querySelectorAll(
        ".export-stem-list input[type=checkbox]",
      );
      return boxes.length;
    });
    if (stemsOk !== 12) {
      throw new Error(`B1: attendu 12 pistes stems, obtenu ${stemsOk}`);
    }
  }
  return page.evaluate(
    ({ script }) => {
      eval(script);
      const footer = document.querySelector(
        '[data-testid="export-dialog-footer"]',
      ) as HTMLElement | null;
      const run = document.querySelector(
        '[data-testid="export-run"]',
      ) as HTMLElement | null;
      const popin = document.querySelector(
        ".export-dialog-popin",
      ) as HTMLElement | null;
      const anchor = document.querySelector(
        "[data-capture-export-trigger]",
      ) as HTMLElement | null;
      const root = document.querySelector(
        ".production-capture-root[data-capture-drawer='1']",
      ) as HTMLElement | null;
      const result = document.querySelector(
        '[data-testid="export-result"]',
      ) as HTMLElement | null;
      const anchorBottom = anchor?.getBoundingClientRect().bottom ?? 0;
      const popinTop = popin?.getBoundingClientRect().top ?? 0;
      const popinBottom = popin?.getBoundingClientRect().bottom ?? 0;
      const expectedAnchorBottom = root
        ? parseFloat(
            getComputedStyle(root).getPropertyValue("--capture-b1-anchor-bottom"),
          )
        : NaN;
      return {
        footer: __measureReachability(footer),
        run: __measureReachability(run),
        popinBottom,
        popinTop,
        anchorBottom,
        expectedAnchorBottom,
        vh: window.innerHeight,
        resultVisible: Boolean(result && result.textContent?.trim()),
      };
    },
    { script: VISIBILITY_BROWSER_BUNDLE },
  );
}

/** B1 Alphonse : pied + Exporter atteignables (viewport), sans assertion de calage ancre. */
function assertB1ViewportReachable(metrics: B1Metrics, label: string): void {
  assert.equal(metrics.footer?.reachable, true, `${label} footer`);
  assert.equal(metrics.run?.reachable, true, `${label} export`);
  assert.ok(
    metrics.popinBottom <= metrics.vh + 1,
    `${label} popin dépasse le viewport (${metrics.popinBottom} > ${metrics.vh})`,
  );
  if (label.includes("after")) {
    assert.equal(metrics.resultVisible, true, `${label} résultat export`);
  }
}

function assertB1AnchorStrict(metrics: B1Metrics, label: string): void {
  assert.ok(
    Number.isFinite(metrics.expectedAnchorBottom),
    `${label} --capture-b1-anchor-bottom absent`,
  );
  assert.ok(
    Math.abs(metrics.anchorBottom - metrics.expectedAnchorBottom) < 0.51,
    `${label} ancre bottom=${metrics.anchorBottom} (attendu strict ${metrics.expectedAnchorBottom})`,
  );
}

afterEach(async () => {
  if (activeServer) {
    await stopCaptureViteServer(activeServer);
    activeServer = null;
  }
});

describe("AnchoredPopin — pied export (B1, #191 / #196)", () => {
  it(
    "scénario Alphonse : tiroir y≈219, bascule Pistes séparées après ouverture",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT);
      await waitServer(BASE);
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.addInitScript((script: string) => {
        eval(script);
      }, VISIBILITY_BROWSER_BUNDLE);

      const cases: Array<{ hash: string; vp: { width: number; height: number } }> =
        [
          { hash: "export-drawer-b1-12", vp: { width: 1280, height: 768 } },
          { hash: "export-drawer-b1-12", vp: { width: 1280, height: 900 } },
        ];

      for (const { hash, vp } of cases) {
        const m = await measureExportDrawer(page, hash, vp, BASE, 1400);
        if (hash === "export-drawer-b1-12" && vp.height === 768) {
          assertB1AnchorStrict(m, `${hash}@${vp.width}x${vp.height}`);
        }
        assertB1ViewportReachable(m, `${hash}@${vp.width}x${vp.height}`);
      }

      await browser.close();
    },
  );

  it(
    "ancre en haut : 4/12/16 pistes + après export (720 et 600)",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const port = PORT + 2;
      activeServer = await startCaptureViteServer(port);
      const topBase = captureBaseUrl(port);
      await waitServer(topBase);
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.addInitScript((script: string) => {
        eval(script);
      }, VISIBILITY_BROWSER_BUNDLE);

      const cases: Array<{ hash: string; vp: { width: number; height: number } }> =
        [
          { hash: "export-drawer-top-4", vp: { width: 1280, height: 720 } },
          { hash: "export-drawer-top-12", vp: { width: 1280, height: 720 } },
          { hash: "export-drawer-top-16", vp: { width: 1280, height: 720 } },
          { hash: "export-drawer-top-12-after", vp: { width: 1280, height: 720 } },
          { hash: "export-drawer-top-12", vp: { width: 1280, height: 600 } },
          { hash: "export-drawer-top-12-after", vp: { width: 1280, height: 600 } },
        ];

      for (const { hash, vp } of cases) {
        const m = await measureExportDrawer(page, hash, vp, topBase);
        assertB1ViewportReachable(m, `${hash}@${vp.width}x${vp.height}`);
      }

      const fieldset = await page.evaluate(() => {
        const fs = document.querySelector(
          ".export-dialog-popin fieldset",
        ) as HTMLFieldSetElement | null;
        if (!fs) return null;
        const s = getComputedStyle(fs);
        return {
          borderTopWidth: s.borderTopWidth,
          borderTopStyle: s.borderTopStyle,
        };
      });
      assert.ok(fieldset);
      assert.equal(fieldset!.borderTopStyle, "none");
      assert.equal(fieldset!.borderTopWidth, "0px");

      await browser.close();
    },
  );

  it(
    "export mix tight : boutons du popin ≥ 44 px",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const port = PORT + 1;
      activeServer = await startCaptureViteServer(port);
      const url = captureBaseUrl(port);
      await waitServer(url);
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${url}#export-mix-tight`);
      await page.waitForTimeout(900);
      await page.waitForSelector('[data-testid="export-dialog-footer"]');
      const heights = await page.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll(".export-dialog-popin .btn"),
        ) as HTMLElement[];
        return btns.map((b) => b.getBoundingClientRect().height);
      });
      assert.ok(heights.length >= 2);
      for (const h of heights) {
        assert.ok(h >= 44, `hauteur bouton ${h}`);
      }
      await browser.close();
    },
  );
});

declare function __measureReachability(
  el: HTMLElement | null,
): { reachable?: boolean } | null;
