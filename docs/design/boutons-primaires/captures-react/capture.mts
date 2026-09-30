/**
 * Captures + mesures de contraste pour `.btn.primary` (#186).
 *
 * Usage : pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
 */
import { createHash } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5191;
const AA_MIN = 4.5;
const DISABLED_MIN = 3;
const VIEWPORT = { width: 1280, height: 720 };
const MEASURE_JS = path.join(__dirname, "measure-in-page.js");

type StateName = "normal" | "hover" | "focus" | "disabled";

type StopMeasure = {
  stop: string;
  backgroundCss: string;
  backgroundHex: string;
  ratio: number;
  pass: boolean;
};

type FocusProof = {
  matchesFocusVisible: boolean;
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  cursor: string;
  mouseAway: boolean;
  backdropHex?: string;
  outlineContrastRatio?: number | null;
  outlineContrastRatioMax?: number | null;
  outlineContrastOnFaceMin?: number | null;
  focusRingInsetSepContrast?: number | null;
  focusInsetSepVsFace?: number | null;
};

type PopinCompare = {
  primarySel: string;
  secondarySel: string;
  primaryFaceHex: string | null;
  secondaryFaceHex: string | null;
  primaryBorderHex: string | null;
  secondaryBorderHex: string | null;
  deltaE00Face: number;
  deltaE00Border: number | null;
  borderContrastRatio: number | null;
  borderContrastRatioOnPopin: number | null;
  bordersMatch: boolean;
};

type StateMeasure = {
  state: StateName;
  foregroundCss: string;
  foregroundHex: string;
  opacity: number;
  stops: StopMeasure[];
  minRatio: number;
  pass: boolean;
  focusProof?: FocusProof;
  disabledProof?: { nativeDisabled: boolean; note?: string };
};

type ScreenMeasure = {
  id: string;
  screen: string;
  selector: string;
  label: string;
  captureFiles: string[];
  states: StateMeasure[];
  pass: boolean;
  popinCompare?: PopinCompare;
  forcedHarness?: boolean;
  harnessNote?: string;
  normalInViewport?: boolean;
};

type DisabledMode =
  | "forced"
  | "busy-create"
  | "busy-export-trigger"
  | "busy-export-popin"
  | "export-stems-none-aria"
  | "regen-blocked-aria"
  | "n/a";

type ShotTarget = "viewport" | "button-clip";

type I3FocusCapture = {
  filename: string;
  selector: string;
};

type Scenario = {
  id: string;
  screen: string;
  path: string;
  hash?: string;
  selector: string;
  disabledMode?: DisabledMode;
  secondarySelector?: string;
  prepare?: (page: Page) => Promise<void>;
  popinCompare?: boolean;
  shotTarget?: ShotTarget;
  forcedHarness?: boolean;
  harnessNote?: string;
  /** Exporter barre mix (anneau coupé) — focus Tab, cyan obligatoire dans le clip bouton. */
  i3FocusCapture?: I3FocusCapture;
};

