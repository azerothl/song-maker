import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5181;
const HASH = "16,auto,expanded";
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#${HASH}`;

type TransportMetrics = {
  playButtonPx: { width: number; height: number };
  globalWaveformPx: { width: number; height: number };
  bannerPx: { width: number; height: number };
  waveformWidthShare: number;
  rowsFullyVisible?: number;
};

async function waitServer(url: string, timeoutMs = 60_000): Promise<void> {
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

async function capturePhase(
  browser: import("playwright").Browser,
  phase: "avant" | "apres",
): Promise<Record<string, TransportMetrics>> {
  const out: Record<string, TransportMetrics> = {};
  for (const [w, h, tag] of [
    [1280, 720, "1280x720"],
    [1024, 700, "1024x700"],
  ] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(BASE);
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const banner = document.querySelector(".production-mix-master.mix-master-banner");
      const play = document.querySelector(".mix-master-play");
      const wave = document.querySelector(".mix-master-wave .waveform-canvas");
      const scroll = document.querySelector(".production-mix-scroll");
      if (!banner || !play || !wave) return null;
      const br = banner.getBoundingClientRect();
      const pr = play.getBoundingClientRect();
      const wr = wave.getBoundingClientRect();
      let rowsFullyVisible = 0;
      if (scroll) {
        const scrollRect = scroll.getBoundingClientRect();
        const rows = Array.from(document.querySelectorAll(".production-mix-row")).filter(
          (e) => (e as HTMLElement).offsetParent !== null,
        );
        rowsFullyVisible = rows.filter((r) => {
          const b = r.getBoundingClientRect();
          return b.top >= scrollRect.top - 1 && b.bottom <= scrollRect.bottom + 1;
        }).length;
      }
      return {
        playButtonPx: { width: pr.width, height: pr.height },
        globalWaveformPx: { width: wr.width, height: wr.height },
        bannerPx: { width: br.width, height: br.height },
        waveformWidthShare: wr.width / br.width,
        rowsFullyVisible,
      };
    });
    if (!m) throw new Error(`métriques transport manquantes (${phase} ${tag})`);
    out[tag] = m;
    await page.screenshot({
      path: path.join(OUT, `production-transport-${phase}-${tag}.png`),
    });
    console.log(`${phase} ${tag}`, JSON.stringify(m));
  }
  return out;
}

const phase = (process.argv[2] === "apres" ? "apres" : "avant") as "avant" | "apres";

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const captured = await capturePhase(browser, phase);
  await browser.close();

  const metricsPath = path.join(OUT, "metrics.json");
  let all: Record<string, unknown> = {};
  try {
    const { readFileSync } = await import("node:fs");
    all = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<string, unknown>;
  } catch {
    all = {};
  }
  all[phase] = captured;
  writeFileSync(metricsPath, JSON.stringify(all, null, 2), "utf8");

  if (phase === "apres") {
    const m720 = captured["1280x720"];
    if (m720.playButtonPx.width > 40 || m720.playButtonPx.height > 40) {
      throw new Error("bouton lecture encore trop large");
    }
    if (m720.globalWaveformPx.height < 56) {
      throw new Error("waveform globale < 56 px de haut");
    }
    if (m720.waveformWidthShare < 0.45) {
      throw new Error("waveform occupe trop peu de la largeur du bandeau");
    }
    if ((m720.rowsFullyVisible ?? 0) < 9) {
      throw new Error("moins de 9 pistes visibles en compact auto 16 pistes");
    }
  }
} finally {
  vite.kill("SIGTERM");
}
