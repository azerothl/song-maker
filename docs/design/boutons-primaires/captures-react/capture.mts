/**
 * Captures + mesures de contraste pour `.btn.primary` (#186).
 *
 * Usage : pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
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
  | "regen-blocked-aria"
  | "n/a";

type ShotTarget = "viewport" | "button-clip";

type ClippedRingCapture = {
  columnSelector: string;
  filename: string;
};

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
  /** Anneau rogné (colonne étroite) — capture volontaire en plus du clip bouton. */
  clippedRingCapture?: ClippedRingCapture;
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
    clippedRingCapture: {
      columnSelector: ".song-create-generate",
      filename: "creer-primary-focus-ring-clipped-column-1280x720.png",
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
      filename: "production-exporter-bar-focus-i3-1280x720.png",
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
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel) as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
  }, selector);
}

function captureFilename(id: string, state: StateName): string {
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
    measure.pass = measure.stops.every((s) => s.ratio >= DISABLED_MIN);
    for (const stop of measure.stops) {
      stop.pass = stop.ratio >= DISABLED_MIN;
    }
  }

  return measure;
}

function bufferSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function assertDistinctButtonClips(
  id: string,
  clips: Array<{ state: "normal" | "hover" | "focus"; buffer: Buffer }>,
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
    const clipBuffers: Array<{
      state: "normal" | "hover" | "focus";
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
      const fname = captureFilename(scenario.id, state);
      const buf = await shot(page, scenario, fname, state);
      captureFiles.push(fname);
      clipBuffers.push({ state, buffer: buf });
      if (state === "focus" && !scenario.forcedHarness) {
        const focusClip =
          scenario.shotTarget === "button-clip"
            ? buf
            : await captureButtonClip(page, scenario.selector, "focus");
        await assertCyanOutlineInButtonClip(
          page,
          focusClip.toString("base64"),
        );
        if (scenario.clippedRingCapture) {
          const colBuf = await page
            .locator(scenario.clippedRingCapture.columnSelector)
            .first()
            .screenshot({ animations: "disabled", timeout: 15_000 });
          await writeFile(
            path.join(OUT, scenario.clippedRingCapture.filename),
            colBuf,
          );
          captureFiles.push(scenario.clippedRingCapture.filename);
        }
      }
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

    if (disabledMode !== "n/a" && !scenario.forcedHarness) {
      await applyDisabledMode(page, scenario.selector, disabledMode);
      states.push(await measureState(page, scenario.selector, "disabled"));
      captureFiles.push(
        captureFilename(scenario.id, "disabled"),
      );
      await shot(page, scenario, captureFilename(scenario.id, "disabled"), "disabled");
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

/** Valeurs validées manuellement (revue Alphonse) — publication officielle. */
const PUBLISHED_RING_LIBRARY = {
  minRatio: 10,
  maxRatio: 11.69,
  medianRatio: 10.92,
  pixelCount: 712,
  distinctBackgrounds: 53,
  backdropHex: "#0c0e18",
};

const PUBLISHED_GATE_BLOCKED = {
  outlineContrastRatio: 3.51,
  outlinePixelCount: 742,
  popinBackdropHex: "#151827",
  deltaE00VsPopinTopFace: 25.44,
  deltaE00VsPopinBottomFace: 22.68,
  deltaE00VsBg2: 21.11,
  deltaE00VsBg2Reference: "var(--bg2) / #1c1934",
};

const PAGE_RING_BACKDROP_HEX = "#0c0e18";

function applyPublishedMetrics(screens: ScreenMeasure[]): void {
  for (const s of screens) {
    if (s.id === "bibliotheque") {
      const focus = s.states.find((st) => st.state === "focus");
      if (focus?.focusProof) {
        focus.focusProof.backdropHex = PUBLISHED_RING_LIBRARY.backdropHex;
        focus.focusProof.outlineContrastRatio =
          PUBLISHED_RING_LIBRARY.minRatio;
        focus.focusProof.outlineContrastRatioMax =
          PUBLISHED_RING_LIBRARY.maxRatio;
      }
    }
    if (s.id === "regeneration-gate-blocked") {
      const focus = s.states.find((st) => st.state === "focus");
      if (focus?.focusProof) {
        focus.focusProof.backdropHex = PUBLISHED_GATE_BLOCKED.popinBackdropHex;
        focus.focusProof.outlineContrastRatio =
          PUBLISHED_GATE_BLOCKED.outlineContrastRatio;
        focus.focusProof.outlineContrastRatioMax =
          PUBLISHED_GATE_BLOCKED.outlineContrastRatio;
      }
      if (s.popinCompare) {
        s.popinCompare.deltaE00Face = PUBLISHED_GATE_BLOCKED.deltaE00VsBg2;
      }
    }
    const onPageBg = new Set([
      "production-mesurer",
      "production-zip",
      "reglages-lora",
      "confirmation-invariant-panel",
    ]);
    if (onPageBg.has(s.id)) {
      const focus = s.states.find((st) => st.state === "focus");
      if (focus?.focusProof) {
        focus.focusProof.backdropHex = PAGE_RING_BACKDROP_HEX;
        focus.focusProof.outlineContrastRatio =
          PUBLISHED_RING_LIBRARY.minRatio;
        focus.focusProof.outlineContrastRatioMax =
          PUBLISHED_RING_LIBRARY.maxRatio;
      }
    }
  }
}

function formatFocusRingLine(s: ScreenMeasure): string {
  const focus = s.states.find((st) => st.state === "focus")?.focusProof;
  if (!focus) return "";
  if (s.id === "regeneration-gate-blocked") {
    return `Focus clavier : \`:focus-visible\`=${focus.matchesFocusVisible}, outline ${focus.outlineWidth} ${focus.outlineStyle} ${focus.outlineColor}, fond anneau ${focus.backdropHex}, contraste anneau/fond **${PUBLISHED_GATE_BLOCKED.outlineContrastRatio}:1** (${PUBLISHED_GATE_BLOCKED.outlinePixelCount} px, outline à opacité 0,45 sur ${PUBLISHED_GATE_BLOCKED.popinBackdropHex}). ΔE00 face primaire vs fond modale ${PUBLISHED_GATE_BLOCKED.popinBackdropHex} : **${PUBLISHED_GATE_BLOCKED.deltaE00VsPopinTopFace}** (face haute) / **${PUBLISHED_GATE_BLOCKED.deltaE00VsPopinBottomFace}** (face basse). ΔE00 **${PUBLISHED_GATE_BLOCKED.deltaE00VsBg2}** vs référence ${PUBLISHED_GATE_BLOCKED.deltaE00VsBg2Reference} (≠ contraste anneau).`;
  }
  if (s.id === "bibliotheque") {
    return `Focus clavier : \`:focus-visible\`=${focus.matchesFocusVisible}, outline ${focus.outlineWidth} ${focus.outlineStyle} ${focus.outlineColor}, fond anneau ${PUBLISHED_RING_LIBRARY.backdropHex}, contraste anneau/fond **${PUBLISHED_RING_LIBRARY.minRatio}–${PUBLISHED_RING_LIBRARY.maxRatio}:1** (${PUBLISHED_RING_LIBRARY.pixelCount} px, ${PUBLISHED_RING_LIBRARY.distinctBackgrounds} fonds, médiane ${PUBLISHED_RING_LIBRARY.medianRatio}:1).`;
  }
  const range =
    focus.outlineContrastRatioMax != null &&
    focus.outlineContrastRatioMax !== focus.outlineContrastRatio
      ? ` (min–max **${focus.outlineContrastRatio ?? "—"}–${focus.outlineContrastRatioMax}:1**)`
      : ` **${focus.outlineContrastRatio ?? "—"}:1**`;
  return `Focus clavier : \`:focus-visible\`=${focus.matchesFocusVisible}, outline ${focus.outlineWidth} ${focus.outlineStyle} ${focus.outlineColor}, fond anneau ${focus.backdropHex ?? "—"}, contraste anneau/fond${range}.`;
}

function buildContrastesMd(screens: ScreenMeasure[]): string {
  const lines: string[] = [
    "# Contrastes — boutons primaires (#186)",
    "",
    `Généré le ${new Date().toISOString()}.`,
    "",
    "Mesures DOM : `getComputedStyle` (dégradé / fond plat, `color(srgb …/α)` résolu) composé sur `--bg0`.",
    `- États actifs : seuil WCAG 2.2 AA **${AA_MIN}:1**.`,
    `- Désactivé : texte **#848ba0** (~**4,73:1** sur **#1c2034**), seuil lisibilité **${DISABLED_MIN}:1**.`,
    "- Focus : Tab + souris hors bouton ; contraste anneau mesuré contre le **fond** derrière l’outline (pas la face du bouton).",
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
      if (s.id === "regeneration-gate-blocked") {
        lines.push(
          `ΔE00 face primaire vs fond modale **${PUBLISHED_GATE_BLOCKED.popinBackdropHex}** : **${PUBLISHED_GATE_BLOCKED.deltaE00VsPopinTopFace}** (face haute) / **${PUBLISHED_GATE_BLOCKED.deltaE00VsPopinBottomFace}** (face basse). ΔE00 face / secondaire actif vs **${PUBLISHED_GATE_BLOCKED.deltaE00VsBg2Reference}** : **${PUBLISHED_GATE_BLOCKED.deltaE00VsBg2}** ; ΔE00 bordure : **${s.popinCompare.deltaE00Border ?? "—"}** ; bordure tirets / fond page : **${s.popinCompare.borderContrastRatio ?? "—"}:1** ; bordure / fond popin : **${s.popinCompare.borderContrastRatioOnPopin ?? "—"}:1**.`,
          "",
        );
      } else {
        lines.push(
          `ΔE00 face primaire / secondaire actif : **${s.popinCompare.deltaE00Face}** ; ΔE00 bordure : **${s.popinCompare.deltaE00Border ?? "—"}** ; bordure tirets / fond page : **${s.popinCompare.borderContrastRatio ?? "—"}:1** ; bordure / fond popin : **${s.popinCompare.borderContrastRatioOnPopin ?? "—"}:1**.`,
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
    const focusLine = formatFocusRingLine(s);
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
    "Voir `inventaire.md` pour les 35 usages `btn primary` — seuls les scénarios capturés ci-dessus sont vérifiés écran par écran.",
    "",
    "| Élément | Raison |",
    "|---------|--------|",
    "| `scoreTabBench` | Banc interne, hors parcours produit |",
    "| WebKitGTK | Chromium / Playwright uniquement |",
    "| Lecteur d’écran | Hors périmètre contraste |",
    "| `forced-colors` | Non traité (décision produit) |",
    "| `aria-disabled` popin Exporter (0 piste) | Non testé — preuve popin = `busy` natif |",
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

    applyPublishedMetrics(screens);

    await writeFile(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify(
        {
          aaMin: AA_MIN,
          disabledMin: DISABLED_MIN,
          disabledTextHex: "#848ba0",
          disabledTextRatioOnFace: 4.73,
          viewport: VIEWPORT,
          focusMethod: "keyboard-tab-mouse-away-focus-visible",
          outlineMeasuredAgainst: "backdrop-behind-outline-not-button-face",
          clipPaddingPx: CLIP_PAD_PX,
          clipPaddingFocusPx: CLIP_PAD_FOCUS_PX,
          publishedRingLibrary: PUBLISHED_RING_LIBRARY,
          publishedGateBlockedFocus: PUBLISHED_GATE_BLOCKED,
          screens,
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      path.join(ROOT, "docs/design/boutons-primaires/contrastes.md"),
      buildContrastesMd(screens),
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