const SCENARIOS: Scenario[] = [
  {
    id: "bibliotheque",
    screen: "Bibliothèque",
    path: "/sidebar-capture.html",
    selector: ".panel.library .btn.primary",
    disabledMode: "n/a",
    shotTarget: "button-clip",
  },
  {
    id: "creer",
    screen: "Créer",
    path: "/create-capture.html",
    selector: ".song-create-generate-btn",
    disabledMode: "busy-create",
    shotTarget: "button-clip",
    prepare: async (page) => {
      await page
        .locator(".song-create-generate-btn")
        .first()
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
    },
  },
  {
    id: "production-armer",
    screen: "Production — Armer",
    path: "/production-capture.html",
    hash: "#12,confortable,record-open",
    selector: ".record-panel button.btn.primary",
    disabledMode: "forced",
    prepare: async (page) => {
      await page.locator(".production-actions-drawer").evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
      await page.waitForSelector(".record-panel button.btn.primary", {
        timeout: 15_000,
      });
      await page
        .locator(".record-panel button.btn.primary")
        .first()
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
    },
    shotTarget: "button-clip",
  },
  {
    id: "production-exporter",
    screen: "Production — Exporter (déclencheur)",
    path: "/production-capture.html",
    hash: "#12,confortable,view-mix",
    selector: ".song-actions-export button.btn.primary",
    disabledMode: "busy-export-trigger",
    prepare: async (page) => {
      await page.locator(".production-actions-drawer").evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
      await page.waitForSelector(".song-actions-export button.btn.primary", {
        timeout: 15_000,
      });
      await page
        .locator(".song-actions-export button.btn.primary")
        .first()
        .scrollIntoViewIfNeeded();
    },
    shotTarget: "button-clip",
    i3FocusCapture: {
      filename: "production-exporter-bar-focus-i3-clip.png",
      selector:
        ".production-mix-toolbar-actions [data-capture-export-trigger]",
    },
  },
  {
    id: "production-export-popin",
    screen: "Production — Exporter (popin)",
    path: "/production-capture.html",
    hash: "#12,confortable,view-mix",
    selector: ".export-dialog-actions-end .btn.primary",
    secondarySelector: ".export-dialog-actions .btn.ghost",
    disabledMode: "busy-export-popin",
    popinCompare: true,
    prepare: async (page) => {
      await page.locator(".production-actions-drawer").evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
      const trigger = ".song-actions-export button.btn.primary";
      await page.waitForSelector(trigger, { timeout: 15_000 });
      await page.click(trigger);
      await page.waitForSelector(".export-dialog-popin", { timeout: 10_000 });
      await page
        .locator(".export-dialog-actions-end .btn.primary")
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
  },
  {
    id: "production-export-popin-aria",
    screen: "Production — Exporter (popin, 0 piste)",
    path: "/production-capture.html",
    hash: "#12,confortable,view-mix",
    selector: ".export-dialog-actions-end .btn.primary",
    disabledMode: "export-stems-none-aria",
    prepare: async (page) => {
      await page.locator(".production-actions-drawer").evaluate((el) => {
        (el as HTMLDetailsElement).open = true;
      });
      const trigger = ".song-actions-export button.btn.primary";
      await page.waitForSelector(trigger, { timeout: 15_000 });
      await page.click(trigger);
      await page.waitForSelector(".export-dialog-popin", { timeout: 10_000 });
      await page.locator('input[name="export-mode"]').nth(1).click();
      await page.waitForSelector(".export-stem-list input[type='checkbox']", {
        timeout: 10_000,
      });
      await page.waitForTimeout(200);
      await page
        .locator(".export-dialog-actions-end .btn.primary")
        .scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
    },
    shotTarget: "button-clip",
  },
  {
    id: "production-mesurer",
    screen: "Production — Mesurer le mix rendu",
    path: "/production-capture.html",
    hash: "#12,confortable,view-tools",
    selector: ".phase3-actions button.btn.primary",
    disabledMode: "forced",
    prepare: async (page) => {
      await page.waitForSelector(".phase3-actions button.btn.primary", {
        timeout: 15_000,
      });
      await page
        .locator(".phase3-actions button.btn.primary")
        .first()
        .scrollIntoViewIfNeeded();
    },
  },
  {
    id: "production-zip",
    screen: "Production — Créer l'archive ZIP",
    path: "/production-capture.html",
    hash: "#12,confortable,view-tools",
    selector: ".export-wizard button.btn.primary",
    disabledMode: "forced",
    prepare: async (page) => {
      await page.waitForSelector(".export-wizard button.btn.primary", {
        timeout: 15_000,
      });
      await page
        .locator(".export-wizard button.btn.primary")
        .first()
        .scrollIntoViewIfNeeded();
    },
  },
  {
    id: "reglages-lora",
    screen: "Réglages — LoRA",
    path: "/settings-capture.html",
    selector: ".phase3-lora-list button.btn.primary",
    disabledMode: "forced",
    prepare: async (page) => {
      await page.waitForSelector(".phase3-lora-list button.btn.primary", {
        timeout: 20_000,
      });
      await page.evaluate(() => {
        const btn = document.querySelector(
          ".phase3-lora-list button.btn.primary:not([disabled])",
        ) as HTMLButtonElement | null;
        if (!btn) {
          const any = document.querySelector(
            ".phase3-lora-list button.btn.primary",
          ) as HTMLButtonElement | null;
          if (any) any.disabled = false;
        }
      });
      await page
        .locator(".phase3-lora-list button.btn.primary")
        .first()
        .scrollIntoViewIfNeeded();
    },
  },
  {
    id: "confirmation-regeneration-gate",
    screen: "Confirmation — RegenerationGate (actif)",
    path: "/confirm-dialogs-capture.html",
    hash: "#regeneration-gate",
    selector: ".regeneration-gate button.btn.primary, .modal.regeneration-gate .btn-row .btn.primary",
    disabledMode: "forced",
  },
  {
    id: "regeneration-gate-blocked",
    screen: "RegenerationGate — primaire bloqué",
    path: "/regen-gate-capture.html",
    selector: ".modal.regeneration-gate .btn-row .btn.primary",
    secondarySelector: ".modal.regeneration-gate .btn-row .btn.ghost",
    disabledMode: "regen-blocked-aria",
    popinCompare: true,
    forcedHarness: true,
    harnessNote:
      "État inatteignable dans l’app réelle : `SongScreen.tsx:339` ouvre le gate seulement si `scoreDocument && isRegen` ; ce harnais force `beforeDocument={null}`.",
    shotTarget: "button-clip",
  },
  {
    id: "confirmation-invariant-panel",
    screen: "Confirmation — InvariantPanel",
    path: "/confirm-dialogs-capture.html",
    hash: "#invariant-panel",
    selector: ".invariant-panel button.btn.primary",
    disabledMode: "forced",
  },
  {
    id: "confirmation-remote-generate",
    screen: "Confirmation — RemoteGenerateConfirm",
    path: "/confirm-dialogs-capture.html",
    hash: "#remote-generate-confirm",
    selector: ".remote-generate-confirm button.btn.primary",
    disabledMode: "forced",
  },
  {
    id: "confirmation-separation-recommend",
    screen: "Confirmation — SeparationRecommendDialog",
    path: "/confirm-dialogs-capture.html",
    hash: "#separation-recommend",
    selector:
      ".separation-recommend-popin button.btn.primary, button.btn.primary",
    disabledMode: "forced",
    prepare: async (page) => {
      await page.waitForSelector("button.btn.primary", { timeout: 15_000 });
    },
  },
  {
    id: "confirmation-update-notice",
    screen: "Confirmation — UpdateNotice",
    path: "/confirm-dialogs-capture.html",
    hash: "#update-notice",
    selector: ".update-notice button.btn.primary",
    disabledMode: "forced",
  },
];

declare global {
  interface Window {
    __measurePrimaryBtnState?: (
      sel: string,
      stateName: StateName,
    ) => StateMeasure;
    __measurePopinDisabledVsSecondary?: (
      primarySel: string,
      secondarySel: string,
    ) => PopinCompare;
    __captureSetGenerateBusy?: (busy: boolean) => void;
    __productionCaptureSetBusy?: (busy: boolean) => void;
  }
}

async function waitServer(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`serveur Vite inaccessible : ${url}`);
}

