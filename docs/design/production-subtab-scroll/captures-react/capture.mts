/**
 * Captures + mesures défilement sous-onglets Production (#203).
 *
 * Usage : CAPTURE_PHASE=after pnpm exec tsx docs/design/production-subtab-scroll/captures-react/capture.mts
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5195;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;
const PHASE = (process.env.CAPTURE_PHASE ?? "after").toLowerCase();

type Viewport = { width: number; height: number };

const VIEWPORTS: Viewport[] = [
  { width: 1280, height: 720 },
  { width: 1280, height: 768 },
];

const SCENES = [
  { id: "mix", hash: "confortable-12", filePrefix: "mix" },
  { id: "tools", hash: "view-tools-12", filePrefix: "tools" },
  { id: "clips", hash: "view-clips-16", filePrefix: "clips" },
] as const;

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
  throw new Error(`serveur Vite inaccessible : ${url}`);
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch {
    return await chromium.launch();
  }
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function main(): Promise<void> {
  const subDir = PHASE === "before" ? "before" : "after";
  mkdirSync(path.join(OUT, subDir), { recursive: true });

  const vite = spawn(
    "pnpm",
    ["exec", "vite", "--port", String(PORT), "--strictPort"],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_CAPTURE: "1" },
      stdio: "ignore",
    },
  );

  await waitServer(BASE);
  const browser = await launchBrowser();
  const metrics: Record<string, unknown> = {
    phase: PHASE,
    measured:
      "Chromium getBoundingClientRect, scrollTop, getComputedStyle(display) — mesuré",
    calculated: [] as string[],
    notTested: ["WebKitGTK", "Tauri natif", "lecteur d'écran"],
    scenes: {} as Record<string, unknown>,
  };

  for (const scene of SCENES) {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewportSize(vp);
      await page.goto(`${BASE}#${scene.hash}`, { waitUntil: "networkidle" });
      const waitSel =
        scene.id === "mix"
          ? ".production-mix-scroll"
          : scene.id === "tools"
            ? '[data-testid="production-tools-scroll"]'
            : '[data-testid="production-clips-scroll"]';
      await page.waitForSelector(waitSel, { state: "visible", timeout: 45_000 });
      await page.waitForTimeout(400);
      const key = `${scene.id}-${vp.width}x${vp.height}-${PHASE}`;
      const pngName = `${scene.filePrefix}-${vp.width}x${vp.height}-${PHASE}.png`;
      const pngPath = path.join(OUT, subDir, pngName);
      await page.screenshot({ path: pngPath, fullPage: false });
      const m = await page.evaluate(() => {
        const fn = (
          window as Window & {
            __productionSubtabScrollMetrics?: () => Record<string, unknown>;
          }
        ).__productionSubtabScrollMetrics;
        return fn?.() ?? null;
      });
      (metrics.scenes as Record<string, unknown>)[key] = {
        file: `${subDir}/${pngName}`,
        sha256: sha256File(pngPath),
        bytes: readFileSync(pngPath).length,
        metrics: m,
      };
      await page.close();
    }
  }

  await browser.close();
  vite.kill("SIGTERM");

  const metricsPath = path.join(OUT, `metrics-${PHASE}.json`);
  writeFileSync(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  console.log(`Captures ${PHASE} → ${path.join(OUT, subDir)}`);
  console.log(`Métriques → ${metricsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
