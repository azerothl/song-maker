import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import { VISIBILITY_BROWSER_BUNDLE } from "../../docs/design/separation-export-a11y/captures-react/visibility.browser.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PORT = 5188;
const BASE = `http://127.0.0.1:${PORT}/separation-export-a11y-capture.html`;

type B1Metrics = {
  footer?: { reachable?: boolean };
  run?: { reachable?: boolean };
  popinBottom: number;
  popinTop: number;
  anchorBottom: number;
  vh: number;
  resultVisible?: boolean;
};

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

async function measureExportDrawerTop(
  page: Page,
  hash: string,
  viewport: { width: number; height: number },
): Promise<B1Metrics> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}?v=${encodeURIComponent(hash)}#${hash}`);
  await page.waitForTimeout(hash.includes("after") ? 1500 : 1100);
  if (hash.includes("after")) {
    await page.waitForSelector('[data-testid="export-result"]', {
      timeout: 8000,
    });
  }
  await page.waitForSelector('[data-testid="export-dialog-footer"]');
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
      const result = document.querySelector(
        '[data-testid="export-result"]',
      ) as HTMLElement | null;
      const anchorBottom = anchor?.getBoundingClientRect().bottom ?? 0;
      const popinTop = popin?.getBoundingClientRect().top ?? 0;
      const popinBottom = popin?.getBoundingClientRect().bottom ?? 0;
      return {
        footer: __measureReachability(footer),
        run: __measureReachability(run),
        popinBottom,
        popinTop,
        anchorBottom,
        vh: window.innerHeight,
        resultVisible: Boolean(result && result.textContent?.trim()),
      };
    },
    { script: VISIBILITY_BROWSER_BUNDLE },
  );
}

function assertB1Reachable(metrics: B1Metrics, label: string): void {
  assert.equal(metrics.footer?.reachable, true, `${label} footer`);
  assert.equal(metrics.run?.reachable, true, `${label} export`);
  assert.ok(
    metrics.popinBottom <= metrics.vh + 1,
    `${label} popin dépasse le viewport (${metrics.popinBottom} > ${metrics.vh})`,
  );
  const margin = 8;
  const panelH = metrics.popinBottom - metrics.popinTop;
  const fitsBelow =
    metrics.anchorBottom + margin + panelH <= metrics.vh - margin + 0.5;
  if (fitsBelow) {
    assert.ok(
      metrics.popinTop >= metrics.anchorBottom + margin - 0.5,
      `${label} devrait s'ouvrir sous l'ancre (top=${metrics.popinTop})`,
    );
  } else {
    const pinTop = metrics.vh - panelH - margin;
    assert.ok(
      metrics.popinTop >= pinTop - 1,
      `${label} devrait être calé en bas de viewport (top=${metrics.popinTop}, attendu≥${pinTop})`,
    );
  }
  if (label.includes("after")) {
    assert.equal(metrics.resultVisible, true, `${label} résultat export`);
  }
}

describe("AnchoredPopin — pied export (B1, #191)", () => {
  it("ancre en haut : 4/12/16 pistes + après export (720 et 600)", async () => {
    const vite = spawn(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
      {
        cwd: ROOT,
        stdio: "ignore",
        env: { ...process.env, VITE_CAPTURE: "1" },
      },
    );

    try {
      await waitServer(BASE);
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
        const m = await measureExportDrawerTop(page, hash, vp);
        assertB1Reachable(m, `${hash}@${vp.width}x${vp.height}`);
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
    } finally {
      vite.kill("SIGTERM");
    }
  });

  it("export mix tight : boutons du popin ≥ 44 px", async () => {
    const vite = spawn(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT + 1)],
      {
        cwd: ROOT,
        stdio: "ignore",
        env: { ...process.env, VITE_CAPTURE: "1" },
      },
    );

    try {
      await waitServer(
        `http://127.0.0.1:${PORT + 1}/separation-export-a11y-capture.html`,
      );
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(
        `http://127.0.0.1:${PORT + 1}/separation-export-a11y-capture.html#export-mix-tight`,
      );
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
    } finally {
      vite.kill("SIGTERM");
    }
  });
});

declare function __measureReachability(
  el: HTMLElement | null,
): { reachable?: boolean } | null;
