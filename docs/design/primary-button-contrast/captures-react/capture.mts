/**
 * Captures 1280×720 par état (normal, survol, focus, désactivé) — #186.
 *
 * Usage : pnpm exec tsx docs/design/primary-button-contrast/captures-react/capture.mts
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5186;
const VIEWPORT = { width: 1280, height: 720 };

const STATES = ["normal", "hover", "focus", "disabled"] as const;
type UiState = (typeof STATES)[number];

type Scenario = {
  id: string;
  label: string;
  path: string;
  hash?: string;
  buttonSelector: string;
  prepare?: (page: Page) => Promise<void>;
};

const SCENARIOS: Scenario[] = [
  {
    id: "creer",
    label: "Onglet Créer — Générer",
    path: "/create-capture.html",
    buttonSelector: ".song-create-generate-btn",
  },
  {
    id: "production-exporter",
    label: "Production — dialogue Exporter",
    path: "/production-capture.html",
    hash: "#12,confortable,expanded",
    buttonSelector: ".export-dialog-popin button.btn.primary",
    prepare: async (page) => {
      await page.getByRole("button", { name: /^Exporter$/ }).first().click();
      await page.waitForSelector(".export-dialog-popin button.btn.primary", {
        timeout: 15_000,
      });
    },
  },
  {
    id: "confirmation-regeneration-gate",
    label: "Confirmation — RegenerationGate (baseline mockée)",
    path: "/confirm-dialogs-capture.html",
    buttonSelector: ".regeneration-gate button.btn.primary",
  },
];

export type StateMeasure = {
  state: UiState;
  foregroundCss: string;
  backgroundStopsCss: string[];
  worstStopContrast: number | null;
  flatBackgroundContrast: number | null;
  effectiveContrast: number | null;
  passAa: boolean;
};

type ScenarioReport = {
  id: string;
  label: string;
  buttonSelector: string;
  captures: Array<{ state: UiState; file: string; measure: StateMeasure }>;
};

async function waitServer(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw new Error(`Serveur Vite inaccessible : ${url}`);
}

async function applyUiState(
  page: Page,
  selector: string,
  state: UiState,
): Promise<void> {
  const btn = page.locator(selector).first();
  await btn.scrollIntoViewIfNeeded();
  if (state === "normal") {
    await page.evaluate((sel) => {
      const b = document.querySelector(sel) as HTMLButtonElement | null;
      if (b) b.disabled = false;
    }, selector);
    await btn.blur().catch(() => undefined);
    return;
  }
  if (state === "hover") {
    await page.evaluate((sel) => {
      const b = document.querySelector(sel) as HTMLButtonElement | null;
      if (b) b.disabled = false;
    }, selector);
    await btn.hover({ force: true });
    return;
  }
  if (state === "focus") {
    await page.evaluate((sel) => {
      const b = document.querySelector(sel) as HTMLButtonElement | null;
      if (b) b.disabled = false;
    }, selector);
    await btn.focus();
    return;
  }
  await page.evaluate((sel) => {
    const b = document.querySelector(sel) as HTMLButtonElement | null;
    if (b) b.disabled = true;
  }, selector);
}

async function measureState(
  page: Page,
  selector: string,
  state: UiState,
): Promise<StateMeasure> {
  const m = await page.evaluate(
    ({ stateName, sel }) => {
      const fn = window.__measurePrimaryButtonFromDom;
      if (!fn) return null;
      return fn(stateName, sel);
    },
    { stateName: state, sel: selector },
  );
  if (!m) {
    return {
      state,
      foregroundCss: "",
      backgroundStopsCss: [],
      worstStopContrast: null,
      flatBackgroundContrast: null,
      effectiveContrast: null,
      passAa: false,
    };
  }
  return {
    state,
    foregroundCss: m.foregroundCss,
    backgroundStopsCss: m.backgroundStopsCss,
    worstStopContrast: m.worstStopContrast,
    flatBackgroundContrast: m.flatBackgroundContrast,
    effectiveContrast: m.effectiveContrast,
    passAa: m.passAa,
  };
}

async function runScenario(
  browser: import("playwright").Browser,
  scenario: Scenario,
): Promise<ScenarioReport> {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    const url = `http://127.0.0.1:${PORT}${scenario.path}${scenario.hash ?? ""}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(400);
    if (scenario.prepare) await scenario.prepare(page);
    await page.waitForSelector(scenario.buttonSelector, { timeout: 20_000 });

    const captures: ScenarioReport["captures"] = [];
    for (const state of STATES) {
      await applyUiState(page, scenario.buttonSelector, state);
      await page.waitForTimeout(80);
      const measure = await measureState(page, scenario.buttonSelector, state);
      const file = `primary-btn-${scenario.id}-${state}-1280x720.png`;
      await page.screenshot({
        path: path.join(OUT, file),
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
        animations: "disabled",
      });
      captures.push({ state, file, measure });
    }

    return {
      id: scenario.id,
      label: scenario.label,
      buttonSelector: scenario.buttonSelector,
      captures,
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
      env: { ...process.env, VITE_CAPTURE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitServer(`http://127.0.0.1:${PORT}/`);
    const browser = await chromium.launch({
      channel: "chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const reports: ScenarioReport[] = [];
    for (const scenario of SCENARIOS) {
      console.log(`Capture : ${scenario.label}…`);
      reports.push(await runScenario(browser, scenario));
    }
    await browser.close();

    const metricsPath = path.join(OUT, "metrics.json");
    await writeFile(
      metricsPath,
      `${JSON.stringify({ viewport: VIEWPORT, scenarios: reports }, null, 2)}\n`,
    );

    const failing = reports.flatMap((r) =>
      r.captures
        .filter((c) => !c.measure.passAa)
        .map((c) => `${r.id}/${c.state}=${c.measure.effectiveContrast ?? "?"}`),
    );
    if (failing.length > 0) {
      console.warn(`Contraste < 4,5:1 : ${failing.join(", ")}`);
    }
    console.log(`OK — ${reports.length} scénarios, ${metricsPath}`);
  } finally {
    vite.kill("SIGTERM");
  }
}

void main();
