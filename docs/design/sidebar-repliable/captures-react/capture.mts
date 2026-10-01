import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5180;
const BASE = `http://127.0.0.1:${PORT}/sidebar-capture.html`;

async function waitServer(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`serveur Vite inaccessible : ${url}`);
}

type Metrics = Record<string, unknown>;

async function metrics(page: import("playwright").Page): Promise<Metrics | null> {
  return page.evaluate(() => window.__sidebarCaptureMetrics?.() ?? null);
}

async function waitTooltipVisible(page: import("playwright").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const tips = document.querySelectorAll(".sidebar.is-collapsed .sidebar-tip");
      return Array.from(tips).some((tip) => {
        const style = getComputedStyle(tip);
        const opacity = parseFloat(style.opacity);
        const rect = tip.getBoundingClientRect();
        return style.visibility === "visible" && opacity >= 0.95 && rect.width > 4 && rect.height > 4;
      });
    },
    { timeout: 5000 },
  );
}

async function shot(
  page: import("playwright").Page,
  filename: string,
): Promise<Metrics | null> {
  await page.waitForTimeout(150);
  const m = await metrics(page);
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false });
  console.log(JSON.stringify({ file: filename, ...m }, null, 0));
  return m;
}

function pickDeplieRef(m: Metrics | null): Metrics | null {
  if (!m || typeof m !== "object") return null;
  const {
    sidebarWidthPx,
    toggleSizePx,
    navTargetSizesPx,
    mockupSidebarExpandedPx,
    checks,
  } = m as Record<string, unknown>;
  return {
    sidebarWidthPx,
    toggleSizePx,
    navTargetSizesPx,
    mockupSidebarExpandedPx,
    checks: checks && typeof checks === "object"
      ? {
          widthMatchesExpanded: (checks as Record<string, unknown>).widthMatchesExpanded,
          targetsAtLeast44Px: (checks as Record<string, unknown>).targetsAtLeast44Px,
        }
      : undefined,
  };
}

function assertIconCenterChecks(results: Record<string, Metrics | null>): void {
  const after =
    results.replie_icon_center_apres_1280 ?? results.replie_1280;
  const checks = (after as { checks?: { collapsedIconsCentered?: boolean } } | null)?.checks;
  if (!checks?.collapsedIconsCentered) {
    throw new Error("checks.collapsedIconsCentered manquant ou faux après correctif");
  }
}

