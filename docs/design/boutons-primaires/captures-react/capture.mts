/**
 * Captures + mesures de contraste pour `.btn.primary` (#186 / #193).
 *
 * Usage : pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
 *
 * Pages React réelles (Vite + mock Tauri) — pas de maquette HTML statique.
 * Focus : Tab clavier + souris hors bouton → `:focus-visible` réel (pas page.focus seul).
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
/** Seuil AA texte actif (normal / survol / focus). */
const AA_MIN = 4.5;
/** Seuil lisibilité désactivé (#193) — cible ~4,7:1, plancher 3:1. */
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
};

type ScreenMeasure = {
  id: string;
  screen: string;
  selector: string;
  label: string;
  file: string;
  focusFile?: string;
  states: StateMeasure[];
  pass: boolean;
};

type Scenario = {
  id: string;
  screen: string;
  path: string;
  hash?: string;
  selector: string;
  file: string;
  /** Capture dédiée focus-visible (anneau réel). */
  focusFile?: string;
  prepare?: (page: Page) => Promise<void>;
};

const SCENARIOS: Scenario[] = [
  {
    id: "bibliotheque",
    screen: "Bibliothèque",
    path: "/sidebar-capture.html",
    selector: ".panel.library .btn.primary",
    file: "bibliotheque-primary-1280x720.png",
    focusFile: "bibliotheque-primary-focus-1280x720.png",
  },
  {
    id: "creer",
    screen: "Créer",
    path: "/create-capture.html",
    selector: ".song-create-generate-btn",
    file: "creer-primary-1280x720.png",
    focusFile: "creer-primary-focus-1280x720.png",
  },
  {
    id: "production-armer",
    screen: "Production — Armer",
    path: "/production-capture.html",
    hash: "#12,confortable,record-open",
    selector: ".record-panel button.btn.primary",
    file: "production-armer-primary-1280x720.png",
    focusFile: "production-armer-primary-focus-1280x720.png",
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
    screen: "Production — Exporter",
    path: "/production-capture.html",
    hash: "#12,confortable,view-mix",
    selector: ".song-actions-export button.btn.primary",
    file: "production-exporter-primary-1280x720.png",
    focusFile: "production-exporter-primary-focus-1280x720.png",
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
    id: "production-mesurer",
    screen: "Production — Mesurer le mix rendu",
    path: "/production-capture.html",
    hash: "#12,confortable,view-tools",
    selector: ".phase3-actions button.btn.primary",
    file: "production-mesurer-primary-1280x720.png",
    focusFile: "production-mesurer-primary-focus-1280x720.png",
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
    file: "production-zip-primary-1280x720.png",
    focusFile: "production-zip-primary-focus-1280x720.png",
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
    screen: "Réglages — LoRA (primaire visible)",
    path: "/settings-capture.html",
    selector: ".phase3-lora-list button.btn.primary",
    file: "reglages-lora-primary-1280x720.png",
    focusFile: "reglages-lora-primary-focus-1280x720.png",
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
    screen: "Confirmation — RegenerationGate",
    path: "/confirm-dialogs-capture.html",
    hash: "#regeneration-gate",
    selector: ".regeneration-gate button.btn.primary, button.btn.primary",
    file: "confirmation-regeneration-gate-primary-1280x720.png",
    focusFile: "confirmation-regeneration-gate-primary-focus-1280x720.png",
  },
  {
    id: "confirmation-invariant-panel",
    screen: "Confirmation — InvariantPanel",
    path: "/confirm-dialogs-capture.html",
    hash: "#invariant-panel",
    selector: ".invariant-panel button.btn.primary",
    file: "confirmation-invariant-panel-primary-1280x720.png",
    focusFile: "confirmation-invariant-panel-primary-focus-1280x720.png",
  },
  {
    id: "confirmation-remote-generate",
    screen: "Confirmation — RemoteGenerateConfirm",
    path: "/confirm-dialogs-capture.html",
    hash: "#remote-generate-confirm",
    selector: ".remote-generate-confirm button.btn.primary",
    file: "confirmation-remote-generate-primary-1280x720.png",
    focusFile: "confirmation-remote-generate-primary-focus-1280x720.png",
  },
  {
    id: "confirmation-separation-recommend",
    screen: "Confirmation — SeparationRecommendDialog",
    path: "/confirm-dialogs-capture.html",
    hash: "#separation-recommend",
    selector:
      ".separation-recommend-popin button.btn.primary, button.btn.primary",
    file: "confirmation-separation-recommend-primary-1280x720.png",
    focusFile: "confirmation-separation-recommend-primary-focus-1280x720.png",
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
    file: "confirmation-update-notice-primary-1280x720.png",
    focusFile: "confirmation-update-notice-primary-focus-1280x720.png",
  },
];

