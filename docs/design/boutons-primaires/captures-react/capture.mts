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
  screen: string;
  selector: string;
  label: string;
  states: StateMeasure[];
  pass: boolean;
};

declare global {
  interface Window {
    __measurePrimaryBtnState?: (
      sel: string,
      stateName: StateName,
    ) => StateMeasure;
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
    await page.hover(selector);
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
    "Mesures DOM : `getComputedStyle` (couleur du texte, opacity) + résolution des arrêts du dégradé (`--accent` / `--accent-2`, ou `color-mix` désactivé) via sonde, compositées sur `--bg0`. Seuil WCAG 2.2 AA texte : **4,5:1**.",
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

  lines.push(
    "",
    "## Captures",
    "",
    "- [`bibliotheque-primary-1280x720.png`](captures-react/bibliotheque-primary-1280x720.png)",
    "- [`creer-primary-1280x720.png`](captures-react/creer-primary-1280x720.png)",
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
    const browser = await chromium.launch();

    {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.goto(`http://127.0.0.1:${PORT}/sidebar-capture.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector(".panel.library .btn.primary", {
        timeout: 15_000,
      });
      await page.waitForTimeout(300);
      await injectMeasure(page);
      const selector = ".panel.library .btn.primary";
      const label =
        (await page.locator(selector).first().innerText()).trim() ||
        "Nouveau";
      const states = await measureButtonStates(page, selector);
      screens.push({
        screen: "Bibliothèque",
        selector,
        label,
        states,
        pass: states.every((s) => s.pass),
      });
      await page.screenshot({
        path: path.join(OUT, "bibliotheque-primary-1280x720.png"),
        fullPage: false,
      });
      await page.close();
    }

    {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.goto(`http://127.0.0.1:${PORT}/create-capture.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForSelector(".song-create-generate-btn", {
        timeout: 15_000,
      });
      await page.waitForTimeout(300);
      await injectMeasure(page);
      const selector = ".song-create-generate-btn";
      const label =
        (await page.locator(selector).first().innerText()).trim() ||
        "Générer";
      const states = await measureButtonStates(page, selector);
      screens.push({
        screen: "Créer",
        selector,
        label,
        states,
        pass: states.every((s) => s.pass),
      });
      await page.screenshot({
        path: path.join(OUT, "creer-primary-1280x720.png"),
        fullPage: false,
      });
      await page.close();
    }

    await browser.close();

    await writeFile(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify({ aaMin: AA_MIN, screens }, null, 2)}\n`,
    );
    await writeFile(
      path.join(ROOT, "docs/design/boutons-primaires/contrastes.md"),
      buildContrastesMd(screens),
    );

    const failed = screens.filter((s) => !s.pass);
    console.log(JSON.stringify({ screens, failed: failed.length }, null, 2));
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
