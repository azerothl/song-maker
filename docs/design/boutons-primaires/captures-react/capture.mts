/**
 * Captures + mesures de contraste pour `.btn.primary` (#186).
 *
 * Usage : pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
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
};

type DisabledMode =
  | "forced"
  | "busy-create"
  | "busy-export-trigger"
  | "busy-export-popin"
  | "regen-blocked-aria";

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
  /** Bouton visuellement bloqué (`aria-disabled`) — pas de seuil AA sur les états actifs. */
  blockedAriaOnly?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    id: "bibliotheque",
    screen: "Bibliothèque",
    path: "/sidebar-capture.html",
    selector: ".panel.library .btn.primary",
    disabledMode: "forced",
  },
  {
    id: "creer",
    screen: "Créer",
    path: "/create-capture.html",
    selector: ".song-create-generate-btn",
    disabledMode: "busy-create",
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
    },
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
    blockedAriaOnly: true,
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

async function shot(page: Page, filename: string): Promise<string> {
  await page.screenshot({
    path: path.join(OUT, filename),
    fullPage: false,
    animations: "disabled",
  });
  return filename;
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

async function pngSha256(file: string): Promise<string> {
  const buf = await readFile(path.join(OUT, file));
  return createHash("sha256").update(buf).digest("hex");
}

async function assertDistinctPngs(
  id: string,
  states: Array<"normal" | "hover" | "focus">,
): Promise<void> {
  const hashes = await Promise.all(
    states.map(async (state) => ({
      state,
      hash: await pngSha256(captureFilename(id, state)),
    })),
  );
  for (let i = 0; i < hashes.length; i++) {
    for (let j = i + 1; j < hashes.length; j++) {
      if (hashes[i].hash === hashes[j].hash) {
        throw new Error(
          `captures identiques (${hashes[i].state} vs ${hashes[j].state}) pour ${id}`,
        );
      }
    }
  }
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

    for (const state of ["normal", "hover", "focus"] as const) {
      states.push(await measureState(page, scenario.selector, state));
      captureFiles.push(
        await shot(page, captureFilename(scenario.id, state)),
      );
    }

    await applyDisabledMode(page, scenario.selector, disabledMode);
    states.push(await measureState(page, scenario.selector, "disabled"));
    captureFiles.push(
      await shot(page, captureFilename(scenario.id, "disabled")),
    );

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

    if (!scenario.blockedAriaOnly) {
      await assertDistinctPngs(scenario.id, ["normal", "hover", "focus"]);
    }

    const activeStates = states.filter((s) => s.state !== "disabled");
    const passActive = scenario.blockedAriaOnly
      ? true
      : activeStates.every((s) => s.pass);
    const passDisabled = scenario.blockedAriaOnly
      ? true
      : states.filter((s) => s.state === "disabled").every((s) => s.pass);
    const pass =
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
    };
  } finally {
    await page.close();
  }
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
    lines.push(
      `| ${s.screen} | ${s.label} | ${min.toFixed(2)}:1 | ${s.pass ? "OK" : "FAIL"} | ${focus?.matchesFocusVisible ? "oui" : "non"} |`,
    );
  }

  for (const s of screens) {
    lines.push("", `## ${s.screen} — \`${s.selector}\``, "");
    if (s.popinCompare) {
      lines.push(
        `ΔE00 face primaire / secondaire actif : **${s.popinCompare.deltaE00Face}** ; ΔE00 bordure : **${s.popinCompare.deltaE00Border ?? "—"}** ; contraste bordure tirets / fond : **${s.popinCompare.borderContrastRatio ?? "—"}:1**.`,
        "",
      );
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
    const focus = s.states.find((st) => st.state === "focus")?.focusProof;
    if (focus) {
      lines.push(
        "",
        `Focus clavier : \`:focus-visible\`=${focus.matchesFocusVisible}, outline ${focus.outlineWidth} ${focus.outlineStyle} ${focus.outlineColor}, fond anneau ${focus.backdropHex ?? "—"}, contraste anneau/fond **${focus.outlineContrastRatio ?? "—"}:1**.`,
      );
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

    const failed = screens.filter((s) => !s.pass);
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
