/**
 * Captures 1280×720 et mesures de contraste DOM — boutons `.btn.primary` (#186).
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

type Scenario = {
  id: string;
  label: string;
  path: string;
  hash?: string;
  prepare?: (page: Page) => Promise<void>;
};

const SCENARIOS: Scenario[] = [
  { id: "bibliotheque", label: "Bibliothèque", path: "/sidebar-capture.html" },
  { id: "creer", label: "Onglet Créer", path: "/create-capture.html" },
  {
    id: "score",
    label: "Onglet Score",
    path: "/create-capture.html",
    prepare: async (page) => {
      await page.locator("#song-tab-score").click();
      await page.waitForSelector("#song-panel-score");
    },
  },
  {
    id: "production-mix",
    label: "Production — mixage",
    path: "/production-capture.html",
    hash: "#12,confortable,expanded",
  },
  {
    id: "production-clips",
    label: "Production — clips",
    path: "/production-capture.html",
    hash: "#12,confortable,view-clips",
  },
  {
    id: "production-tools",
    label: "Production — outils",
    path: "/production-capture.html",
    hash: "#12,confortable,view-tools",
  },
  {
    id: "production-enregistrement",
    label: "Production — panneau enregistrement",
    path: "/production-capture.html",
    hash: "#12,confortable,record-open",
  },
  {
    id: "reglages-separation",
    label: "Réglages — séparation",
    path: "/settings-capture.html",
    prepare: async (page) => {
      await page.waitForSelector(".settings-card-grid", { timeout: 20_000 });
      await page.getByRole("button", { name: /Séparation des pistes/i }).click();
    },
  },
  {
    id: "reglages-distance",
    label: "Réglages — génération distante",
    path: "/settings-capture.html",
    prepare: async (page) => {
      await page.waitForSelector(".settings-card-grid", { timeout: 20_000 });
      await page.getByRole("button", { name: /Worker GPU distant/i }).click();
    },
  },
  {
    id: "reglages-hote",
    label: "Réglages — hôte",
    path: "/settings-capture.html",
    prepare: async (page) => {
      await page.waitForSelector(".settings-card-grid", { timeout: 20_000 });
      await page.getByRole("button", { name: /Intégration Akasha/i }).click();
    },
  },
  {
    id: "confirmation-regeneration-gate",
    label: "Confirmation — RegenerationGate (mock baseline)",
    path: "/confirm-dialogs-capture.html",
    hash: "#regeneration-gate",
  },
  {
    id: "confirmation-invariant-panel",
    label: "Confirmation — InvariantPanel (baseline mockée)",
    path: "/confirm-dialogs-capture.html",
    hash: "#invariant-panel",
  },
  {
    id: "confirmation-remote-generate",
    label: "Confirmation — RemoteGenerateConfirm (prefs mockées)",
    path: "/confirm-dialogs-capture.html",
    hash: "#remote-generate-confirm",
  },
  {
    id: "confirmation-separation-recommend",
    label: "Confirmation — SeparationRecommendDialog (mock phase3)",
    path: "/confirm-dialogs-capture.html",
    hash: "#separation-recommend",
    prepare: async (page) => {
      await page.waitForSelector(".separation-recommend-popin", { timeout: 10_000 });
    },
  },
  {
    id: "confirmation-update-notice",
    label: "Confirmation — UpdateNotice (Update mocké)",
    path: "/confirm-dialogs-capture.html",
    hash: "#update-notice",
  },
];

export type StateMeasure = {
  state: string;
  foregroundCss: string;
  backgroundStopsCss: string[];
  worstStopContrast: number | null;
  flatBackgroundContrast: number | null;
  passAa: boolean;
};

type ScenarioReport = {
  id: string;
  label: string;
  file: string;
  buttonsOnPage: number;
  referenceButton: string | null;
  stateMeasures: StateMeasure[];
  pageMetricsPass: boolean;
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

export async function measurePrimaryButtonStatesInPage(
  page: Page,
): Promise<{ label: string | null; states: StateMeasure[] }> {
  const btn = page.locator("button.btn.primary").first();
  if ((await btn.count()) === 0) return { label: null, states: [] };
  await btn.scrollIntoViewIfNeeded();
  const label = (await btn.innerText()).trim().replace(/\s+/g, " ");

  const allStates: StateMeasure[] = [];
  for (const state of ["normal", "hover", "focus", "disabled"] as const) {
    if (state === "hover") {
      await btn.hover({ force: true });
    } else if (state === "focus") {
      await btn.focus();
    } else if (state === "disabled") {
      await page.evaluate(() => {
        const b = document.querySelector("button.btn.primary") as HTMLButtonElement | null;
        if (b) b.disabled = true;
      });
    } else {
      await page.evaluate(() => {
        const b = document.querySelector("button.btn.primary") as HTMLButtonElement | null;
        if (b) b.disabled = false;
      });
    }
    await page.waitForTimeout(80);
    const m = await page.evaluate(({ stateName }) => {
      const fn = window.__measurePrimaryButtonFromDom;
      if (!fn) return null;
      return fn(stateName as "normal" | "hover" | "focus" | "disabled");
    }, { stateName: state });
    if (!m) {
      allStates.push({
        state,
        foregroundCss: "",
        backgroundStopsCss: [],
        worstStopContrast: null,
        flatBackgroundContrast: null,
        passAa: false,
      });
      continue;
    }
    allStates.push({
      state: m.state,
      foregroundCss: m.foregroundCss,
      backgroundStopsCss: m.backgroundStopsCss,
      worstStopContrast: m.worstStopContrast,
      flatBackgroundContrast: m.flatBackgroundContrast,
      passAa: m.passAa,
    });
  }

  await page.evaluate(() => {
    const b = document.querySelector("button.btn.primary") as HTMLButtonElement | null;
    if (b) b.disabled = false;
  });
  await btn.blur().catch(() => undefined);
  return { label, states: allStates };
}

async function runScenario(browser: import("playwright").Browser, scenario: Scenario): Promise<ScenarioReport> {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    const url = `http://127.0.0.1:${PORT}${scenario.path}${scenario.hash ?? ""}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await page.waitForTimeout(800);
      }
    }
    if (lastErr) throw lastErr;
    await page.waitForTimeout(500);
    if (scenario.prepare) await scenario.prepare(page);
    await page.waitForSelector("button.btn.primary", { timeout: 15_000 }).catch(() => undefined);

    const pageMetrics = await page.evaluate(() => window.__primaryButtonMetrics?.() ?? null);
    const { label, states } = await measurePrimaryButtonStatesInPage(page);
    const file = `primary-btn-${scenario.id}-1280x720.png`;
    await page.screenshot({
      path: path.join(OUT, file),
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
      timeout: 60_000,
      animations: "disabled",
    });

    return {
      id: scenario.id,
      label: scenario.label,
      file,
      buttonsOnPage: pageMetrics?.buttonsFound ?? 0,
      referenceButton: label,
      stateMeasures: states,
      pageMetricsPass: pageMetrics?.allPassAa ?? false,
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
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--hide-scrollbars",
      ],
    });
    const reports: ScenarioReport[] = [];
    for (const scenario of SCENARIOS) {
      console.log(`Capture : ${scenario.label}…`);
      reports.push(await runScenario(browser, scenario));
    }
    await browser.close();

    const metricsPath = path.join(OUT, "metrics.json");
    await writeFile(metricsPath, `${JSON.stringify({ viewport: VIEWPORT, reports }, null, 2)}\n`);

    const failing = reports.flatMap((r) =>
      r.stateMeasures.filter((s) => !s.passAa).map((s) => `${r.id}/${s.state}`),
    );
    if (failing.length > 0) {
      throw new Error(`Contraste AA échoué : ${failing.join(", ")}`);
    }
    console.log(`OK — ${reports.length} captures, métriques dans ${metricsPath}`);
  } finally {
    vite.kill("SIGTERM");
  }
}

void main();
