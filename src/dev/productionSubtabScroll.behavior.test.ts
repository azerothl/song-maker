/**
 * #203 — défilement vertical sous-onglets Clips et Outils (Production).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { chromium, type Browser, type Page } from "playwright";
import {
  MAIN_MIX_TRACK_ZONE_HEIGHT_PX,
  PRODUCTION_CLIPS_TOP_MIN_HEIGHT_PX,
  type ProductionSubtabScrollMetrics,
} from "./productionSubtabScrollMetrics";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const PORT = 5194;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;

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
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
}

async function measure(
  page: Page,
  hash: string,
  viewport: { width: number; height: number },
): Promise<ProductionSubtabScrollMetrics> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}#${hash}`, { waitUntil: "networkidle" });
  const selector = hash.includes("tools")
    ? '[data-testid="production-tools-scroll"]'
    : hash.includes("clips")
      ? '[data-testid="production-clips-scroll"]'
      : ".production-mix-scroll";
  await page.waitForSelector(selector, { timeout: 15_000, state: "visible" });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const mod = (
      window as Window & {
        __productionSubtabScrollMetrics?: () => ProductionSubtabScrollMetrics;
      }
    ).__productionSubtabScrollMetrics;
    if (!mod) throw new Error("__productionSubtabScrollMetrics manquant");
    return mod();
  });
}

describe("production subtab scroll (#203)", () => {
  let vite: ReturnType<typeof spawn> | null = null;
  let browser: Browser;

  before(async () => {
    let serverUp = false;
    try {
      const res = await fetch(
        `http://127.0.0.1:${PORT}/production-capture.html`,
      );
      serverUp = res.status < 500;
    } catch {
      serverUp = false;
    }
    if (!serverUp) {
      vite = spawn(
        "pnpm",
        ["exec", "vite", "--port", String(PORT), "--strictPort"],
        {
          cwd: ROOT,
          env: { ...process.env, VITE_CAPTURE: "1" },
          stdio: "ignore",
        },
      );
      await waitServer(`http://127.0.0.1:${PORT}/production-capture.html`);
    }
    browser = await launchBrowser();
  });

  after(async () => {
    await browser?.close();
    vite?.kill("SIGTERM");
  });

  for (const height of [720, 768, 640]) {
    it(`Mix 1280×${height} : panneaux masqués + zone pistes = main`, async () => {
      const page = await browser.newPage();
      const m = await measure(page, "confortable-12", {
        width: 1280,
        height,
      });
      await page.close();
      assert.equal(m.hiddenPanelsLeaking, false, "panneau [hidden] affiché");
      assert.equal(m.hiddenPanelLeaks.tools, false);
      assert.equal(m.hiddenPanelLeaks.clips, false);
      assert.ok(m.mix, "zone pistes mix absente");
      const expected = MAIN_MIX_TRACK_ZONE_HEIGHT_PX[height];
      assert.ok(
        Math.abs(m.mix!.trackZoneClientHeightPx - expected) <= 2,
        `zone pistes ${m.mix!.trackZoneClientHeightPx}px (attendu ${expected})`,
      );
    });

    it(`Outils 1280×${height} : zone défilante et rack atteignable`, async () => {
      const page = await browser.newPage();
      const m = await measure(page, "view-tools-12", {
        width: 1280,
        height,
      });
      await page.close();
      assert.equal(m.hiddenPanelsLeaking, false);
      assert.ok(m.tools, "panneau Outils absent");
      assert.ok(m.tools.scrolls);
      assert.ok(m.tools.rackEndReachable, "bas du rack d'effets atteignable");
    });

    it(`Clips 1280×${height} : bande haute ≥200 px et timeline défilante`, async () => {
      const page = await browser.newPage();
      const m = await measure(page, "view-clips-16", {
        width: 1280,
        height,
      });
      await page.close();
      assert.equal(m.hiddenPanelsLeaking, false);
      assert.ok(m.clips, "panneau Clips absent");
      assert.ok(
        m.clips.topClientHeightPx >= PRODUCTION_CLIPS_TOP_MIN_HEIGHT_PX,
        `bande haute ${m.clips.topClientHeightPx}px (min ${PRODUCTION_CLIPS_TOP_MIN_HEIGHT_PX})`,
      );
      assert.ok(m.clips.lanesClientHeightPx > 0);
      assert.ok(m.clips.topScrolls);
      assert.ok(m.clips.lanesScrolls, "timeline doit défiler");
      assert.ok(m.clips.topArrangementReachable);
      assert.ok(m.clips.lanesLastTrackReachable);
      assert.ok(m.clips.lanesRulerReachable);
      assert.equal(m.clips.lanesTabIndex, "0");
    });
  }

  it("barre mix inchangée (34 px barre, 32 px boutons en mode tight)", async () => {
    const page = await browser.newPage();
    const m = await measure(page, "confortable-12", {
      width: 1280,
      height: 720,
    });
    await page.close();
    assert.ok(m.mixToolbar);
    assert.ok(
      m.mixToolbar!.barHeightPx >= 33.5 && m.mixToolbar!.barHeightPx <= 34.5,
    );
    assert.ok(
      m.mixToolbar!.mixButtonHeightPx >= 31.5 &&
        m.mixToolbar!.mixButtonHeightPx <= 32.5,
    );
  });

  it("zone Outils atteignable au clavier (tabindex)", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#view-tools-12`);
    await page.waitForSelector('[data-testid="production-tools-scroll"]', {
      state: "visible",
    });
    const tabIndex = await page.$eval(
      '[data-testid="production-tools-scroll"]',
      (el) => el.getAttribute("tabindex"),
    );
    await page.close();
    assert.equal(tabIndex, "0");
  });

  it("Clips : défilement timeline au clavier (PageDown) avec focus lanes", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#view-clips-16`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="clip-timeline-lanes"]');
    const before = await page.$eval(
      '[data-testid="clip-timeline-lanes"]',
      (el) => (el as HTMLElement).scrollTop,
    );
    await page.focus('[data-testid="clip-timeline-lanes"]');
    await page.keyboard.press("PageDown");
    const after = await page.$eval(
      '[data-testid="clip-timeline-lanes"]',
      (el) => (el as HTMLElement).scrollTop,
    );
    await page.close();
    assert.ok(after > before, "PageDown doit faire défiler la timeline");
  });

  it("Clips : raccourcis clip (flèches) avec focus timeline", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#view-clips-16`, { waitUntil: "networkidle" });
    await page.waitForSelector(".clip-block");
    await page.locator(".clip-block").first().click();
    await page.waitForSelector(".clip-inspector");
    const startBefore = await page.$eval(
      ".clip-inspector .clip-field input",
      (el) => (el as HTMLInputElement).value,
    );
    await page.focus('[data-testid="clip-timeline-lanes"]');
    await page.keyboard.press("ArrowRight");
    const startAfter = await page.$eval(
      ".clip-inspector .clip-field input",
      (el) => (el as HTMLInputElement).value,
    );
    await page.close();
    assert.notEqual(
      startBefore,
      startAfter,
      "ArrowRight avec focus timeline doit déplacer le clip sélectionné",
    );
  });

  it("Clips : champs bande haute — grille, BPM et Home natifs (inField)", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#view-clips-16`, { waitUntil: "networkidle" });
    await page.waitForSelector(".clip-timeline-tools select");

    const gridSelect = page
      .locator(".clip-timeline-tools .clip-tool-select")
      .first()
      .locator("select");
    assert.equal(await gridSelect.inputValue(), "musical");
    await gridSelect.focus();
    await page.keyboard.press("ArrowDown");
    assert.equal(
      await gridSelect.inputValue(),
      "time",
      "ArrowDown dans la liste grille doit changer l'option (musical→time)",
    );

    const bpmInput = page
      .locator(".clip-tempo-editor input[type='number']")
      .first();
    assert.equal(await bpmInput.inputValue(), "120");
    await bpmInput.focus();
    await page.keyboard.press("ArrowUp");
    assert.equal(
      await bpmInput.inputValue(),
      "121",
      "ArrowUp dans le BPM doit incrémenter (120→121)",
    );

    const markerName = page.locator(
      '.clip-marker-editor input[type="text"]',
    );
    await markerName.focus();
    await markerName.fill("abcdefX");
    await page.evaluate(() => {
      const el = document.querySelector(
        '.clip-marker-editor input[type="text"]',
      ) as HTMLInputElement | null;
      if (!el) throw new Error("champ nom de repère introuvable");
      el.setSelectionRange(7, 7);
    });
    await page.keyboard.press("Home");
    const selStart = await markerName.evaluate(
      (el) => (el as HTMLInputElement).selectionStart,
    );
    await page.close();
    assert.equal(
      selStart,
      0,
      "Home doit placer le curseur au début du champ texte",
    );
  });

  it("Clips : défilement bande haute au clavier (PageDown)", async () => {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${BASE}#view-clips-16`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="production-clips-scroll"]');
    const before = await page.$eval(
      '[data-testid="production-clips-scroll"]',
      (el) => (el as HTMLElement).scrollTop,
    );
    await page.focus('[data-testid="production-clips-scroll"]');
    await page.keyboard.press("PageDown");
    const after = await page.$eval(
      '[data-testid="production-clips-scroll"]',
      (el) => (el as HTMLElement).scrollTop,
    );
    await page.close();
    assert.ok(after > before, "PageDown doit faire défiler la bande haute");
  });
});
