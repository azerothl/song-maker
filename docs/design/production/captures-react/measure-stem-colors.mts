import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  PRODUCTION_BG0,
  STEM_CONTRAST_ROLES,
  TRACK_ROLE_COLORS,
  WAVE_UNPLAYED_ALPHA,
  WAVE_PLAYED_VS_UNPLAYED_MIN,
  WCAG_UI_CONTRAST_MIN,
  blendOverBackground,
  contrastRatio,
  lightenColor,
  measureStemContrasts,
  playedStemColorHsl,
  withAlpha,
} from "../../../../src/lib/trackRoleColors.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const DOCS = path.resolve(__dirname, "..");
const PORT = 5183;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html#16,auto,expanded,midplay`;

const LEGACY_ALPHA = 0.48;

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

function legacyAvantRows() {
  const legacyBases: Record<string, string> = {
    vocals: "#ff9aa3",
    drums: "#5eecf8",
    bass: "#a78bfa",
    guitar: "#c4a8ff",
    piano: "#a78bfa",
    other: "#c4a8ff",
  };
  return STEM_CONTRAST_ROLES.map((role) => {
    const base = legacyBases[role]!;
    const upcoming = blendOverBackground(base, PRODUCTION_BG0, LEGACY_ALPHA);
    const played = lightenColor(base, 0.18);
    return {
      role,
      baseHex: base,
      unplayedAlpha: LEGACY_ALPHA,
      upcomingComposite: upcoming,
      upcomingContrast: Math.round(contrastRatio(upcoming, PRODUCTION_BG0) * 100) / 100,
      playedHex: played,
      playedVsUpcomingContrast:
        Math.round(contrastRatio(played, upcoming) * 100) / 100,
    };
  });
}

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE);
  await page.waitForTimeout(900);

  const dom = await page.evaluate(() => window.__productionStemColors?.() ?? null);
  const theory = measureStemContrasts();

  await page.screenshot({
    path: path.join(OUT, "production-stem-colors-midplay-1280x720.png"),
    fullPage: false,
  });

  const transport = await page.evaluate(() => window.__productionTransportMetrics?.() ?? null);

  await browser.close();

  const metricsPath = path.join(OUT, "metrics.json");
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(readFileSync(metricsPath, "utf8")) as Record<string, unknown>;
  } catch {
    all = {};
  }

  const stemColorsApres = {
    measuredAt: new Date().toISOString(),
    viewport: "1280x720",
    hash: "16,auto,expanded,midplay",
    bg0: dom?.bg0 ?? PRODUCTION_BG0,
    unplayedAlpha: WAVE_UNPLAYED_ALPHA,
    theory,
    dom,
    trackRoleColors: TRACK_ROLE_COLORS,
  };

  all.stemColorsAvant = {
    note: "Palette et opacité 48 % avant #159 (main pré-merge)",
    bg0: PRODUCTION_BG0,
    unplayedAlpha: LEGACY_ALPHA,
    rows: legacyAvantRows(),
  };
  all.stemColorsApres = stemColorsApres;
  if (transport) {
    all.transport1280x720 = transport;
  }

  writeFileSync(metricsPath, JSON.stringify(all, null, 2), "utf8");

  writeFileSync(
    path.join(DOCS, "contrastes.md"),
    buildContrastesMd(stemColorsApres, legacyAvantRows()),
    "utf8",
  );

  for (const row of theory) {
    if (!row.upcomingPass || !row.playedVsUpcomingPass) {
      throw new Error(`stem ${row.role} ne passe pas les seuils théoriques`);
    }
  }
  for (const s of dom?.stems ?? []) {
    if (!s.stripMatchesWave) {
      throw new Error(`pastille !== waveform pour ${s.role}`);
    }
    if (!s.upcomingPass || !s.playedVsUnplayedPass) {
      throw new Error(`mesure DOM ${s.role} sous seuil`);
    }
  }
  if ((transport as { rowsFullyVisible?: number } | null)?.rowsFullyVisible != null) {
    const rows = (transport as { rowsFullyVisible: number }).rowsFullyVisible;
    if (rows < 9) {
      throw new Error(`régression densité: ${rows} pistes visibles (< 9)`);
    }
  }
} finally {
  vite.kill("SIGTERM");
}

function buildContrastesMd(
  apres: Record<string, unknown>,
  avant: ReturnType<typeof legacyAvantRows>,
): string {
  const theory = apres.theory as ReturnType<typeof measureStemContrasts>;
  const dom = apres.dom as { bg0: string; stems: Array<{ role: string; stripHex: string | null; unplayedContrastOnBg: number; playedVsUnplayedContrast: number }> } | null;

  const lines = [
    "# Contrastes WCAG — stems Production (#159)",
    "",
    "Mesures **réelles** : harness `production-capture.html` (`#16,auto,expanded,midplay`), Chromium 1280×720.",
    "Pastille = `getComputedStyle(.production-mix-strip)` ; waveform = `var(--track-wave)` + pixels canvas.",
    "",
    "## Source unique (après)",
    "",
    "| Rôle | Hex (`TRACK_ROLE_COLORS` = pastille = `--track-wave`) |",
    "|---|---|",
    ...theory.map((r) => `| ${r.role} | \`${r.solidHex}\` |`),
    "",
    "## Partie à venir @ 65 % sur fond réel",
    "",
    `Fond \`--bg0\` / canvas : **${dom?.bg0 ?? PRODUCTION_BG0}**. Seuil **${WCAG_UI_CONTRAST_MIN}:1**.`,
    "",
    "| Stem (plus sombres d’abord) | Composite | Ratio DOM/théorie |",
    "|---|---|---|",
  ];

  const sorted = [...theory].sort((a, b) => a.upcomingContrast - b.upcomingContrast);
  for (const row of sorted) {
    const domRow = dom?.stems.find((s) => s.role === row.role);
    const ratio = domRow?.unplayedContrastOnBg ?? row.upcomingContrast;
    lines.push(
      `| ${row.role} | \`${row.upcomingCompositeHex}\` | **${ratio.toFixed(2)}:1** |`,
    );
  }

  lines.push(
    "",
    "## Écart partie lue / à venir (≥ 1,3:1)",
    "",
    "| Stem | Ratio |",
    "|---|---|",
    ...sorted.map((row) => {
      const domRow = dom?.stems.find((s) => s.role === row.role);
      const ratio = domRow?.playedVsUnplayedContrast ?? row.playedVsUpcomingContrast;
      return `| ${row.role} | **${ratio.toFixed(2)}:1** |`;
    }),
    "",
    "## Avant #159 (opacité 48 %, bases héritées)",
    "",
    "| Stem | Ratio @ 48 % |",
    "|---|---|",
    ...avant
      .sort((a, b) => a.upcomingContrast - b.upcomingContrast)
      .map((r) => `| ${r.role} | ${r.upcomingContrast.toFixed(2)}:1 |`),
    "",
    "Régénération : `pnpm exec tsx docs/design/production/captures-react/measure-stem-colors.mts`",
    "",
  );
  return lines.join("\n");
}
