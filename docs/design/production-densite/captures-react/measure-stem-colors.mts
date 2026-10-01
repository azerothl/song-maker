/**
 * Mesure les 6 couleurs de stems (pastille + --track-wave) via getComputedStyle
 * et le contraste de la partie à venir (~65 %) sur --bg0.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  PRODUCTION_BG0,
  STEM_CONTRAST_ROLES,
  TRACK_ROLE_COLORS,
  WAVE_UNPLAYED_ALPHA,
  WCAG_UI_CONTRAST_MIN,
  blendOverBackground,
  contrastRatio,
  lightenColor,
} from "../../../../src/lib/trackRoleColors.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const DOCS = path.resolve(__dirname, "..");
const PORT = 5181;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;

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

function rgbToHex(rgb: string): string | null {
  const t = rgb.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(t)) return t;
  const m = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => Math.round(Number(x)));
  return `#${[r, g, b].map((c) => c!.toString(16).padStart(2, "0")).join("")}`;
}

type StemCssSample = {
  role: string;
  stripBackground: string;
  trackWaveResolved: string;
  trackWaveVarRaw: string;
  bg0: string;
  solidExpected: string;
  stripMatchesWave: boolean;
  waveMatchesExpected: boolean;
  upcomingComposite: string;
  upcomingContrast: number;
  playedHex: string;
  playedContrast: number;
  upcomingPass: boolean;
  playedPass: boolean;
};

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}?shot=confortable-12#12,confortable,midplay`);
  await page.waitForTimeout(700);

  const samples = await page.evaluate((roles: string[]) => {
    const root = getComputedStyle(document.documentElement);
    const bg0 = root.getPropertyValue("--bg0").trim() || root.backgroundColor;
    const out: Array<{
      role: string;
      stripBackground: string;
      trackWaveResolved: string;
      trackWaveVarRaw: string;
      bg0: string;
    }> = [];

    for (const role of roles) {
      const row = document.querySelector(`.production-mix-row[data-role="${role}"]`);
      if (!row) continue;
      const strip = row.querySelector(".production-mix-strip");
      const rowStyle = getComputedStyle(row);
      const stripStyle = strip ? getComputedStyle(strip) : null;
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;width:1px;height:1px;pointer-events:none;background:var(--track-wave)";
      row.appendChild(probe);
      const waveResolved = getComputedStyle(probe).backgroundColor;
      probe.remove();
      out.push({
        role,
        stripBackground: stripStyle?.backgroundColor ?? "",
        trackWaveResolved: waveResolved,
        trackWaveVarRaw: rowStyle.getPropertyValue("--track-wave").trim(),
        bg0,
      });
    }
    return out;
  }, [...STEM_CONTRAST_ROLES]);

  const rows: StemCssSample[] = samples.map((s) => {
    const solidExpected = TRACK_ROLE_COLORS[s.role]!.toLowerCase();
    const stripHex = rgbToHex(s.stripBackground) ?? s.stripBackground;
    const waveHex = rgbToHex(s.trackWaveResolved) ?? s.trackWaveResolved;
    const bg = rgbToHex(s.bg0) ?? PRODUCTION_BG0;
    const upcomingComposite = blendOverBackground(solidExpected, bg, WAVE_UNPLAYED_ALPHA);
    const upcomingContrast = contrastRatio(upcomingComposite, bg);
    const playedHex = lightenColor(solidExpected);
    const playedContrast = contrastRatio(playedHex, bg);
    return {
      role: s.role,
      stripBackground: stripHex,
      trackWaveResolved: waveHex,
      trackWaveVarRaw: s.trackWaveVarRaw,
      bg0: bg,
      solidExpected,
      stripMatchesWave: stripHex === waveHex,
      waveMatchesExpected: waveHex === solidExpected,
      upcomingComposite,
      upcomingContrast,
      playedHex,
      playedContrast,
      upcomingPass: upcomingContrast >= WCAG_UI_CONTRAST_MIN,
      playedPass: playedContrast >= WCAG_UI_CONTRAST_MIN,
    };
  });

  await page.screenshot({
    path: path.join(OUT, "production-stem-colors-midplay-1280x720.png"),
    fullPage: false,
  });

  await page.goto(`${BASE}?shot=compact-12#12,compact,midplay`);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, "production-stem-colors-compact-midplay-1280x720.png"),
    fullPage: false,
  });

  await page.goto(`${BASE}?shot=confortable-6#6,confortable,midplay`);
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, "production-stem-colors-6pistes-midplay-1280x720.png"),
    fullPage: false,
  });

  await browser.close();

  const payload = {
    measuredAt: new Date().toISOString(),
    viewport: { width: 1280, height: 720 },
    captureHash: "12,confortable,midplay",
    background: PRODUCTION_BG0,
    unplayedAlpha: WAVE_UNPLAYED_ALPHA,
    wcagThreshold: WCAG_UI_CONTRAST_MIN,
    criterion: "WCAG 2.2 1.4.11",
    method:
      "getComputedStyle on .production-mix-strip.backgroundColor and probe background:var(--track-wave)",
    stems: rows,
    allUpcomingPass: rows.every((r) => r.upcomingPass),
    allPlayedPass: rows.every((r) => r.playedPass),
    allStripMatchWave: rows.every((r) => r.stripMatchesWave && r.waveMatchesExpected),
  };

  writeFileSync(path.join(OUT, "stem-colors-metrics.json"), JSON.stringify(payload, null, 2));
  writeFileSync(path.join(DOCS, "stem-colors-metrics.json"), JSON.stringify(payload, null, 2));

  console.log(JSON.stringify(payload, null, 2));

  if (rows.length < 6) {
    throw new Error(`attendu 6 stems mesurés, obtenu ${rows.length}`);
  }
  if (!payload.allUpcomingPass || !payload.allPlayedPass) {
    throw new Error("contraste stem < 3:1");
  }
  if (!payload.allStripMatchWave) {
    console.error(
      "pastille / wave mismatch:",
      rows.filter((r) => !r.stripMatchesWave || !r.waveMatchesExpected),
    );
    throw new Error("pastille et --track-wave divergent pour au moins un stem");
  }
} finally {
  vite.kill("SIGTERM");
}
