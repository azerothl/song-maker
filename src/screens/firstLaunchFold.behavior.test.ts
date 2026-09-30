/**
 * #199 — premier lancement : case HTDemucs / Télécharger au-dessus du pli ;
 * anneau focus Demucs 2 px cyan.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type Page } from "playwright";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PORT = 5193;
const BASE = `http://127.0.0.1:${PORT}/`;

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

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

type FoldProbe = {
  checkboxInView: boolean;
  downloadInView: boolean;
  checkboxBottom: number;
  downloadBottom: number;
  vh: number;
};

async function measureFold(
  page: Page,
  viewport: { width: number; height: number },
): Promise<FoldProbe> {
  await page.setViewportSize(viewport);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#fl-htdemucs-license-accept", { timeout: 15_000 });
  return page.evaluate(`(() => {
    const vh = window.innerHeight;
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return el.getBoundingClientRect();
    };
    const cb = pick('label[for="fl-htdemucs-license-accept"]');
    const btn = pick(".fl-actions .fl-btn");
    const inView = (r) =>
      Boolean(
        r &&
          r.height > 0 &&
          r.top >= -0.5 &&
          r.bottom <= vh + 0.5,
      );
    return {
      checkboxInView: inView(cb),
      downloadInView: inView(btn),
      checkboxBottom: cb ? Math.round(cb.bottom) : -1,
      downloadBottom: btn ? Math.round(btn.bottom) : -1,
      vh,
    };
  })()`) as Promise<FoldProbe>;
}

describe("first-launch fold + Demucs focus (#199)", () => {
  let proc: ReturnType<typeof spawn> | undefined;
  let browser: Browser | undefined;

  before(async () => {
    proc = spawn(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
      {
        cwd: ROOT,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    await waitServer(BASE);
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    proc?.kill("SIGTERM");
  });

  it("case HTDemucs visible sans scroll à 1280×720", async () => {
    const page = await browser!.newPage();
    try {
      const m = await measureFold(page, { width: 1280, height: 720 });
      assert.equal(m.vh, 720);
      assert.equal(
        m.checkboxInView,
        true,
        `case HTDemucs hors pli (bottom=${m.checkboxBottom})`,
      );
      assert.equal(
        m.downloadInView,
        true,
        `Télécharger hors pli (bottom=${m.downloadBottom})`,
      );
    } finally {
      await page.close();
    }
  });

  it("bouton Télécharger visible sans scroll à 1280×640", async () => {
    const page = await browser!.newPage();
    try {
      const m = await measureFold(page, { width: 1280, height: 640 });
      assert.equal(m.vh, 640);
      assert.equal(
        m.downloadInView,
        true,
        `Télécharger hors pli (bottom=${m.downloadBottom})`,
      );
      assert.equal(
        m.checkboxInView,
        true,
        `case HTDemucs hors pli (bottom=${m.checkboxBottom})`,
      );
    } finally {
      await page.close();
    }
  });

  it("lien Demucs #327 : anneau focus 2 px cyan", async () => {
    const page = await browser!.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForSelector("a.fl-demucs-link", { timeout: 15_000 });
      await page.locator("a.fl-demucs-link").focus();
      const proof = await page.evaluate(`(() => {
        const el = document.querySelector("a.fl-demucs-link");
        if (!el) return null;
        el.focus();
        const cs = getComputedStyle(el);
        return {
          matchesFocusVisible: el.matches(":focus-visible"),
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor,
        };
      })()`) as {
        matchesFocusVisible: boolean;
        outlineStyle: string;
        outlineWidth: string;
        outlineColor: string;
      } | null;
      assert.ok(proof, "lien Demucs introuvable");
      assert.equal(proof.matchesFocusVisible, true);
      assert.equal(proof.outlineStyle, "solid");
      assert.match(proof.outlineWidth, /^2(px)?$/);
      assert.match(proof.outlineColor, /rgb\(\s*94\s*,\s*236\s*,\s*248\s*\)/);
    } finally {
      await page.close();
    }
  });
});
