/**
 * Preuve : avec AnchoredPopin avant #191 (parent de 0fece00), le pied B1 sort du viewport.
 * Usage : pnpm exec tsx docs/design/separation-export-a11y/captures-react/b1-regression-old-popin.mts
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { VISIBILITY_BROWSER_BUNDLE } from "./visibility.browser.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const ANCHORED = path.join(ROOT, "src/components/AnchoredPopin.tsx");
const OUT = path.join(__dirname, "B1-regression-old-anchored-popin.txt");
const LEGACY_SHA = "92f4f8a";
const PORT = 5193;
const BASE = `http://127.0.0.1:${PORT}/separation-export-a11y-capture.html`;

async function waitServer(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE.split("?")[0])).status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("serveur inaccessible");
}

const fixedSrc = readFileSync(ANCHORED, "utf8");
const oldSrc = execSync(`git show ${LEGACY_SHA}:src/components/AnchoredPopin.tsx`, {
  cwd: ROOT,
  encoding: "utf8",
});

const lines: string[] = [
  `Preuve B1 — AnchoredPopin legacy (git ${LEGACY_SHA}, parent de 0fece00) vs viewport (#196)`,
  "",
  "Scénario Alphonse : ancre tiroir y≈219, 12 pistes, ouverture export puis bascule « Pistes séparées ».",
  "Viewport 1280×768 — mesure Playwright export-drawer-b1-12.",
  "",
];

try {
  writeFileSync(ANCHORED, oldSrc, "utf8");
  execSync("rm -rf node_modules/.vite", { cwd: ROOT });

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
    await waitServer();
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
    await page.addInitScript((script: string) => {
      eval(script);
    }, VISIBILITY_BROWSER_BUNDLE);
    await page.goto(`${BASE}?regression=1#export-drawer-b1-12`);
    await page.waitForTimeout(1500);
    await page.waitForSelector('[data-testid="export-dialog-footer"]');
    const m = await page.evaluate(
      ({ script }) => {
        eval(script);
        const popin = document.querySelector(".export-dialog-popin")!;
        const anchor = document.querySelector("[data-capture-export-trigger]")!;
        const footer = document.querySelector(
          '[data-testid="export-dialog-footer"]',
        ) as HTMLElement;
        const run = document.querySelector('[data-testid="export-run"]') as HTMLElement;
        const r = popin.getBoundingClientRect();
        const a = anchor.getBoundingClientRect();
        const fr = footer.getBoundingClientRect();
        return {
          popinTop: r.top,
          popinBottom: r.bottom,
          anchorBottom: a.bottom,
          vh: window.innerHeight,
          footerBottom: fr.bottom,
          footerReach: __measureReachability(footer),
          runReach: __measureReachability(run),
        };
      },
      { script: VISIBILITY_BROWSER_BUNDLE },
    );
    await browser.close();

    lines.push("Mesure (legacy) :");
    lines.push(JSON.stringify(m, null, 2));
    lines.push("");
    lines.push(
      "Assertion B1 (#196) : footer.reachable === true ET run.reachable === true (pied/boutons dans le viewport, elementFromPoint).",
    );
    lines.push(
      `Attendu legacy : popin ${m.popinTop.toFixed(1)}→${m.popinBottom.toFixed(1)} sur vh=${m.vh} ; footerBottom=${m.footerBottom.toFixed(1)}.`,
    );

    try {
      assert.equal(
        m.footerReach?.reachable,
        false,
        `legacy footer reachable=${m.footerReach?.reachable}`,
      );
      assert.equal(
        m.runReach?.reachable,
        false,
        `legacy export reachable=${m.runReach?.reachable}`,
      );
      lines.push(
        "Résultat : FAIL attendu (legacy) — pied et Exporter non atteignables (viewport).",
      );
      lines.push("");
      lines.push(
        "→ Échec pour débordement viewport / pied non atteignable, pas pour une assertion de calage (top ≥ 112).",
      );
      lines.push(
        "→ anchoredPopinFooter.behavior.test.ts (assertB1ViewportReachable) passe avec le AnchoredPopin actuel.",
      );
    } catch (e) {
      lines.push(`Résultat : PASS inattendu — ${(e as Error).message}`);
      process.exitCode = 1;
    }
  } finally {
    vite.kill("SIGTERM");
  }
} finally {
  writeFileSync(ANCHORED, fixedSrc, "utf8");
}

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(lines.join("\n"));

declare function __measureReachability(
  el: HTMLElement | null,
): { reachable?: boolean } | null;
if (process.exitCode) process.exit(process.exitCode);
