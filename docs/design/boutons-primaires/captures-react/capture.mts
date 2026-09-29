/**
 * Captures + mesures de contraste pour `.btn.primary` (#186, #193).
 *
 * Usage : pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
 */
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
const MEASURE_JS = path.join(__dirname, "measure-in-page.js");

type StateName = "normal" | "hover" | "focus" | "disabled";

type StopMeasure = {
  stop: string;
  backgroundCss: string;
  backgroundHex: string;
  ratio: number;
  pass: boolean;
};

type FocusMeasure = {
  focusVisible: boolean;
  outlineWidth: string;
  outlineStyle: string;
  outlineColor: string;
  outlineOffset: string;
  cursor: string;
  outlineContrastRatio?: number;
};

type StateMeasure = {
  state: StateName;
  foregroundCss: string;
  foregroundHex: string;
  opacity: number;
  cursor: string;
  stops: StopMeasure[];
  minRatio: number;
  pass: boolean;
  focus?: FocusMeasure;
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
  bordersMatch: boolean;
};

type ScreenMeasure = {
  screen: string;
  selector: string;
  label: string;
  states: StateMeasure[];
  pass: boolean;
  popinCompare?: PopinCompare;
  captureFiles: string[];
};

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

async function launchChromium() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ channel: "chrome" });
  }
}

async function waitServer(url: string, timeoutMs = 60_000): Promise<void> {
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

async function clearPointerFocus(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
}

async function focusViaTab(page: Page, selector: string): Promise<void> {
  await clearPointerFocus(page);
  const max = 120;
  for (let i = 0; i < max; i++) {
    const focused = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el != null && el === document.activeElement;
    }, selector);
    if (focused) return;
    await page.keyboard.press("Tab");
    await page.waitForTimeout(40);
  }
  throw new Error(`focus clavier introuvable : ${selector}`);
}

async function measureState(
  page: Page,
  selector: string,
  state: StateName,
): Promise<StateMeasure> {
  if (state === "hover") {
    await clearPointerFocus(page);
    await page.hover(selector);
  } else if (state === "focus") {
    await page.mouse.move(0, 0);
    await focusViaTab(page, selector);
  } else {
    await clearPointerFocus(page);
  }

  const measure = await page.evaluate(
    ([sel, stateName]) => {
      const fn = window.__measurePrimaryBtnState;
      if (!fn) throw new Error("__measurePrimaryBtnState manquant");
      return fn(sel, stateName as StateName);
    },
    [selector, state] as [string, StateName],
  );

  if (state === "hover" || state === "focus") {
    await clearPointerFocus(page);
  }

  return measure;
}

async function measureButtonStates(
  page: Page,
  selector: string,
): Promise<StateMeasure[]> {
  const states: StateName[] = ["normal", "hover", "focus", "disabled"];
  const results: StateMeasure[] = [];
  for (const state of states) {
    results.push(await measureState(page, selector, state));
  }
  return results;
}

async function shot(
  page: Page,
  filename: string,
): Promise<string> {
  const rel = `captures-react/${filename}`;
  await page.screenshot({
    path: path.join(OUT, filename),
    fullPage: false,
  });
  return rel;
}