async function injectMeasure(page: Page): Promise<void> {
  await page.addScriptTag({ path: MEASURE_JS });
}

async function mouseAway(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

async function keyboardFocusVisible(
  page: Page,
  selector: string,
): Promise<void> {
  await mouseAway(page);
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel) as HTMLElement | null;
    if (!btn) throw new Error(`bouton introuvable : ${sel}`);
    document.getElementById("__a11y-focus-trap")?.remove();
    const trap = document.createElement("button");
    trap.type = "button";
    trap.id = "__a11y-focus-trap";
    trap.setAttribute("aria-hidden", "true");
    trap.tabIndex = 0;
    trap.style.cssText =
      "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    btn.parentElement?.insertBefore(trap, btn);
    trap.focus();
  }, selector);
  await page.keyboard.press("Tab");
  await mouseAway(page);
  await page.waitForTimeout(50);
}

async function clearFocusTrap(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById("__a11y-focus-trap")?.remove();
  });
}

async function resetInteraction(page: Page, selector: string): Promise<void> {
  await mouseAway(page);
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = false;
    btn.blur();
  }, selector);
  await page.evaluate(() => {
    window.__captureSetGenerateBusy?.(false);
    window.__productionCaptureSetBusy?.(false);
  });
  await clearFocusTrap(page);
}

async function applyDisabledMode(
  page: Page,
  selector: string,
  mode: DisabledMode,
): Promise<void> {
  if (mode === "n/a") return;
  await resetInteraction(page, selector);
  if (mode === "busy-create") {
    await page.evaluate(() => window.__captureSetGenerateBusy?.(true));
    await page.waitForTimeout(200);
    return;
  }
  if (mode === "busy-export-trigger" || mode === "busy-export-popin") {
    await page.evaluate(() => window.__productionCaptureSetBusy?.(true));
    await page.waitForTimeout(200);
    return;
  }
  if (mode === "regen-blocked-aria") {
    return;
  }
  if (mode === "export-stems-none-aria") {
    const boxes = page.locator(".export-stem-list input[type='checkbox']");
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      const box = boxes.nth(i);
      if (await box.isChecked()) {
        await box.click();
        await page.waitForTimeout(40);
      }
    }
    await page.waitForSelector('[data-testid="export-disabled-reason"]', {
      timeout: 10_000,
    });
    await page.waitForTimeout(150);
    return;
  }
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel) as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
  }, selector);
}

function captureFilename(
  id: string,
  state: StateName,
  shotTarget: ShotTarget = "viewport",
): string {
  if (shotTarget === "button-clip") {
    return `${id}-primary-${state}-clip.png`;
  }
  return `${id}-primary-${state}-1280x720.png`;
}

const CLIP_PAD_PX = 14;
const CLIP_PAD_FOCUS_PX = 22;

function clipPadForState(state?: StateName): number {
  return state === "focus" ? CLIP_PAD_FOCUS_PX : CLIP_PAD_PX;
}

async function buttonClipRect(
  page: Page,
  selector: string,
  state?: StateName,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) {
    throw new Error(`cadrage bouton impossible : ${selector}`);
  }
  const pad = clipPadForState(state);
  return {
    x: Math.max(0, Math.floor(box.x - pad)),
    y: Math.max(0, Math.floor(box.y - pad)),
    width: Math.ceil(box.width + pad * 2),
    height: Math.ceil(box.height + pad * 2),
  };
}

