/**
 * #199 / #196 — premier lancement :
 * - case HTDemucs / Télécharger au-dessus du pli
 * - « Reprendre » au-dessus du pli (état interrompu @640)
 * - indicateur de défilement si récapitulatif masqué
 * - notice HTDemucs ≥ 14 px (balisage distinct de SeparatorLicenseNotice)
 * - anneau focus Demucs 2 px cyan
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import { contrastRatio } from "../lib/firstLaunch.ts";

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
  noticeFontPx: number;
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
    const notice = document.querySelector("[data-testid='fl-htdemucs-notice']");
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
      noticeFontPx: notice
        ? parseFloat(getComputedStyle(notice).fontSize)
        : 0,
      vh,
    };
  })()`) as Promise<FoldProbe>;
}

type InterruptedProbe = {
  resumeInView: boolean;
  resumeBottom: number;
  vh: number;
};

async function measureInterrupted(
  page: Page,
  viewport: { width: number; height: number },
): Promise<InterruptedProbe> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}#c`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='fl-resume-download']", {
    timeout: 15_000,
  });
  await page.waitForTimeout(200);
  return page.evaluate(`(() => {
    const vh = window.innerHeight;
    const btn = document.querySelector("[data-testid='fl-resume-download']");
    const r = btn?.getBoundingClientRect();
    const inView = Boolean(
      r &&
        r.height > 0 &&
        r.top >= -0.5 &&
        r.bottom <= vh + 0.5,
    );
    return {
      resumeInView: inView,
      resumeBottom: r ? Math.round(r.bottom) : -1,
      vh,
    };
  })()`) as Promise<InterruptedProbe>;
}

type SummaryScrollProbe = {
  gridHiddenPx: number;
  scrollHintVisible: boolean;
  dataScrollMore: string | null;
  vh: number;
};

async function measureSummaryScroll(
  page: Page,
  viewport: { width: number; height: number },
): Promise<SummaryScrollProbe> {
  await page.setViewportSize(viewport);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='fl-download-summary']", {
    timeout: 15_000,
  });
  await page.waitForTimeout(250);
  return page.evaluate(`(() => {
    const vh = window.innerHeight;
    const grid = document.querySelector(".fl-grid");
    const shell = document.querySelector(".fl-scroll-shell");
    const hint = document.querySelector(".fl-scroll-hint");
    const hiddenPx = grid
      ? Math.max(0, grid.scrollHeight - grid.clientHeight)
      : 0;
    return {
      gridHiddenPx: hiddenPx,
      scrollHintVisible: Boolean(
        hint && getComputedStyle(hint).display !== "none",
      ),
      dataScrollMore: shell?.getAttribute("data-scroll-more") ?? null,
      vh,
    };
  })()`) as Promise<SummaryScrollProbe>;
}

type ScrollRegionFocusProof = {
  matchesFocusVisible: boolean;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
};

async function measureGridTabFocus(
  page: Page,
  viewport: { width: number; height: number },
): Promise<ScrollRegionFocusProof> {
  await page.setViewportSize(viewport);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".fl-grid[tabindex='0']", { timeout: 15_000 });
  await page.locator(".fl-grid").focus();
  return page.evaluate(`(() => {
    const el = document.querySelector(".fl-grid");
    if (!el) return null;
    el.focus();
    const cs = getComputedStyle(el);
    return {
      matchesFocusVisible: el.matches(":focus-visible"),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      outlineColor: cs.outlineColor,
    };
  })()`) as Promise<ScrollRegionFocusProof>;
}

type ErrboxHintProbe = {
  vh: number;
  hasHint: boolean;
  maskedTextNodes: number;
  maxScrollTop: number;
};

async function measureErrboxNotMaskedByHint(
  page: Page,
  viewport: { width: number; height: number },
): Promise<ErrboxHintProbe> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}#c`, { waitUntil: "networkidle" });
  await page.waitForSelector(".fl-errbox", { timeout: 15_000 });
  await page.waitForTimeout(200);
  return page.evaluate(`(() => {
    const vh = window.innerHeight;
    const body = document.querySelector(".fl-scroll-body");
    const hint = document.querySelector(".fl-scroll-hint");
    const texts = [
      ...document.querySelectorAll(".fl-errbox h2, .fl-errbox p, .fl-errbox li"),
    ];
    const intersectsHint = (tr, hr) =>
      tr.bottom > hr.top + 0.5 &&
      tr.top < hr.bottom - 0.5 &&
      tr.right > hr.left &&
      tr.left < hr.right;

    const countMasked = () => {
      if (!hint) return 0;
      const hr = hint.getBoundingClientRect();
      if (hr.height <= 0) return 0;
      let masked = 0;
      for (const el of texts) {
        const tr = el.getBoundingClientRect();
        if (tr.height > 0 && intersectsHint(tr, hr)) masked += 1;
      }
      return masked;
    };

    if (!body) {
      return { vh, hasHint: Boolean(hint), maskedTextNodes: countMasked(), maxScrollTop: 0 };
    }

    const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    body.scrollTop = maxScrollTop;
    const maskedAtEnd = countMasked();
    return {
      vh,
      hasHint: Boolean(hint),
      maskedTextNodes: maskedAtEnd,
      maxScrollTop,
    };
  })()`) as Promise<ErrboxHintProbe>;
}

describe("first-launch fold + Demucs focus (#199 / #196)", () => {
  let proc: ReturnType<typeof spawn> | undefined;
  let browser: Browser | undefined;

  before(async () => {
    proc = spawn(
      "pnpm",
      ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
      {
        cwd: ROOT,
        env: { ...process.env, VITE_CAPTURE: "1" },
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

  it("notice HTDemucs : police ≥ 14 px (état GPU)", async () => {
    const page = await browser!.newPage();
    try {
      const m = await measureFold(page, { width: 1280, height: 720 });
      assert.ok(
        m.noticeFontPx >= 14,
        `notice ${m.noticeFontPx}px < 14`,
      );
    } finally {
      await page.close();
    }
  });

  it("Reprendre visible sans scroll à 1280×720 (téléchargement interrompu)", async () => {
    const page = await browser!.newPage();
    try {
      const m = await measureInterrupted(page, { width: 1280, height: 720 });
      assert.equal(m.vh, 720);
      assert.equal(
        m.resumeInView,
        true,
        `Reprendre hors pli (bottom=${m.resumeBottom})`,
      );
    } finally {
      await page.close();
    }
  });

  it("Reprendre visible sans scroll à 1280×640 (téléchargement interrompu)", async () => {
    const page = await browser!.newPage();
    try {
      const m = await measureInterrupted(page, { width: 1280, height: 640 });
      assert.equal(m.vh, 640);
      assert.equal(
        m.resumeInView,
        true,
        `Reprendre hors pli (bottom=${m.resumeBottom})`,
      );
    } finally {
      await page.close();
    }
  });

  it("indicateur de défilement si récapitulatif masqué (640 et 720)", async () => {
    const page = await browser!.newPage();
    try {
      for (const height of [640, 720] as const) {
        const m = await measureSummaryScroll(page, {
          width: 1280,
          height,
        });
        assert.equal(m.vh, height);
        if (m.gridHiddenPx > 0) {
          assert.equal(
            m.dataScrollMore,
            "true",
            `data-scroll-more attendu @${height} (hidden=${m.gridHiddenPx}px)`,
          );
          assert.equal(
            m.scrollHintVisible,
            true,
            `indice de défilement absent @${height}`,
          );
        }
      }
    } finally {
      await page.close();
    }
  });

  it("région récap (Tab) : anneau focus 2 px cyan @1280×640", async () => {
    const page = await browser!.newPage();
    try {
      const proof = await measureGridTabFocus(page, { width: 1280, height: 640 });
      assert.equal(proof.matchesFocusVisible, true);
      assert.equal(proof.outlineStyle, "solid");
      assert.match(proof.outlineWidth, /^2(px)?$/);
      assert.match(proof.outlineColor, /rgb\(\s*94\s*,\s*236\s*,\s*248\s*\)/);
      assert.ok(
        contrastRatio("#5eecf8", "#221e2c") >= 3,
        "contraste anneau cyan / fond carte",
      );
    } finally {
      await page.close();
    }
  });

  it("texte d’erreur non masqué par « Suite — défiler » (640, 720, 768)", async () => {
    const page = await browser!.newPage();
    try {
      for (const height of [640, 720, 768] as const) {
        const m = await measureErrboxNotMaskedByHint(page, {
          width: 1280,
          height,
        });
        assert.equal(m.vh, height);
        assert.equal(
          m.maskedTextNodes,
          0,
          `texte d’erreur masqué @${height} (hint=${m.hasHint}, scrollMax=${m.maxScrollTop})`,
        );
      }
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

describe("first-launch notice markup (#196)", () => {
  it("n’importe pas SeparatorLicenseNotice ; texte partagé seulement", () => {
    const src = readFileSync(
      path.join(ROOT, "src/screens/FirstLaunchScreen.tsx"),
      "utf8",
    );
    const css = readFileSync(
      path.join(ROOT, "src/screens/FirstLaunchScreen.css"),
      "utf8",
    );
    assert.doesNotMatch(src, /SeparatorLicenseNotice/);
    assert.match(src, /firstLaunch\.license\.htdemucsNotice/);
    assert.match(src, /fl-htdemucs-notice/);
    assert.match(css, /font-size:\s*max\(14px/);
  });
});
