import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import { VISIBILITY_BROWSER_BUNDLE } from "../../docs/design/separation-export-a11y/captures-react/visibility.browser.ts";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "./captureViteServer.ts";
import type { ViteDevServer } from "vite";

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

async function withBrowser(
  fn: (page: Page) => Promise<void>,
): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript((script: string) => {
      eval(script);
    }, VISIBILITY_BROWSER_BUNDLE);
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function waitExportAnchorStable(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        ".production-global-actions [data-capture-export-trigger]",
      );
      if (!el) return false;
      const h = el.getBoundingClientRect().height;
      return h >= 43.5;
    },
    { timeout: 12_000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.querySelector(
        ".production-global-actions [data-capture-export-trigger]",
      );
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

function measurePopinAnchorOverlapPx(
  popin: DOMRect,
  anchor: DOMRect,
): number {
  return Math.max(
    0,
    Math.min(popin.bottom, anchor.bottom) - Math.max(popin.top, anchor.top),
  );
}

async function measureSepRecommendOverlap(
  page: Page,
  viewport: { width: number; height: number },
  baseUrl: string = BASE,
): Promise<{
  overlapPx: number;
  footerReachable: boolean;
  spotlightFooterClearancePx: number | null;
  noticeFontPx: number;
}> {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}#sep-header`);
  await page.waitForSelector('[data-testid="sep-recommend-footer"]');
  await page.evaluate(async () => {
    await document.fonts?.ready;
  });
  await page.waitForTimeout(400);
  return page.evaluate((script) => {
    eval(script);
    const popin = document.querySelector(
      ".separation-recommend-popin",
    ) as HTMLElement | null;
    const anchor = document.querySelector(
      '[data-testid="sep-recommend-trigger"]',
    ) as HTMLElement | null;
    const footer = document.querySelector(
      '[data-testid="sep-recommend-footer"]',
    ) as HTMLElement | null;
    const spotlight = document.querySelector(
      ".sep-recommended-spotlight [data-testid^='sep-quality-card-']",
    ) as HTMLElement | null;
    const notice = document.querySelector(
      '[data-testid="sep-rec-notice-htdemucs"]',
    ) as HTMLElement | null;
    const pr = popin?.getBoundingClientRect();
    const ar = anchor?.getBoundingClientRect();
    const overlap =
      pr && ar
        ? Math.max(
            0,
            Math.min(pr.bottom, ar.bottom) - Math.max(pr.top, ar.top),
          )
        : 999;
    const ft = footer?.getBoundingClientRect().top;
    const sb = spotlight?.getBoundingClientRect().bottom;
    const noticeFontPx = notice
      ? parseFloat(getComputedStyle(notice).fontSize)
      : 0;
    return {
      overlapPx: Math.round(overlap * 100) / 100,
      footerReachable: Boolean(
        footer && __measureReachability(footer)?.reachable,
      ),
      spotlightFooterClearancePx:
        ft != null && sb != null ? Math.round((ft - sb) * 100) / 100 : null,
      noticeFontPx,
    };
  }, VISIBILITY_BROWSER_BUNDLE);
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
        ".production-global-actions [data-capture-export-trigger]",
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

async function assertB1ExportMinHeightMatchesProdRule(page: Page): Promise<void> {
  const { harnessMin, prodMin } = await page.evaluate(() => {
    const harnessBtn = document.querySelector(
      ".production-global-actions [data-capture-export-trigger]",
    ) as HTMLElement | null;
    const probe = document.createElement("div");
    probe.innerHTML =
      '<div class="production-global-actions"><div class="song-actions"><div class="song-actions-export"><button type="button" class="btn primary">x</button></div></div></div>';
    document.body.appendChild(probe);
    const prodBtn = probe.querySelector("button") as HTMLElement;
    const harnessMin = harnessBtn
      ? getComputedStyle(harnessBtn).minHeight
      : "";
    const prodMin = getComputedStyle(prodBtn).minHeight;
    probe.remove();
    return { harnessMin, prodMin };
  });
  assert.equal(
    harnessMin,
    prodMin,
    `min-height harness (${harnessMin}) ≠ règle prod (${prodMin})`,
  );
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
      await withBrowser(async (page) => {
        const cases: Array<{ hash: string; vp: { width: number; height: number } }> =
          [
            { hash: "export-drawer-b1-12", vp: { width: 1280, height: 768 } },
            { hash: "export-drawer-b1-12", vp: { width: 1280, height: 900 } },
          ];

        for (const { hash, vp } of cases) {
          const m = await measureExportDrawer(page, hash, vp, BASE, 1400);
          if (hash === "export-drawer-b1-12" && vp.height === 768) {
            await assertB1ExportMinHeightMatchesProdRule(page);
            assertB1AnchorStrict(m, `${hash}@${vp.width}x${vp.height}`);
          }
          assertB1ViewportReachable(m, `${hash}@${vp.width}x${vp.height}`);
        }
      });
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
      await withBrowser(async (page) => {
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
      });
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
      await withBrowser(async (page) => {
        await page.setViewportSize({ width: 1280, height: 720 });
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
      });
    },
  );
});

describe("AnchoredPopin — séparation reco (overlap déclencheur, #196)", () => {
  it(
    "recouvrement 0 avec le bouton Séparer (720, 768, 640)",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT + 3);
      const sepUrl = captureBaseUrl(PORT + 3);
      await waitServer(sepUrl);
      await withBrowser(async (page) => {
        for (const height of [720, 768, 640]) {
          const m = await measureSepRecommendOverlap(
            page,
            {
              width: 1280,
              height,
            },
            sepUrl,
          );
          assert.ok(
            m.overlapPx <= 0.51,
            `sep-header@${1280}x${height} overlap=${m.overlapPx}px`,
          );
          assert.equal(m.footerReachable, true, `pied inaccessible @${height}`);
          assert.ok(
            m.noticeFontPx >= 14,
            `notice ${m.noticeFontPx}px < 14 @${height}`,
          );
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.goto(`${sepUrl}#sep-focus-vocals`);
        await page.waitForSelector('[data-testid="sep-recommend-footer"]');
        await page.waitForFunction(
          () =>
            document.querySelector<HTMLInputElement>(
              'input[name="sep-focus"][value="vocals"]',
            )?.checked === true,
          { timeout: 10_000 },
        );
        await page.evaluate(async () => {
          await document.fonts?.ready;
        });
        await page.waitForTimeout(350);
        const voix = await page.evaluate((script) => {
          eval(script);
          const spotlight = document.querySelector(
            ".sep-recommended-spotlight [data-testid^='sep-quality-card-']",
          ) as HTMLElement | null;
          const footer = document.querySelector(
            '[data-testid="sep-recommend-footer"]',
          ) as HTMLElement | null;
          const ft = footer?.getBoundingClientRect().top;
          const sb = spotlight?.getBoundingClientRect().bottom;
          return ft != null && sb != null ? ft - sb : -1;
        }, VISIBILITY_BROWSER_BUNDLE);
        assert.ok(voix >= 0, `Voix spotlight dépasse le pied (${voix}px)`);
      });
    },
  );
});

declare function __measureReachability(
  el: HTMLElement | null,
): { reachable?: boolean } | null;
