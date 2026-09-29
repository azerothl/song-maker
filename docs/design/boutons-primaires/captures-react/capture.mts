/**
 * Captures + mesures de contraste pour `.btn.primary` (#186).
 *
 * Usage : pnpm exec tsx docs/design/boutons-primaires/captures-react/capture.mts
 *
 * Pages React réelles (Vite + mock Tauri) — pas de maquette HTML statique.
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

type StateMeasure = {
  state: StateName;
  foregroundCss: string;
  foregroundHex: string;
  opacity: number;
  stops: StopMeasure[];
  minRatio: number;
  pass: boolean;
};

type ScreenMeasure = {
  id: string;
  screen: string;
  selector: string;
  label: string;
  file: string;
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
  prepare?: (page: Page) => Promise<void>;
};

const SCENARIOS: Scenario[] = [
  {
    id: "bibliotheque",
    screen: "Bibliothèque",
    path: "/sidebar-capture.html",
    selector: ".panel.library .btn.primary",
    file: "bibliotheque-primary-1280x720.png",
  },
  {
    id: "creer",
    screen: "Créer",
    path: "/create-capture.html",
    selector: ".song-create-generate-btn",
    file: "creer-primary-1280x720.png",
  },
  {
    id: "production-armer",
    screen: "Production — Armer",
    path: "/production-capture.html",
    hash: "#12,confortable,record-open",
    selector: ".record-panel button.btn.primary",
    file: "production-armer-primary-1280x720.png",
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
    id: "production-mesurer",
    screen: "Production — Mesurer le mix rendu",
    path: "/production-capture.html",
    hash: "#12,confortable,view-tools",
    selector: ".phase3-actions button.btn.primary",
    file: "production-mesurer-primary-1280x720.png",
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
  },
  {
    id: "confirmation-invariant-panel",
    screen: "Confirmation — InvariantPanel",
    path: "/confirm-dialogs-capture.html",
    hash: "#invariant-panel",
    selector: ".invariant-panel button.btn.primary",
    file: "confirmation-invariant-panel-primary-1280x720.png",
  },
  {
    id: "confirmation-remote-generate",
    screen: "Confirmation — RemoteGenerateConfirm",
    path: "/confirm-dialogs-capture.html",
    hash: "#remote-generate-confirm",
    selector: ".remote-generate-confirm button.btn.primary",
    file: "confirmation-remote-generate-primary-1280x720.png",
  },
  {
    id: "confirmation-separation-recommend",
    screen: "Confirmation — SeparationRecommendDialog",
    path: "/confirm-dialogs-capture.html",
    hash: "#separation-recommend",
    selector: ".separation-recommend-popin button.btn.primary, button.btn.primary",
    file: "confirmation-separation-recommend-primary-1280x720.png",
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
  },
];

declare global {
  interface Window {
    __measurePrimaryBtnState?: (
      sel: string,
      stateName: StateName,
    ) => StateMeasure;
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

async function measureState(
  page: Page,
  selector: string,
  state: StateName,
): Promise<StateMeasure> {
  if (state === "disabled") {
    await page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (btn) btn.disabled = true;
    }, selector);
  } else {
    await page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (!btn) return;
      btn.disabled = false;
      btn.blur();
    }, selector);
  }

  if (state === "hover") {
    await page.hover(selector, { force: true });
  } else if (state === "focus") {
    await page.focus(selector);
  } else {
    await page.mouse.move(0, 0);
  }

  const measure = await page.evaluate(
    ([sel, stateName]) => {
      const fn = window.__measurePrimaryBtnState;
      if (!fn) throw new Error("__measurePrimaryBtnState manquant");
      return fn(sel, stateName as StateName);
    },
    [selector, state] as [string, StateName],
  );

  if (state === "disabled") {
    await page.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    }, selector);
  }
  if (state === "hover" || state === "focus") {
    await page.mouse.move(0, 0);
    await page.evaluate((sel) => {
      (document.querySelector(sel) as HTMLButtonElement | null)?.blur();
    }, selector);
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

function buildContrastesMd(screens: ScreenMeasure[]): string {
  const lines: string[] = [
    "# Contrastes — boutons primaires (#186)",
    "",
    `Généré le ${new Date().toISOString()}.`,
    "",
    "Mesures DOM : `getComputedStyle` (couleur du texte, opacity, `background-image` / `background-color`) compositées sur `--bg0`. Seuil WCAG 2.2 AA texte : **4,5:1**.",
    "",
    "## Synthèse",
    "",
    "| Écran | Bouton | Min (tous états) | AA |",
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
      "| État | Texte | Opacité | Arrêt | Fond | Ratio | AA |",
      "|------|-------|---------|-------|------|-------|----|",
    );
    for (const st of s.states) {
      for (const stop of st.stops) {
        lines.push(
          `| ${st.state} | ${st.foregroundHex} | ${st.opacity} | ${stop.stop} | ${stop.backgroundHex} | ${stop.ratio.toFixed(2)}:1 | ${stop.pass ? "OK" : "FAIL"} |`,
        );
      }
    }
  }

  lines.push("", "## Captures", "");
  for (const s of screens) {
    lines.push(`- [\`${s.file}\`](captures-react/${s.file})`);
  }

  lines.push(
    "",
    "## Non vérifiés",
    "",
    "| Élément | Raison |",
    "|---------|--------|",
    "| `scoreTabBench` / `scoreTabBenchApp` | Banc interne de perf, hors parcours produit. |",
    "| WebKitGTK | Mesures Chromium (Playwright), pas le runtime Tauri natif. |",
    "| Lecteur d’écran | Hors périmètre contraste (pas de parcours NVDA/Orca). |",
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
    await page.screenshot({
      path: path.join(OUT, scenario.file),
      fullPage: false,
      animations: "disabled",
    });

    return {
      id: scenario.id,
      screen: scenario.screen,
      selector: scenario.selector,
      label,
      file: scenario.file,
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
      `${JSON.stringify({ aaMin: AA_MIN, viewport: VIEWPORT, screens }, null, 2)}\n`,
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
            min: Math.min(...s.states.map((st) => st.minRatio)),
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
        `contraste < ${AA_MIN}:1 sur ${failed.map((f) => f.screen).join(", ")}`,
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