async function assertButtonInsideClip(
  page: Page,
  selector: string,
  state?: StateName,
): Promise<void> {
  const ok = await page.evaluate(
    ({ sel, pad }) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const clipLeft = Math.max(0, r.left - pad);
      const clipTop = Math.max(0, r.top - pad);
      const clipRight = r.right + pad;
      const clipBottom = r.bottom + pad;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      return (
        cx >= clipLeft &&
        cx <= clipRight &&
        cy >= clipTop &&
        cy <= clipBottom
      );
    },
    { sel: selector, pad: clipPadForState(state) },
  );
  if (!ok) {
    throw new Error(`bouton hors clip ±${clipPadForState(state)} px : ${selector}`);
  }
}

async function captureButtonClip(
  page: Page,
  selector: string,
  state?: StateName,
): Promise<Buffer> {
  await assertButtonInsideClip(page, selector, state);
  const clip = await buttonClipRect(page, selector, state);
  return page.screenshot({
    clip,
    fullPage: false,
    animations: "disabled",
  });
}

async function shot(
  page: Page,
  scenario: Scenario,
  filename: string,
  state?: StateName,
): Promise<Buffer> {
  const target = scenario.shotTarget ?? "viewport";
  let buffer: Buffer;
  if (target === "button-clip") {
    buffer = await captureButtonClip(page, scenario.selector, state);
  } else {
    buffer = await page.screenshot({
      fullPage: false,
      animations: "disabled",
    });
  }
  await writeFile(path.join(OUT, filename), buffer);
  return buffer;
}

const MIN_DISABLED_FACE_PX = 40;
const MIN_DISABLED_BORDER_PX = 20;
const MIN_ACTIVE_ACCENT_PX = 30;

type ClipPixelKind = "disabled-face" | "disabled-border" | "accent-face";

async function countClipPixels(
  page: Page,
  pngBase64: string,
  kind: ClipPixelKind,
): Promise<number> {
  return page.evaluate(
    async ([b64, pixelKind]) => {
      const blob = await fetch(`data:image/png;base64,${b64}`).then((r) =>
        r.blob(),
      );
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return 0;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 120) continue;
        let match = false;
        if (pixelKind === "disabled-face") {
          match =
            r >= 14 && r <= 22 && g >= 18 && g <= 26 && b >= 26 && b <= 36;
        } else if (pixelKind === "disabled-border") {
          match =
            r >= 98 &&
            r <= 112 &&
            g >= 108 &&
            g <= 122 &&
            b >= 138 &&
            b <= 156;
        } else {
          match =
            (r >= 150 && g >= 120 && b >= 240) ||
            (r >= 155 && g >= 125 && b >= 235 && r < 200);
        }
        if (match) n += 1;
      }
      return n;
    },
    [pngBase64, kind] as [string, ClipPixelKind],
  );
}

async function assertDisabledButtonClip(
  page: Page,
  pngBase64: string,
  label: string,
): Promise<void> {
  const face = await countClipPixels(page, pngBase64, "disabled-face");
  const border = await countClipPixels(page, pngBase64, "disabled-border");
  if (face < MIN_DISABLED_FACE_PX || border < MIN_DISABLED_BORDER_PX) {
    throw new Error(
      `clip désactivé invalide (${label}) : face=${face}, bordure=${border}`,
    );
  }
}

async function assertActivePrimaryClip(
  page: Page,
  pngBase64: string,
  label: string,
): Promise<void> {
  const accent = await countClipPixels(page, pngBase64, "accent-face");
  if (accent < MIN_ACTIVE_ACCENT_PX) {
    throw new Error(
      `clip actif sans face lavande (${label}) : ${accent} px accent`,
    );
  }
}

async function assertCyanOutlineInButtonClip(
  page: Page,
  pngBase64: string,
): Promise<void> {
  const cyanPixels = await page.evaluate(async (b64) => {
    const blob = await fetch(`data:image/png;base64,${b64}`).then((r) =>
      r.blob(),
    );
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let cyan = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 120) continue;
      if (g > 200 && b > 220 && r < 120) cyan += 1;
    }
    return cyan;
  }, pngBase64);
  if (cyanPixels < 6) {
    throw new Error(
      `anneau cyan absent dans la zone bouton (${cyanPixels} px cyan)`,
    );
  }
}

async function measureState(
  page: Page,
  selector: string,
  state: StateName,
): Promise<StateMeasure> {
  if (state === "hover") {
    await resetInteraction(page, selector);
    await page.hover(selector, { force: true });
  } else if (state === "focus") {
    await resetInteraction(page, selector);
    await keyboardFocusVisible(page, selector);
  } else if (state === "disabled") {
    /* disabled applied by caller */
    await mouseAway(page);
  } else {
    await resetInteraction(page, selector);
    await mouseAway(page);
  }

  const measure = await page.evaluate(
    ([sel, stateName]) => {
      const fn = window.__measurePrimaryBtnState;
      if (!fn) throw new Error("__measurePrimaryBtnState manquant");
      return fn(sel, stateName as StateName);
    },
    [selector, state] as [string, StateName],
  );

  if (state === "focus") {
    const focusProof = measure.focusProof;
    if (!focusProof?.matchesFocusVisible) {
      throw new Error(
        `focus sans :focus-visible sur ${selector} (anneau absent)`,
      );
    }
    const width = Number.parseFloat(focusProof.outlineWidth);
    if (!(width > 0) || focusProof.outlineStyle === "none") {
      throw new Error(
        `outline focus-visible absent sur ${selector}: ${JSON.stringify(focusProof)}`,
      );
    }
  }

  if (state === "disabled") {
    measure.pass = measure.stops.every((s) => s.ratio >= AA_MIN);
    for (const stop of measure.stops) {
      stop.pass = stop.ratio >= AA_MIN;
    }
  }

  return measure;
}

function bufferSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function assertDistinctButtonClips(
  id: string,
  clips: Array<{
    state: "normal" | "hover" | "focus" | "disabled";
    buffer: Buffer;
  }>,
): Promise<void> {
  const hashes = clips.map((c) => ({
    state: c.state,
    hash: bufferSha256(c.buffer),
  }));
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      if (hashes[i].hash === hashes[j].hash) {
        throw new Error(
          `zones bouton identiques (${hashes[i].state} vs ${hashes[j].state}) pour ${id}`,
        );
      }
    }
  }
}

async function buttonInViewport(
  page: Page,
  selector: string,
): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }, selector);
}

async function runScenario(
  browser: import("playwright").Browser,
  scenario: Scenario,
): Promise<ScreenMeasure> {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    const url = `http://127.0.0.1:${PORT}${scenario.path}${scenario.hash ?? ""}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    await page.waitForTimeout(400);
    if (scenario.prepare) await scenario.prepare(page);
    await page.waitForSelector(scenario.selector, { timeout: 20_000 });
    await injectMeasure(page);

    const label =
      (await page.locator(scenario.selector).first().innerText())
        .trim()
        .replace(/\s+/g, " ") || scenario.id;

    const captureFiles: string[] = [];
    const states: StateMeasure[] = [];
    const disabledMode = scenario.disabledMode ?? "forced";
    const shotTarget = scenario.shotTarget ?? "viewport";
    const clipBuffers: Array<{
      state: "normal" | "hover" | "focus" | "disabled";
      buffer: Buffer;
    }> = [];

    const normalInViewport = await buttonInViewport(page, scenario.selector);

    for (const state of ["normal", "hover", "focus"] as const) {
      if (state === "normal" && scenario.id === "production-armer") {
        await page
          .locator(scenario.selector)
          .first()
          .scrollIntoViewIfNeeded();
        await page.waitForTimeout(100);
      }
      states.push(await measureState(page, scenario.selector, state));
      const fname = captureFilename(scenario.id, state, shotTarget);
      const buf = await shot(page, scenario, fname, state);
      captureFiles.push(fname);
      clipBuffers.push({ state, buffer: buf });
      const b64 = buf.toString("base64");
      if (shotTarget === "button-clip") {
        const ariaOff =
          (await page
            .locator(scenario.selector)
            .first()
            .getAttribute("aria-disabled")) !== "true";
        if (ariaOff) {
          await assertActivePrimaryClip(page, b64, `${scenario.id}/${state}`);
        }
      }
      if (state === "focus" && !scenario.forcedHarness) {
        const focusClip =
          scenario.shotTarget === "button-clip"
            ? buf
            : await captureButtonClip(page, scenario.selector, "focus");
        await assertCyanOutlineInButtonClip(
          page,
          focusClip.toString("base64"),
        );
      }
    }

    if (disabledMode !== "n/a" && !scenario.forcedHarness) {
      await applyDisabledMode(page, scenario.selector, disabledMode);
      states.push(await measureState(page, scenario.selector, "disabled"));
      const disabledFname = captureFilename(scenario.id, "disabled", shotTarget);
      captureFiles.push(disabledFname);
      const disabledBuf = await shot(
        page,
        scenario,
        disabledFname,
        "disabled",
      );
      clipBuffers.push({ state: "disabled", buffer: disabledBuf });
      await assertDisabledButtonClip(
        page,
        disabledBuf.toString("base64"),
        `${scenario.id}/disabled`,
      );
    }

    if (scenario.i3FocusCapture) {
      await page.locator(".production-actions-drawer").evaluate((el) => {
        (el as HTMLDetailsElement).open = false;
      });
      await page.waitForTimeout(100);
      const i3Sel = scenario.i3FocusCapture.selector;
      await page.waitForSelector(i3Sel, { timeout: 15_000 });
      await page.locator(i3Sel).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await resetInteraction(page, i3Sel);
      await keyboardFocusVisible(page, i3Sel);
      const i3Measure = await measureState(page, i3Sel, "focus");
      const faceMin = i3Measure.focusProof?.outlineContrastOnFaceMin;
      if (faceMin == null || faceMin < 3) {
        throw new Error(
          `I3 : contraste anneau/face ${faceMin ?? "—"}:1 < 3:1 sur ${i3Sel}`,
        );
      }
      const i3Buf = await captureButtonClip(page, i3Sel, "focus");
      await assertCyanOutlineInButtonClip(
        page,
        i3Buf.toString("base64"),
      );
      await writeFile(
        path.join(OUT, scenario.i3FocusCapture.filename),
        i3Buf,
      );
      captureFiles.push(scenario.i3FocusCapture.filename);
      await clearFocusTrap(page);
    }

    let popinCompare: PopinCompare | undefined;
    if (scenario.popinCompare && scenario.secondarySelector) {
      popinCompare = await page.evaluate(
        ([p, s]) => {
          const fn = window.__measurePopinDisabledVsSecondary;
          if (!fn) throw new Error("__measurePopinDisabledVsSecondary manquant");
          return fn(p, s);
        },
        [scenario.selector, scenario.secondarySelector] as [string, string],
      );
    }

    await resetInteraction(page, scenario.selector);

    if (!scenario.forcedHarness) {
      await assertDistinctButtonClips(scenario.id, clipBuffers);
      const focusBuf = clipBuffers.find((c) => c.state === "focus");
      const normalBuf = clipBuffers.find((c) => c.state === "normal");
      if (
        focusBuf &&
        normalBuf &&
        bufferSha256(focusBuf.buffer) === bufferSha256(normalBuf.buffer)
      ) {
        throw new Error(`focus identique au normal pour ${scenario.id}`);
      }
    }

    const activeStates = states.filter((s) => s.state !== "disabled");
    const passActive = scenario.forcedHarness
      ? false
      : activeStates.every((s) => s.pass);
    const passDisabled =
      disabledMode === "n/a"
        ? true
        : scenario.forcedHarness
          ? true
          : states.filter((s) => s.state === "disabled").every((s) => s.pass);
    const pass =
      !scenario.forcedHarness &&
      passActive &&
      passDisabled &&
      (!popinCompare || popinCompare.deltaE00Face >= 0.5);

    return {
      id: scenario.id,
      screen: scenario.screen,
      selector: scenario.selector,
      label,
      captureFiles,
      states,
      pass,
      popinCompare,
      forcedHarness: scenario.forcedHarness,
      harnessNote: scenario.harnessNote,
      normalInViewport:
        scenario.id === "production-armer" ? normalInViewport : undefined,
    };
  } finally {
    await page.close();
  }
}

const MANUAL_REVIEW_SOURCE = "revue manuelle Alphonse";

/** Publication officielle — ne modifie pas `screens[].states` (mesure script intacte). */
function buildManualReviewAlphonse(): Record<string, unknown> {
  return {
    source: MANUAL_REVIEW_SOURCE,
    bibliotheque: {
      focusRingRatioMin: 10,
      focusRingRatioMax: 11.69,
      medianRatio: 10.92,
      distinctBackgrounds: 53,
      backdropNote: "dégradé panneau #131f31 → #192c43",
      ringPixelCountDiffVsNormal: {
        count: 712,
        method:
          "pixels cyan qui diffèrent du PNG normal (passe 2, revue Alphonse)",
      },
      ringPixelCountInButtonClip: {
        count: 730,
        method:
          "tous les pixels cyan du clip bouton (passe 3, revue Alphonse)",
      },
    },
    creer: {
      focusRingRatio: 13.65,
      backdropHex: "#0c0d18",
      note:
        "Anneau rogné visible dans `creer-primary-focus-*` (bouton ~243 px, colonne main ~220 px).",
    },
    "production-armer": {
      focusRingRatio: 12.68,
    },
    "production-exporter": {
      focusRingRatio: 12.68,
    },
    "production-mesurer": {
      focusRingRatio: 13.58,
      backdropHex: "#0c0e18",
    },
    "production-zip": {
      focusRingRatio: 13.58,
      backdropHex: "#0c0e18",
    },
    "reglages-lora": {
      focusRingRatio: 13.58,
      backdropHex: "#0c0e18",
    },
    "confirmation-invariant-panel": {
      focusRingRatio: 13.58,
      backdropHex: "#0c0e18",
    },
    "regeneration-gate-blocked": {
      focusRingRatio: 3.51,
      focusRingPixelCount: 742,
      popinBackdropHex: "#151827",
      deltaE00FaceVsPopin151827Top: 25.44,
      deltaE00FaceVsPopin151827Bottom: 22.68,
      deltaE00FaceVsBg2Approx: 20.9,
      bg2Hex: "#20243a",
    },
  };
}

function formatScriptFocusRingLine(focus: FocusProof): string {
  const range =
    focus.outlineContrastRatioMax != null &&
    focus.outlineContrastRatioMax !== focus.outlineContrastRatio
      ? `min–max **${focus.outlineContrastRatio ?? "—"}–${focus.outlineContrastRatioMax}:1**`
      : `**${focus.outlineContrastRatio ?? "—"}:1**`;
  return `Mesure script (DOM) : \`:focus-visible\`=${focus.matchesFocusVisible}, outline ${focus.outlineWidth} ${focus.outlineStyle} ${focus.outlineColor}, fond anneau ${focus.backdropHex ?? "—"}, contraste anneau/fond ${range}.`;
}