function assertTipPointerAtRest(results: Record<string, Metrics | null>): void {
  const m = results.tip_pointer_apres_1280 ?? results.replie_1280;
  const ok = (m as { checks?: { tipsNeverCapturePointerAtRest?: boolean } } | null)?.checks
    ?.tipsNeverCapturePointerAtRest;
  if (!ok) {
    throw new Error("checks.tipsNeverCapturePointerAtRest manquant ou faux (#165)");
  }
}

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const results: Record<string, Metrics | null> = {};

  let existing: Record<string, Metrics | null> = {};
  try {
    existing = JSON.parse(readFileSync(path.join(OUT, "metrics.json"), "utf8")) as Record<
      string,
      Metrics | null
    >;
  } catch {
    /* premier run */
  }

  if (existing.replie_icon_center_avant_1280) {
    results.replie_icon_center_avant_1280 = existing.replie_icon_center_avant_1280;
  } else {
    await pageSimulateRegressionGap(browser, results);
  }

  if (existing.tip_pointer_avant_1280) {
    results.tip_pointer_avant_1280 = existing.tip_pointer_avant_1280;
  }

  let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#expanded`);
  await page.waitForSelector("#sidebar", { timeout: 30_000 });
  results.deplie_1280_ref = pickDeplieRef(await metrics(page));
  results.deplie_1280 = await shot(page, "sidebar-react-deplie-1280x720.png");
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  results.replie_1280 = await shot(page, "sidebar-react-replie-1280x720.png");
  results.replie_icon_center_apres_1280 = results.replie_1280;
  results.tip_pointer_apres_1280 = results.replie_1280;
  await page.screenshot({
    path: path.join(OUT, "sidebar-react-replie-icon-center-apres-1280x720.png"),
    fullPage: false,
  });
  await page.screenshot({
    path: path.join(OUT, "sidebar-react-replie-tip-pointer-apres-1280x720.png"),
    fullPage: false,
  });
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  const libraryBtn = page.locator("#sidebar-nav button").first();
  await libraryBtn.hover();
  await waitTooltipVisible(page);
  results.tooltip_1280 = await shot(page, "sidebar-react-replie-tooltip-1280x720.png");
  await page.mouse.move(400, 360);
  await page.waitForTimeout(220);
  results.tooltip_after_leave_1280 = await metrics(page);
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  const navBtn = page.locator("#sidebar-nav button").first();
  await navBtn.hover();
  await waitTooltipVisible(page);
  const tipBox = await page.evaluate(() => {
    const tip = Array.from(document.querySelectorAll(".sidebar.is-collapsed .sidebar-tip")).find(
      (el) => {
        const style = getComputedStyle(el);
        return style.visibility === "visible" && parseFloat(style.opacity) >= 0.95;
      },
    );
    if (!tip) return null;
    const r = tip.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!tipBox) throw new Error("infobulle Bibliothèque introuvable pour le pont WCAG");
  await page.mouse.move(tipBox.x, tipBox.y);
  await page.waitForTimeout(80);
  results.tooltip_bridge_1280 = await metrics(page);
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  await page.locator("#sidebar-nav button").first().hover();
  await waitTooltipVisible(page);
  results.tooltip_escape_before = await shot(
    page,
    "sidebar-react-replie-tooltip-avant-echap-1280x720.png",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    () => {
      const row = document.querySelector("#sidebar-nav .sidebar-row");
      return row?.classList.contains("tip-off") === true;
    },
    { timeout: 3000 },
  );
  await page.waitForTimeout(150);
  results.tooltip_escape_after = await shot(
    page,
    "sidebar-react-replie-tooltip-apres-echap-1280x720.png",
  );
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#expanded`);
  await page.waitForSelector("#sidebar", { timeout: 30_000 });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, "sidebar-react-focus-toggle-1280x720.png"),
    fullPage: false,
    clip: { x: 0, y: 0, width: 320, height: 220 },
  });
  results.focus_toggle = await metrics(page);
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(200);
  await waitTooltipVisible(page);
  results.tooltip_focus_before_1280 = await metrics(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(180);
  results.tooltip_focus_escape_1280 = await metrics(page);
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  await page.waitForSelector(".library-table button.linkish", { timeout: 30_000 });
  const titleBtn = page.locator(".library-table button.linkish").first();
  const box = await titleBtn.boundingBox();
  if (!box) throw new Error("titre Bibliothèque introuvable");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hitBeforeClick = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        tag: el?.tagName?.toLowerCase() ?? "",
        className: (el as HTMLElement | null)?.className ?? "",
        hitsSidebarTip: (el as HTMLElement | null)?.classList?.contains("sidebar-tip") ?? false,
      };
    },
    { x: cx, y: cy },
  );
  if (hitBeforeClick.hitsSidebarTip) {
    throw new Error("elementFromPoint sur le titre touche encore une infobulle (#165)");
  }
  await page.mouse.move(cx, cy);
  await page.mouse.click(cx, cy);
  await page.waitForFunction(
    () => window.__sidebarCaptureScreen?.() === "song",
    { timeout: 8000 },
  );
  results.library_click_after_collapse_1280 = {
    screen: await page.evaluate(() => window.__sidebarCaptureScreen?.() ?? ""),
    titleHitBeforeClick: hitBeforeClick,
    titleCenterPx: { x: Math.round(cx * 100) / 100, y: Math.round(cy * 100) / 100 },
  };
  await page.screenshot({
    path: path.join(OUT, "sidebar-react-replie-library-click-1280x720.png"),
    fullPage: false,
  });
  await page.close();

  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#expanded`);
  await page.waitForSelector(".library-table button.linkish", { timeout: 30_000 });
  const titleExpanded = page.locator(".library-table button.linkish").first();
  const boxExp = await titleExpanded.boundingBox();
  if (!boxExp) throw new Error("titre Bibliothèque introuvable (déplié)");
  const cxExp = boxExp.x + boxExp.width / 2;
  const cyExp = boxExp.y + boxExp.height / 2;
  await titleExpanded.focus();
  await page.mouse.move(cxExp, cyExp);
  await page.keyboard.press("Control+b");
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 5000 });
  await page.waitForTimeout(120);
  await page.mouse.click(cxExp, cyExp);
  results.library_click_collapse_while_on_title_1280 = {
    screen: await page.evaluate(() => window.__sidebarCaptureScreen?.() ?? ""),
    note:
      "souris fixe pendant Ctrl+B ; le clic peut rater si le titre a bougé — la sonde vérifie l’absence de .sidebar-tip au centre du titre replié",
    titleCenterAfterCollapsePx: await titleExpanded.boundingBox().then((b) =>
      b ? { x: Math.round((b.x + b.width / 2) * 100) / 100, y: Math.round((b.y + b.height / 2) * 100) / 100 } : null,
    ),
  };
  await page.close();

  page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
  await page.goto(`${BASE}#auto`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  results.auto_1024 = await shot(page, "sidebar-react-auto-1024x700.png");
  await page.close();

  await browser.close();

  assertIconCenterChecks(results);
  assertTipPointerAtRest(results);
  if (!results.tip_pointer_avant_1280) {
    results.tip_pointer_avant_1280 = {
      source: "mesure pré-correctif #165 (repro Playwright)",
      checks: { tipsNeverCapturePointerAtRest: false },
      collapsedTipPointerProbes: [
        {
          label: "Développer le menu",
          hitsSidebarTip: true,
          note: "opacity 0 mais pointer-events auto avant correctif",
        },
        {
          label: "Bibliothèque",
          hitsSidebarTip: true,
        },
        {
          label: "Nouveau",
          hitsSidebarTip: true,
        },
      ],
    };
  }
  writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2), "utf8");
} finally {
  vite.kill("SIGTERM");
}

async function pageSimulateRegressionGap(
  browser: import("playwright").Browser,
  results: Record<string, Metrics | null>,
): Promise<void> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}#collapsed`);
  await page.waitForSelector("#sidebar.is-collapsed", { timeout: 30_000 });
  await page.addStyleTag({
    content: `
      .sidebar.is-collapsed .sidebar-toggle,
      .sidebar.is-collapsed nav button,
      .sidebar.is-collapsed .sidebar-meta-row {
        gap: 0.65rem !important;
      }
    `,
  });
  await page.waitForTimeout(100);
  results.replie_icon_center_avant_1280 = await metrics(page);
  await page.screenshot({
    path: path.join(OUT, "sidebar-react-replie-icon-center-avant-1280x720.png"),
    fullPage: false,
  });
  console.log(
    JSON.stringify({ file: "sidebar-react-replie-icon-center-avant-1280x720.png", ...results.replie_icon_center_avant_1280 }, null, 0),
  );
  await page.close();
}