declare global {
  interface Window {
    __measurePrimaryBtnState?: (
      sel: string,
      stateName: StateName,
    ) => StateMeasure;
    __readFocusProof?: (sel: string) => FocusProof;
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
  await page.evaluate(() => {
    window.__readFocusProof = (sel: string) => {
      const btn = document.querySelector(sel) as HTMLElement | null;
      if (!btn) throw new Error(`bouton introuvable : ${sel}`);
      const style = getComputedStyle(btn);
      return {
        matchesFocusVisible: btn.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        cursor: style.cursor,
        mouseAway: true,
      };
    };
  });
}

/** Souris hors viewport — évite :hover pendant la mesure focus. */
async function mouseAway(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
}

/**
 * Focus clavier réel : piège focusable avant le bouton, Tab, souris hors bouton.
 * Ne pas utiliser page.focus() seul (pas d’anneau :focus-visible).
 */
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

async function resetButton(page: Page, selector: string): Promise<void> {
  await mouseAway(page);
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = false;
    btn.blur();
  }, selector);
  await clearFocusTrap(page);
}

async function measureState(
  page: Page,
  selector: string,
  state: StateName,
): Promise<StateMeasure> {
  await resetButton(page, selector);

  if (state === "disabled") {
    // Mesure de styles :disabled uniquement (pas une « preuve » d’interaction).
    await page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
    }, selector);
    await mouseAway(page);
  } else if (state === "hover") {
    await page.hover(selector, { force: true });
  } else if (state === "focus") {
    await keyboardFocusVisible(page, selector);
  } else {
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
    const focusProof = await page.evaluate((sel) => {
      const fn = window.__readFocusProof;
      if (!fn) throw new Error("__readFocusProof manquant");
      return fn(sel);
    }, selector);
    measure.focusProof = focusProof;
    if (!focusProof.matchesFocusVisible) {
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

  // Seuil désactivé ≠ AA texte actif (#193).
  if (state === "disabled") {
    measure.pass = measure.stops.every((s) => s.ratio >= DISABLED_MIN);
    for (const stop of measure.stops) {
      stop.pass = stop.ratio >= DISABLED_MIN;
    }
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
  await resetButton(page, selector);
  return results;
}

function buildContrastesMd(screens: ScreenMeasure[]): string {
  const lines: string[] = [
    "# Contrastes — boutons primaires (#186 / #193)",
    "",
    `Généré le ${new Date().toISOString()}.`,
    "",
    "Mesures DOM : `getComputedStyle` (couleur du texte, opacity, `background-image` / `background-color`) compositées sur `--bg0`.",
    `- États actifs (normal / survol / focus) : seuil WCAG 2.2 AA texte **${AA_MIN}:1**.`,
    `- État désactivé : seuil lisibilité **${DISABLED_MIN}:1** (cible ~4,7:1, texte \`#848ba0\`) — distinct du secondaire actif.`,
    "- Focus : Tab clavier + souris hors bouton ; preuve `:focus-visible` (anneau) dans `metrics.json`.",
    "",
    "## Synthèse",
    "",
    "| Écran | Bouton | Min (tous états) | OK |",
    "|-------|--------|------------------|----|",
  ];

  for (const s of screens) {
    const min = Math.min(...s.states.map((st) => st.minRatio));
    lines.push(
      `| ${s.screen} | ${s.label} | ${min.toFixed(2)}:1 | ${s.pass ? "OK" : "FAIL"} |`,
    );
  }

  for (const s of screens) {
    lines.push("", `## ${s.screen} — \`${s.selector}\``, "");
    lines.push(
      "| État | Texte | Opacité | Arrêt | Fond | Ratio | OK |",
      "|------|-------|---------|-------|------|-------|----|",
    );
    for (const st of s.states) {
      for (const stop of st.stops) {
        lines.push(
          `| ${st.state} | ${st.foregroundHex} | ${st.opacity} | ${stop.stop} | ${stop.backgroundHex} | ${stop.ratio.toFixed(2)}:1 | ${stop.pass ? "OK" : "FAIL"} |`,
        );
      }
    }
    const focus = s.states.find((st) => st.state === "focus")?.focusProof;
    if (focus) {
      lines.push(
        "",
        `Preuve focus clavier : \`:focus-visible\`=${focus.matchesFocusVisible}, outline \`${focus.outlineWidth} ${focus.outlineStyle}\`, offset \`${focus.outlineOffset}\`, souris hors bouton.`,
      );
    }
  }

  lines.push("", "## Captures", "");
  for (const s of screens) {
    lines.push(`- [\`${s.file}\`](captures-react/${s.file})`);
    if (s.focusFile) {
      lines.push(`- [\`${s.focusFile}\`](captures-react/${s.focusFile}) (focus-visible)`);
    }
  }

  lines.push(
    "",
    "## Non vérifiés",
    "",
    "| Élément | Raison |",
    "|---------|--------|",
    "| Inventaire complet des 35 usages | Voir commentaire #186 — seuls les scénarios listés sont capturés. |",
    "| `scoreTabBench` / `scoreTabBenchApp` | Banc interne de perf, hors parcours produit. |",
    "| WebKitGTK | Mesures Chromium (Playwright), pas le runtime Tauri natif. |",
    "| Lecteur d’écran | Hors périmètre contraste (pas de parcours NVDA/Orca). |",
    "| `forced-colors` | Non traité (#193). |",
    "",
    "Cette livraison **ne couvre pas toute l’application** : uniquement les scénarios listés ci-dessus.",
    "",
  );
  return `${lines.join("\n")}\n`;
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
    const states = await measureButtonStates(page, scenario.selector);

    await resetButton(page, scenario.selector);
    await page.screenshot({
      path: path.join(OUT, scenario.file),
      fullPage: false,
      animations: "disabled",
    });

    if (scenario.focusFile) {
      await keyboardFocusVisible(page, scenario.selector);
      const ok = await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        return Boolean(btn?.matches(":focus-visible"));
      }, scenario.selector);
      if (!ok) {
        throw new Error(`capture focus sans :focus-visible — ${scenario.id}`);
      }
      await page.screenshot({
        path: path.join(OUT, scenario.focusFile),
        fullPage: false,
        animations: "disabled",
      });
      await resetButton(page, scenario.selector);
    }

    return {
      id: scenario.id,
      screen: scenario.screen,
      selector: scenario.selector,
      label,
      file: scenario.file,
      focusFile: scenario.focusFile,
      states,
      pass: states.every((s) => s.pass),
    };
  } finally {
    await page.close();
  }
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
          viewport: VIEWPORT,
          focusMethod: "keyboard-tab-mouse-away-focus-visible",
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
    const focusFailed = screens.filter((s) => {
      const f = s.states.find((st) => st.state === "focus")?.focusProof;
      return !f?.matchesFocusVisible;
    });
    console.log(
      JSON.stringify(
        {
          screens: screens.map((s) => ({
            id: s.id,
            label: s.label,
            min: Math.min(...s.states.map((st) => st.minRatio)),
            disabled:
              s.states.find((st) => st.state === "disabled")?.minRatio ?? null,
            focusVisible: s.states.find((st) => st.state === "focus")
              ?.focusProof?.matchesFocusVisible,
            pass: s.pass,
          })),
          failed: failed.length,
          focusFailed: focusFailed.length,
        },
        null,
        2,
      ),
    );
    if (failed.length > 0) {
      throw new Error(
        `contraste insuffisant sur ${failed.map((f) => f.screen).join(", ")}`,
      );
    }
    if (focusFailed.length > 0) {
      throw new Error(
        `:focus-visible manquant sur ${focusFailed.map((f) => f.screen).join(", ")}`,
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