function formatManualFocusPublication(
  id: string,
  manual: Record<string, unknown>,
): string | null {
  const entry = manual[id];
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  switch (id) {
    case "bibliotheque": {
      const diff = e.ringPixelCountDiffVsNormal as {
        count: number;
        method: string;
      };
      const clip = e.ringPixelCountInButtonClip as {
        count: number;
        method: string;
      };
      return `Publication (**${MANUAL_REVIEW_SOURCE}**) : anneau **10,0–11,7:1** (${e.distinctBackgrounds} fonds, min 10,00, max 11,69, médiane 10,92:1) ; **${diff.count} px** (${diff.method}) ; **${clip.count} px** (${clip.method}) ; fond derrière l’anneau = ${e.backdropNote}.`;
    }
    case "creer":
      return `Publication (**${MANUAL_REVIEW_SOURCE}**) : anneau **13,65:1** sur ${e.backdropHex}. ${e.note}`;
    case "production-armer":
    case "production-exporter":
      return `Publication (**${MANUAL_REVIEW_SOURCE}**) : anneau **12,68:1**.`;
    case "production-mesurer":
    case "production-zip":
    case "reglages-lora":
    case "confirmation-invariant-panel":
      return `Publication (**${MANUAL_REVIEW_SOURCE}**) : anneau **${e.focusRingRatio}:1** uniforme sur fond ${e.backdropHex} (la mesure DOM peut afficher une plage min–max).`;
    case "regeneration-gate-blocked":
      return `Publication (**${MANUAL_REVIEW_SOURCE}**) : anneau **${e.focusRingRatio}:1** (${e.focusRingPixelCount} px, outline à 0,45 sur ${e.popinBackdropHex}). ΔE00 face primaire vs fond modale ${e.popinBackdropHex} : **${e.deltaE00FaceVsPopin151827Top}** (haut) / **${e.deltaE00FaceVsPopin151827Bottom}** (bas). ΔE00 face ~**${e.deltaE00FaceVsBg2Approx}** vs \`--bg2\` ${e.bg2Hex}.`;
    default:
      return null;
  }
}

