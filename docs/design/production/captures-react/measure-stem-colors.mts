import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  PRODUCTION_BG0,
  PRODUCTION_WAVE_TRACK_BG,
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
const HASH_EXPANDED = "16,auto,expanded,midplay";
const HASH_COLLAPSED = "16,auto,collapsed,midplay";
const BASE_EXPANDED = `http://127.0.0.1:${PORT}/production-capture.html#${HASH_EXPANDED}`;
const BASE_COLLAPSED = `http://127.0.0.1:${PORT}/production-capture.html#${HASH_COLLAPSED}`;

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
  await waitServer(BASE_EXPANDED);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE_EXPANDED);
  await page.waitForTimeout(900);

  const domExpanded = await page.evaluate(() => window.__productionStemColors?.() ?? null);
  const theory = measureStemContrasts(PRODUCTION_BG0);
  const theoryOnWaveFrame = measureStemContrasts(PRODUCTION_WAVE_TRACK_BG);

  await page.screenshot({
    path: path.join(OUT, "production-stem-colors-midplay-1280x720.png"),
    fullPage: false,
  });

  const transport = await page.evaluate(() => window.__productionTransportMetrics?.() ?? null);

  await browser.close();

  const browserCollapsed = await chromium.launch();
  const pageCollapsed = await browserCollapsed.newPage({ viewport: { width: 1280, height: 720 } });
  await pageCollapsed.goto(BASE_COLLAPSED);
  await pageCollapsed.waitForTimeout(1200);
  const domCollapsed = await pageCollapsed.evaluate(() => window.__productionStemColors?.() ?? null);
  await pageCollapsed.screenshot({
    path: path.join(OUT, "production-stem-colors-collapsed-midplay-1280x720.png"),
    fullPage: false,
  });
  await browserCollapsed.close();

  const dom = domExpanded
    ? {
        ...domExpanded,
        collapsedGroupSample: domCollapsed?.collapsedGroupSample ?? null,
        collapsedCaptureHash: HASH_COLLAPSED,
      }
    : null;

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
    hash: HASH_EXPANDED,
    bg0: dom?.bg0 ?? PRODUCTION_BG0,
    unplayedAlpha: WAVE_UNPLAYED_ALPHA,
    theory,
    theoryOnWaveFrame,
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
    if (s.unplayedPixelHex === s.playedPixelHex) {
      throw new Error(
        `pixels lue et à venir identiques pour ${s.role} — échantillonnage invalide`,
      );
    }
  }
  const collapsed = dom?.collapsedGroupSample;
  if (!collapsed?.stripMatchesWave || !collapsed.upcomingPass || !collapsed.playedVsUnplayedPass) {
    throw new Error("groupe replié (Rythmique) : mesure pastille/waveform manquante ou sous seuil");
  }
  if (collapsed.unplayedPixelHex === collapsed.playedPixelHex) {
    throw new Error("groupe replié : pixels lue et à venir identiques");
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
  const dom = apres.dom as {
    bg0: string;
    stems: Array<{
      role: string;
      stripHex: string | null;
      upcomingContrastOnBg: number;
      playedVsUnplayedContrast: number;
      unplayedPixelHex: string | null;
      playedPixelHex: string | null;
      canvasBgHex: string | null;
    }>;
    collapsedGroupSample?: {
      role: string;
      groupFamily?: string;
      upcomingContrastOnBg: number;
      playedVsUnplayedContrast: number;
      stripMatchesWave: boolean;
    } | null;
    collapsedCaptureHash?: string;
  } | null;

  const waveBg = dom?.stems[0]?.canvasBgHex ?? PRODUCTION_WAVE_TRACK_BG;

  const lines = [
    "# Contrastes WCAG — stems Production (#159)",
    "",
    `Mesures **réelles** : harness \`production-capture.html\` (\`#${HASH_EXPANDED}\`), Chromium 1280×720.`,
    "Pastille = `getComputedStyle(.production-mix-strip)` ; pixels canvas = barre pleine à gauche (lue) / droite (à venir) du curseur.",
    `Groupe replié : \`#${HASH_COLLAPSED}\` — capture \`production-stem-colors-collapsed-midplay-1280x720.png\`.`,
    "",
    "## Source unique (après)",
    "",
    "| Rôle | Hex (`TRACK_ROLE_COLORS` = pastille = `--track-wave`) |",
    "|---|---|",
    ...theory.map((r) => `| ${r.role} | \`${r.solidHex}\` |`),
    "",
    "## Partie à venir @ 65 % — mesure DOM (pixels canvas)",
    "",
    `Fond canvas (\`.waveform-frame\`) : **${waveBg}**. Seuil **${WCAG_UI_CONTRAST_MIN}:1**.`,
    "",
    "| Stem (plus sombres d’abord, DOM) | Pixel à venir | Ratio sur fond |",
    "|---|---|---|",
  ];

  const sortedDom = [...(dom?.stems ?? [])].sort(
    (a, b) => a.upcomingContrastOnBg - b.upcomingContrastOnBg,
  );
  for (const row of sortedDom) {
    lines.push(
      `| ${row.role} | \`${row.unplayedPixelHex ?? "—"}\` | **${row.upcomingContrastOnBg.toFixed(2)}:1** |`,
    );
  }

  lines.push(
    "",
    "## Écart partie lue / à venir — mesure DOM (≥ 1,3:1)",
    "",
    "| Stem | Pixel lue | Pixel à venir | Ratio |",
    "|---|---|---|---|",
    ...sortedDom.map((row) => {
      return `| ${row.role} | \`${row.playedPixelHex ?? "—"}\` | \`${row.unplayedPixelHex ?? "—"}\` | **${row.playedVsUnplayedContrast.toFixed(2)}:1** |`;
    }),
    "",
    "## Calcul théorique (65 % sur `--bg0`, non DOM)",
    "",
    "| Stem | Composite calculé | Ratio | Écart lue/à venir |",
    "|---|---|---|---|",
    ...[...theory]
      .sort((a, b) => a.upcomingContrast - b.upcomingContrast)
      .map(
        (row) =>
          `| ${row.role} | \`${row.upcomingCompositeHex}\` | ${row.upcomingContrast.toFixed(2)}:1 | ${row.playedVsUpcomingContrast.toFixed(2)}:1 |`,
      ),
    "",
    "## Groupe Rythmique replié (mesure DOM)",
    "",
    dom?.collapsedGroupSample
      ? `Rôle échantillon : **${dom.collapsedGroupSample.role}** (\`${dom.collapsedGroupSample.groupFamily ?? "rythmique"}\`). À venir **${dom.collapsedGroupSample.upcomingContrastOnBg.toFixed(2)}:1** ; écart lue/à venir **${dom.collapsedGroupSample.playedVsUnplayedContrast.toFixed(2)}:1** ; pastille = waveform : **${dom.collapsedGroupSample.stripMatchesWave ? "oui" : "non"}**.`
      : "_Non mesuré._",
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
