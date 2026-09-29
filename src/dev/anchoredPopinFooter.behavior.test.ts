import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { chromium } from "playwright";
import { VISIBILITY_BROWSER_BUNDLE } from "../../docs/design/separation-export-a11y/captures-react/visibility.browser.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PORT = 5188;
const BASE = `http://127.0.0.1:${PORT}/separation-export-a11y-capture.html`;

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

describe("AnchoredPopin — pied export (B1, #191)", () => {
  it("garde Exporter atteignable depuis le tiroir (12 pistes) après export", async () => {
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
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.addInitScript((script: string) => {
        eval(script);
      }, VISIBILITY_BROWSER_BUNDLE);

      for (const hash of ["export-drawer-12", "export-drawer-12-after-export"]) {
        await page.goto(`${BASE}#${hash}`);
        await page.waitForTimeout(hash.includes("after") ? 1500 : 1000);
        await page.waitForSelector('[data-testid="export-dialog-footer"]');
        const metrics = await page.evaluate(
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
            return {
              footer: __measureReachability(footer),
              run: __measureReachability(run),
              popinBottom: popin?.getBoundingClientRect().bottom ?? 0,
              vh: window.innerHeight,
            };
          },
          { script: VISIBILITY_BROWSER_BUNDLE },
        );
        assert.equal(metrics.footer?.reachable, true, `${hash} footer`);
        assert.equal(metrics.run?.reachable, true, `${hash} export`);
        assert.ok(
          metrics.popinBottom <= metrics.vh + 1,
          `popin dépasse viewport (${hash})`,
        );
      }

      await browser.close();
    } finally {
      vite.kill("SIGTERM");
    }
  });

  it("repositionne le popin quand le contenu grossit (ResizeObserver)", async () => {
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
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.addInitScript((script: string) => {
        eval(script);
      }, VISIBILITY_BROWSER_BUNDLE);
      await page.goto(
        `http://127.0.0.1:${PORT + 1}/separation-export-a11y-capture.html#export-drawer-12`,
      );
      await page.waitForTimeout(900);
      const before = await page.evaluate(() => {
        const popin = document.querySelector(".export-dialog-popin");
        return popin?.getBoundingClientRect().bottom ?? 0;
      });
      await page.evaluate(() => {
        const footer = document.querySelector(
          '[data-testid="export-dialog-footer"]',
        );
        const extra = document.createElement("p");
        extra.textContent = "Ligne de résultat simulée pour forcer un repositionnement.";
        extra.setAttribute("data-testid", "export-result");
        extra.className = "export-dialog-result";
        footer?.prepend(extra);
      });
      await page.waitForTimeout(200);
      const after = await page.evaluate(
        ({ script }) => {
          eval(script);
          const popin = document.querySelector(".export-dialog-popin");
          const footer = document.querySelector(
            '[data-testid="export-dialog-footer"]',
          ) as HTMLElement | null;
          return {
            bottom: popin?.getBoundingClientRect().bottom ?? 0,
            footerReach: __measureReachability(footer),
            vh: window.innerHeight,
          };
        },
        { script: VISIBILITY_BROWSER_BUNDLE },
      );
      assert.ok(after.bottom <= after.vh + 1);
      assert.equal(after.footerReach?.reachable, true);
      assert.ok(after.bottom <= before + 1 || after.bottom <= after.vh + 1);
      await browser.close();
    } finally {
      vite.kill("SIGTERM");
    }
  });
});

declare function __measureReachability(
  el: HTMLElement | null,
): {
  reachable?: boolean;
} | null;
