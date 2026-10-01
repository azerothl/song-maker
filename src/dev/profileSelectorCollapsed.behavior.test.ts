/**
 * #215 — popover profil (barre repliée) : mesures, empilement, clavier.
 */
import assert from "node:assert/strict";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import type { ProfilePopoverMetrics } from "./profileIssue215Metrics";

const PORT = 5198;
const BASE = `http://127.0.0.1:${PORT}/profiles-app-capture.html`;
/** Réf. main ~401.7 (Chrome local) ; Actions CI ~368.7 (polices). Régression ellipsis : ~281.7. */
const EXPANDED_MENU_HEIGHT_MIN_PX = 350;
const EXPANDED_MENU_HEIGHT_MAX_PX = 430;

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
  return chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

async function waitFocusOnTrigger(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute("data-testid") === "profile-selector-trigger",
    undefined,
    { timeout: 5_000 },
  );
}

async function popoverMetrics(
  page: Page,
  viewport: { width: number; height: number },
): Promise<ProfilePopoverMetrics> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}#selector-collapsed-open`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="profile-selector-menu"]', {
    timeout: 15_000,
  });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => {
    const fn = window.__profileIssue215PopoverMetrics;
    if (!fn) throw new Error("__profileIssue215PopoverMetrics manquant");
    const result = fn();
    if (!result) throw new Error("mesures popover nulles");
    return result;
  });
  return m as ProfilePopoverMetrics;
}

describe("profile selector collapsed popover (#215)", () => {
  let vite: ViteDevServer | null = null;
  let browser: Browser;

  before(async () => {
    let serverUp = false;
    try {
      const res = await fetch(BASE);
      serverUp = res.status < 500;
    } catch {
      serverUp = false;
    }
    if (!serverUp) {
      vite = await startCaptureViteServer(PORT);
      await waitServer(BASE);
    }
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    if (vite) {
      await stopCaptureViteServer(vite);
      await new Promise((r) => setTimeout(r, 400));
    }
  });

  for (const width of [1280, 1024, 640]) {
    it(`popover mesures barre repliée @ ${width}px`, async () => {
      const page = await browser.newPage();
      const m = await popoverMetrics(page, { width, height: 720 });
      assert.equal(m.overlap.overlapsTrigger, false, "recouvrement bouton");
      assert.equal(m.overlap.overlapsSidebar, false, "recouvrement barre");
      assert.equal(m.overlap.withinViewport, true, "hors viewport");
      assert.ok(Math.abs(m.popover.width - Math.min(288, width - 56 - 16)) < 1.5, "largeur");
      assert.ok(Math.abs(m.gapTriggerToPopoverPx - 8) < 1, "écart 8px");
      assert.equal(m.menuZIndex, "40", "z-index menu");
      assert.equal(m.sidebarZIndex, "30", "z-index barre repliée");
      assert.notEqual(m.menuMaxHeight, "none", "max-height menu");
      assert.equal(m.menuOverflowY, "auto", "overflow-y menu");
      const long = m.labels.find((l) => l.nameTitle.includes("vos projets"));
      assert.ok(long?.nameTruncated, "nom long tronqué");
      assert.ok(long && long.nameTitle.length > 0 && long.metaTitle.length > 0, "title");
      const covered = await page.evaluate(() => {
        const menu = document.querySelector('[data-testid="profile-selector-menu"]');
        if (!menu) return false;
        const r = menu.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + Math.min(40, r.height / 2);
        const top = document.elementFromPoint(cx, cy);
        return menu.contains(top) || menu === top;
      });
      assert.equal(covered, true, "popover au-dessus du contenu .main");
      await page.close();
    });
  }

  it("barre dépliée menu ouvert — hauteur alignée main (B1)", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#selector-open`, { waitUntil: "networkidle" });
    await page.waitForSelector("#sidebar:not(.is-collapsed)");
    await page.waitForSelector('[data-testid="profile-selector-menu"]');
    await page.evaluate(() => document.fonts.ready);
    const expanded = await page.evaluate(() => {
      const fn = window.__profileIssue215ExpandedMenu;
      if (!fn) throw new Error("__profileIssue215ExpandedMenu manquant");
      return fn();
    });
    assert.ok(expanded, "mesures menu déplié");
    assert.ok(
      expanded.menuHeight >= EXPANDED_MENU_HEIGHT_MIN_PX &&
        expanded.menuHeight <= EXPANDED_MENU_HEIGHT_MAX_PX,
      `hauteur menu ${expanded.menuHeight} hors plage B1 [${EXPANDED_MENU_HEIGHT_MIN_PX}, ${EXPANDED_MENU_HEIGHT_MAX_PX}]`,
    );
    assert.equal(expanded.nameTruncated, false, "libellés non tronqués barre dépliée");
    await page.close();
  });

  it("6 profils repliés — popover dans le viewport (640px haut)", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto(`${BASE}#many-profiles-collapsed-menu-open`, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector('[data-testid="profile-selector-menu"]');
    const m = await page.evaluate(() => {
      const fn = window.__profileIssue215MenuSixViewport;
      if (!fn) throw new Error("__profileIssue215MenuSixViewport manquant");
      return fn();
    });
    assert.ok(m?.popoverWithinViewport, "popover 6 profils dans le viewport");
    await page.close();
  });

  it("Échap, clic extérieur, Tab piégé, focus bouton", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#selector-collapsed-open`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="profile-selector-menu"]');

    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="profile-selector-menu"]', {
      state: "detached",
    });
    await waitFocusOnTrigger(page);

    await page.click('[data-testid="profile-selector-trigger"]');
    await page.waitForSelector('[data-testid="profile-selector-menu"]');
    await page.evaluate(() => {
      const main = document.querySelector(".main");
      main?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await page.waitForSelector('[data-testid="profile-selector-menu"]', {
      state: "detached",
    });
    await waitFocusOnTrigger(page);

    await page.click('[data-testid="profile-selector-trigger"]');
    await page.waitForSelector('[data-testid="profile-selector-menu"]');
    const firstFocus = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    await page.keyboard.press("Tab");
    const secondFocus = await page.evaluate(() =>
      document.activeElement?.getAttribute("data-testid"),
    );
    assert.notEqual(firstFocus, secondFocus);
    assert.ok(secondFocus?.startsWith("profile-menu"));

    await page.close();
  });
});