function buildContrastesMd(screens: ScreenMeasure[]): string {
  const lines: string[] = [
    "# Contrastes — boutons primaires (#186, #193)",
    "",
    `Généré le ${new Date().toISOString()}.`,
    "",
    "Mesures DOM : `getComputedStyle` + ΔE00 (face/bordure) pour primaire désactivé vs secondaire actif dans les popins. Focus : Tab clavier, souris hors cible, `:focus-visible` réel.",
    "",
    "Seuil WCAG 2.2 AA texte actif : **4,5:1** ; libellé désactivé : **≥ 3:1** (cible ~4,7:1).",
    "",
    "## Synthèse",
    "",
    "| Écran | Bouton | Min (états actifs) | AA | Focus visible |",
    "|-------|--------|--------------------|----|---------------|",
  ];

  for (const s of screens) {
    const activeStates = s.states.filter((st) => st.state !== "disabled");
    const min = Math.min(...activeStates.map((st) => st.minRatio));
    const focus = s.states.find((st) => st.state === "focus");
    const focusOk = focus?.focus?.focusVisible ? "oui" : "non";
    lines.push(
      `| ${s.screen} | ${s.label} | ${min.toFixed(2)}:1 | ${s.pass ? "OK" : "FAIL"} | ${focusOk} |`,
    );
  }

  for (const s of screens) {
    lines.push("", `## ${s.screen} — \`${s.selector}\``, "");
    if (s.popinCompare) {
      lines.push(
        `ΔE00 face primaire désactivé / secondaire actif : **${s.popinCompare.deltaE00Face}** ; bordures identiques : ${s.popinCompare.bordersMatch ? "oui" : "non"}.`,
        "",
      );
    }
    lines.push(
      "| État | Texte | Opacité | Curseur | Arrêt | Fond | Ratio | AA |",
      "|------|-------|---------|---------|-------|------|-------|----|",
    );
    for (const st of s.states) {
      const cursor = st.cursor ?? "—";
      for (const stop of st.stops) {
        lines.push(
          `| ${st.state} | ${st.foregroundHex} | ${st.opacity} | ${cursor} | ${stop.stop} | ${stop.backgroundHex} | ${stop.ratio.toFixed(2)}:1 | ${stop.pass ? "OK" : "FAIL"} |`,
        );
      }
      if (st.focus) {
        lines.push(
          "",
          `Focus : \`:focus-visible\`=${st.focus.focusVisible}, outline=${st.focus.outlineWidth} ${st.focus.outlineColor} offset ${st.focus.outlineOffset}, contraste anneau≈${st.focus.outlineContrastRatio ?? "—"}:1.`,
          "",
        );
      }
    }
    if (s.captureFiles.length) {
      lines.push("", "### Captures", "");
      for (const f of s.captureFiles) {
        lines.push(`- [\`${path.basename(f)}\`](${f})`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

async function captureCreer(page: Page): Promise<ScreenMeasure> {
  await page.goto(`http://127.0.0.1:${PORT}/create-capture.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".song-create-generate-btn", { timeout: 15_000 });
  await injectMeasure(page);
  const selector = ".song-create-generate-btn";
  const label =
    (await page.locator(selector).first().innerText()).trim() || "Générer";

  const captureFiles: string[] = [];
  const states: StateMeasure[] = [];

  states.push(await measureState(page, selector, "normal"));
  captureFiles.push(await shot(page, "creer-primary-normal-1280x720.png"));

  states.push(await measureState(page, selector, "hover"));
  captureFiles.push(await shot(page, "creer-primary-hover-1280x720.png"));

  states.push(await measureState(page, selector, "focus"));
  captureFiles.push(await shot(page, "creer-primary-focus-1280x720.png"));

  await page.evaluate(() => window.__captureSetGenerateBusy?.(true));
  await page.waitForTimeout(200);
  states.push(await measureState(page, selector, "disabled"));
  captureFiles.push(await shot(page, "creer-primary-disabled-1280x720.png"));
  await page.evaluate(() => window.__captureSetGenerateBusy?.(false));

  return {
    screen: "Créer",
    selector,
    label,
    states,
    pass: states.every((s) => s.pass),
    captureFiles,
  };
}

async function openProductionActions(page: Page): Promise<void> {
  const drawer = page.locator(".production-actions-drawer");
  const open = await drawer.getAttribute("open");
  if (!open) {
    await drawer.locator("summary").click();
    await page.waitForTimeout(200);
  }
}

async function captureProductionExportTrigger(page: Page): Promise<ScreenMeasure> {
  await page.goto(`http://127.0.0.1:${PORT}/production-capture.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".production-workspace", { timeout: 20_000 });
  await openProductionActions(page);
  await injectMeasure(page);
  const selector = ".song-actions-export .btn.primary";
  await page.waitForSelector(selector, { timeout: 10_000 });
  const label =
    (await page.locator(selector).first().innerText()).trim() || "Exporter";

  const captureFiles: string[] = [];
  const states: StateMeasure[] = [];

  states.push(await measureState(page, selector, "normal"));
  captureFiles.push(
    await shot(page, "production-export-trigger-normal-1280x720.png"),
  );
  states.push(await measureState(page, selector, "hover"));
  captureFiles.push(
    await shot(page, "production-export-trigger-hover-1280x720.png"),
  );
  states.push(await measureState(page, selector, "focus"));
  captureFiles.push(
    await shot(page, "production-export-trigger-focus-1280x720.png"),
  );

  await page.evaluate(() => window.__productionCaptureSetBusy?.(true));
  await page.waitForTimeout(200);
  states.push(await measureState(page, selector, "disabled"));
  captureFiles.push(
    await shot(page, "production-export-trigger-disabled-1280x720.png"),
  );
  await page.evaluate(() => window.__productionCaptureSetBusy?.(false));

  return {
    screen: "Production — Exporter (déclencheur)",
    selector,
    label,
    states,
    pass: states.every((s) => s.pass),
    captureFiles,
  };
}

async function captureProductionExportPopin(page: Page): Promise<ScreenMeasure> {
  await page.goto(`http://127.0.0.1:${PORT}/production-capture.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".production-workspace", { timeout: 20_000 });
  await openProductionActions(page);
  await injectMeasure(page);

  const trigger = ".song-actions-export .btn.primary";
  await page.click(trigger);
  await page.waitForSelector(".export-dialog-popin", { timeout: 10_000 });

  await page.getByLabel("Pistes séparées (WAV)").click();
  await page.waitForTimeout(150);
  const boxes = page.locator(".export-stem-list input[type=checkbox]");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const box = boxes.nth(i);
    if (await box.isChecked()) await box.uncheck();
  }
  await page.waitForTimeout(200);

  const selector = ".export-dialog-popin .btn-row .btn.primary";
  const secondarySel = ".export-dialog-popin .btn-row .btn.ghost";
  const label =
    (await page.locator(selector).first().innerText()).trim() || "Exporter";

  const captureFiles: string[] = [];
  const states: StateMeasure[] = [];

  states.push(await measureState(page, selector, "normal"));
  captureFiles.push(
    await shot(page, "production-export-popin-primary-disabled-normal-1280x720.png"),
  );

  const popinCompare = await page.evaluate(
    ([p, s]) => {
      const fn = window.__measurePopinDisabledVsSecondary;
      if (!fn) throw new Error("__measurePopinDisabledVsSecondary manquant");
      return fn(p, s);
    },
    [selector, secondarySel] as [string, string],
  );

  return {
    screen: "Production — Exporter (popin, primaire désactivé)",
    selector,
    label,
    states,
    pass:
      states.every((s) => s.pass) &&
      popinCompare.deltaE00Face >= 2 &&
      !popinCompare.bordersMatch,
    popinCompare,
    captureFiles,
  };
}

async function captureRegenerationGate(page: Page): Promise<ScreenMeasure> {
  await page.goto(`http://127.0.0.1:${PORT}/regen-gate-capture.html`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".modal.regeneration-gate .btn.primary", {
    timeout: 15_000,
  });
  await injectMeasure(page);
  const selector = ".modal.regeneration-gate .btn-row .btn.primary";
  const secondarySel = ".modal.regeneration-gate .btn-row .btn.ghost";
  const label =
    (await page.locator(selector).first().innerText()).trim() || "Continuer";

  const captureFiles: string[] = [];
  const states: StateMeasure[] = [];

  states.push(await measureState(page, selector, "normal"));
  captureFiles.push(
    await shot(page, "regeneration-gate-primary-disabled-normal-1280x720.png"),
  );

  const popinCompare = await page.evaluate(
    ([p, s]) => {
      const fn = window.__measurePopinDisabledVsSecondary;
      if (!fn) throw new Error("__measurePopinDisabledVsSecondary manquant");
      return fn(p, s);
    },
    [selector, secondarySel] as [string, string],
  );

  const cancelSel = ".modal.regeneration-gate .btn-row .btn.ghost";
  await focusViaTab(page, cancelSel);
  captureFiles.push(
    await shot(page, "regeneration-gate-cancel-focus-1280x720.png"),
  );
  await clearPointerFocus(page);

  return {
    screen: "RegenerationGate",
    selector,
    label,
    states,
    pass:
      states.every((s) => s.pass) &&
      popinCompare.deltaE00Face >= 2 &&
      !popinCompare.bordersMatch,
    popinCompare,
    captureFiles,
  };
}

async function captureMesurerMix(page: Page): Promise<string | null> {
  await page.goto(`http://127.0.0.1:${PORT}/production-capture.html`, {
    waitUntil: "networkidle",
  });
  const selector = ".phase3-actions .btn.primary";
  const btn = page.locator(selector);
  if ((await btn.count()) === 0) return null;
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  if (!(await btn.isVisible())) return null;
  return shot(page, "action-mesurer-mix-rendu-normal-1280x720.png");
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
  let mesurerMixCapture: string | null = null;

  try {
    await waitServer(`http://127.0.0.1:${PORT}/create-capture.html`);
    const browser = await launchChromium();

    const viewport = { width: 1280, height: 720 };

    {
      const page = await browser.newPage({ viewport });
      screens.push(await captureCreer(page));
      await page.close();
    }
    {
      const page = await browser.newPage({ viewport });
      screens.push(await captureProductionExportTrigger(page));
      await page.close();
    }
    {
      const page = await browser.newPage({ viewport });
      screens.push(await captureProductionExportPopin(page));
      await page.close();
    }
    {
      const page = await browser.newPage({ viewport });
      screens.push(await captureRegenerationGate(page));
      await page.close();
    }
    {
      const page = await browser.newPage({ viewport });
      try {
        mesurerMixCapture = await captureMesurerMix(page);
      } catch {
        mesurerMixCapture = null;
      }
      await page.close();
    }
    await browser.close();

    const metrics = {
      aaMin: AA_MIN,
      generatedAt: new Date().toISOString(),
      method: {
        focus: "keyboard Tab, pointer away, :focus-visible",
        disabled: "application state (busy / stems vides / regen gate)",
      },
      actionButtonCapture: mesurerMixCapture,
      screens,
    };

    await writeFile(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    await writeFile(
      path.join(ROOT, "docs/design/boutons-primaires/contrastes.md"),
      buildContrastesMd(screens),
    );

    const failed = screens.filter((s) => !s.pass);
    console.log(JSON.stringify({ screens, failed: failed.length }, null, 2));
    if (failed.length > 0) {
      throw new Error(
        `échec mesures : ${failed.map((f) => f.screen).join(", ")}`,
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
