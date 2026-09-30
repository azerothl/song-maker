/**
 * Preuve manuelle : avec AnchoredPopin @ 2db918a, le calage B1 échoue (ancre haut, 600px).
 * Usage : pnpm exec tsx docs/design/separation-export-a11y/captures-react/b1-regression-old-popin.mts
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const ANCHORED = path.join(ROOT, "src/components/AnchoredPopin.tsx");
const OUT = path.join(__dirname, "B1-regression-old-anchored-popin.txt");
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
const oldSrc = execSync("git show 2db918a:src/components/AnchoredPopin.tsx", {
  cwd: ROOT,
  encoding: "utf8",
});

const lines: string[] = [
  "Preuve B1 — AnchoredPopin legacy (git 2db918a) vs calage viewport (#191)",
  "",
  "Étapes : remplacement temporaire de src/components/AnchoredPopin.tsx, mesure Playwright",
  "export-drawer-top-12 @ 1280×600 (ancre haut, scène capture réelle).",
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
    await page.goto(`${BASE}?regression=1#export-drawer-top-12`);
    await page.waitForTimeout(1200);
    await page.waitForSelector('[data-testid="export-dialog-footer"]');
    const m = await page.evaluate(() => {
      const popin = document.querySelector(".export-dialog-popin")!;
      const anchor = document.querySelector("[data-capture-export-trigger]")!;
      const footer = document.querySelector('[data-testid="export-dialog-footer"]')!;
      const r = popin.getBoundingClientRect();
      const a = anchor.getBoundingClientRect();
      return {
        popinTop: r.top,
        popinBottom: r.bottom,
        anchorBottom: a.bottom,
        vh: window.innerHeight,
        footerBottom: footer.getBoundingClientRect().bottom,
      };
    });
    await browser.close();

    lines.push("Mesure (legacy) :");
    lines.push(JSON.stringify(m, null, 2));
    lines.push("");

    const margin = 8;
    const panelH = m.popinBottom - m.popinTop;
    const pinTop = m.vh - panelH - margin;
    lines.push(
      `Assertion B1 (behavior test) : popinTop ≥ ${pinTop.toFixed(1)} (calage bas viewport)`,
    );

    try {
      assert.ok(
        m.popinTop >= pinTop - 1,
        `legacy popinTop=${m.popinTop} < ${pinTop}`,
      );
      lines.push("Résultat : PASS (inattendu — le legacy ne devrait pas caler le pied).");
    } catch (e) {
      lines.push(`Résultat : FAIL attendu — ${(e as Error).message}`);
      lines.push("");
      lines.push(
        "→ anchoredPopinFooter.behavior.test.ts (assertB1Reachable) échoue avec le même fichier.",
      );
    }
  } finally {
    vite.kill("SIGTERM");
  }
} finally {
  writeFileSync(ANCHORED, fixedSrc, "utf8");
}

writeFileSync(OUT, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