function formatFocusRingLine(
  s: ScreenMeasure,
  manual: Record<string, unknown>,
): string {
  const focus = s.states.find((st) => st.state === "focus")?.focusProof;
  if (!focus) return "";
  const lines = [formatScriptFocusRingLine(focus)];
  const pub = formatManualFocusPublication(s.id, manual);
  if (pub) lines.push(pub);
  return lines.join(" ");
}

function resolveCaptureGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function buildContrastesMd(
  screens: ScreenMeasure[],
  manual: Record<string, unknown>,
  captureGitSha: string,
): string {
  const lines: string[] = [
    "# Contrastes — boutons primaires (#186)",
    "",
    `Généré le ${new Date().toISOString()} — commit des captures : \`${captureGitSha}\`.`,
    "",
    "Mesures DOM : `getComputedStyle` (dégradé / fond plat, `color(srgb …/α)` résolu) composé sur `--bg0`.",
    `- États actifs : seuil WCAG 2.2 AA **${AA_MIN}:1**.`,
    `- Désactivé : texte **#848ba0** (~**5,36:1** sur **#12151f**), seuil lisibilité **${DISABLED_MIN}:1**.`,
    "- Focus : Tab + souris hors bouton ; contraste anneau mesuré contre le **fond** derrière l’outline (pas la face du bouton).",
    `- Champs \`manualReviewAlphonse\` dans \`metrics.json\` : publication **${MANUAL_REVIEW_SOURCE}** (les mesures DOM restent dans \`screens\`).`,
    "",
    "## Synthèse",
    "",
    "| Écran | Bouton | Min actif | OK | Focus `:focus-visible` |",
    "|-------|--------|-----------|----|------------------------|",
  ];

  for (const s of screens) {
    const active = s.states.filter((st) => st.state !== "disabled");
    const min = Math.min(...active.map((st) => st.minRatio));
    const focus = s.states.find((st) => st.state === "focus")?.focusProof;
    const rowOk = s.forcedHarness
      ? "FAIL (harnais)"
      : s.pass
        ? "OK"
        : "FAIL";
    lines.push(
      `| ${s.screen} | ${s.label} | ${min.toFixed(2)}:1 | ${rowOk} | ${focus?.matchesFocusVisible ? "oui" : "non"} |`,
    );
  }

  for (const s of screens) {
    lines.push("", `## ${s.screen} — \`${s.selector}\``, "");
    if (s.harnessNote) {
      lines.push(`> ${s.harnessNote}`, "");
    }
    if (s.popinCompare) {
      lines.push(
        `Mesure script — ΔE00 face primaire / secondaire actif : **${s.popinCompare.deltaE00Face}** ; ΔE00 bordure : **${s.popinCompare.deltaE00Border ?? "—"}** ; bordure tirets / fond page : **${s.popinCompare.borderContrastRatio ?? "—"}:1** ; bordure / fond popin : **${s.popinCompare.borderContrastRatioOnPopin ?? "—"}:1**.`,
        "",
      );
      if (s.id === "regeneration-gate-blocked") {
        const gate = manual["regeneration-gate-blocked"] as Record<
          string,
          unknown
        >;
        lines.push(
          `Publication (**${MANUAL_REVIEW_SOURCE}**) — ΔE00 face vs fond modale **${gate.popinBackdropHex}** : **${gate.deltaE00FaceVsPopin151827Top}** / **${gate.deltaE00FaceVsPopin151827Bottom}** ; ~**${gate.deltaE00FaceVsBg2Approx}** vs \`--bg2\` **${gate.bg2Hex}**.`,
          "",
        );
      }
    }
    lines.push(
      "| État | Texte | Arrêt | Fond | Ratio | OK |",
      "|------|-------|-------|------|-------|----|",
    );
    for (const st of s.states) {
      for (const stop of st.stops) {
        lines.push(
          `| ${st.state} | ${st.foregroundHex} | ${stop.stop} | ${stop.backgroundHex} | ${stop.ratio.toFixed(2)}:1 | ${stop.pass ? "OK" : "FAIL"} |`,
        );
      }
    }
    const focusLine = formatFocusRingLine(s, manual);
    if (focusLine) {
      lines.push("", focusLine);
    }
    if (s.captureFiles.length) {
      lines.push("", "### Captures", "");
      for (const f of s.captureFiles) {
        lines.push(`- [\`${f}\`](captures-react/${f})`);
      }
    }
  }

  lines.push(
    "",
    "## Non vérifiés",
    "",
    "Voir `inventaire.md` (**39** usages produit + **1** harnais) — seuls les scénarios capturés ci-dessus sont vérifiés écran par écran.",
    "",
    "| Élément | Raison |",
    "|---------|--------|",
    "| `scoreTabBench` | Banc interne, hors parcours produit |",
    "| WebKitGTK | Chromium / Playwright uniquement |",
    "| Lecteur d’écran | Hors périmètre contraste |",
    "| `forced-colors` | Non traité (#212) |",
    "| Rognages anneau Créer / Mesurer | Préexistants (#212) |",
    "| Garde cyan négative | Couvert par garde pixels + tests `primaryButtonContrast` |",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });

  const vite = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: ROOT,
      stdio: "ignore",
      env: { ...process.env, VITE_CAPTURE: "1" },
    },
  );

  const screens: ScreenMeasure[] = [];

  try {
    await waitServer(`http://127.0.0.1:${PORT}/sidebar-capture.html`);
    const browser = await chromium.launch({
      channel: "chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    for (const scenario of SCENARIOS) {
      console.log(`Capture : ${scenario.screen}…`);
      screens.push(await runScenario(browser, scenario));
    }

    await browser.close();

    const manualReviewAlphonse = buildManualReviewAlphonse();
    const captureGitSha = resolveCaptureGitSha();
    const disabledRatios = screens
      .flatMap((s) => s.states.filter((st) => st.state === "disabled"))
      .map((st) => st.minRatio)
      .filter((r) => Number.isFinite(r));
    const disabledTextRatioOnFace =
      disabledRatios.length > 0
        ? Math.round(Math.min(...disabledRatios) * 100) / 100
        : null;

    await writeFile(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify(
        {
          aaMin: AA_MIN,
          disabledMin: DISABLED_MIN,
          disabledTextHex: "#848ba0",
          disabledFaceHex: "#12151f",
          disabledTextRatioOnFace,
          captureGitSha,
          viewport: VIEWPORT,
          focusMethod: "keyboard-tab-mouse-away-focus-visible",
          outlineMeasuredAgainst: "backdrop-behind-outline-not-button-face",
          clipPaddingPx: CLIP_PAD_PX,
          clipPaddingFocusPx: CLIP_PAD_FOCUS_PX,
          manualReviewAlphonse,
          screens,
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      path.join(ROOT, "docs/design/boutons-primaires/contrastes.md"),
      buildContrastesMd(screens, manualReviewAlphonse, captureGitSha),
    );

    const failed = screens.filter((s) => !s.pass && !s.forcedHarness);
    console.log(
      JSON.stringify(
        {
          screens: screens.map((s) => ({
            id: s.id,
            label: s.label,
            minActive: Math.min(
              ...s.states
                .filter((st) => st.state !== "disabled")
                .map((st) => st.minRatio),
            ),
            disabled: s.states.find((st) => st.state === "disabled")?.minRatio,
            popinDeltaE00Face: s.popinCompare?.deltaE00Face,
            pass: s.pass,
          })),
          failed: failed.length,
        },
        null,
        2,
      ),
    );
    if (failed.length > 0) {
      throw new Error(
        `échec sur ${failed.map((f) => f.screen).join(", ")}`,
      );
    }
  } finally {
    vite.kill("SIGTERM");
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
