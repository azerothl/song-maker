import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VISIBILITY_BROWSER_BUNDLE } from "./visibility.browser.ts";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5187;
const BASE = `http://127.0.0.1:${PORT}/separation-export-a11y-capture.html`;

const SCENES = [
  "sep-header",
  "sep-footer",
  "sep-download",
  "sep-exclusions",
  "sep-revert",
  "sep-run-blocked",
  "export-drawer-12",
  "export-drawer-12-after-export",
  "export-mix",
  "export-stems-none-selected",
  "regen-gate-blocked",
] as const;

type SceneId = (typeof SCENES)[number];

type SceneMetrics = Record<string, unknown>;

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

async function measureScene(
  page: import("playwright").Page,
  scene: SceneId,
): Promise<SceneMetrics> {
  await page.goto(`${BASE}#${scene}`);
  const waitMs = scene.includes("after-export")
    ? 1400
    : scene === "export-stems-none-selected"
      ? 1200
      : 950;
  await page.waitForTimeout(waitMs);

  const metrics = await page.evaluate(
    ({ sceneName, script }) => {
      // eslint-disable-next-line no-eval
      eval(script);
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (sceneName === "regen-gate-blocked") {
      const proceed = document.querySelector(
        '[data-testid="regen-gate-proceed"]',
      ) as HTMLButtonElement | null;
      const reason = document.querySelector(
        '[data-testid="regen-gate-proceed-blocked-reason"]',
      ) as HTMLElement | null;
      const describedBy = proceed?.getAttribute("aria-describedby");
      return {
        scene: sceneName,
        viewport: { width: vw, height: vh },
        regenProceedReach: __measureReachability(proceed),
        regenProceedReasonReach: __measureReachability(reason),
        regenProceedAriaDisabled:
          proceed?.getAttribute("aria-disabled") === "true",
        regenDescribedByLinked: Boolean(
          describedBy && document.getElementById(describedBy) === reason,
        ),
        mockupNoteAbsent: true,
      };
    }

    const popin = document.querySelector(
      sceneName.startsWith("export")
        ? ".export-dialog-popin"
        : ".separation-recommend-popin",
    ) as HTMLElement | null;
    const scroll = popin?.querySelector(
      ".anchored-popin-scroll",
    ) as HTMLElement | null;
    const footer = document.querySelector(
      sceneName.startsWith("export")
        ? '[data-testid="export-dialog-footer"]'
        : '[data-testid="sep-recommend-footer"]',
    ) as HTMLElement | null;
    const exportRun = document.querySelector(
      '[data-testid="export-run"]',
    ) as HTMLElement | null;
    const sepRun = document.querySelector(
      '[data-testid="sep-recommend-run"]',
    ) as HTMLElement | null;

    const footerReach = __measureReachability(footer);
    const exportRunReach = __measureReachability(exportRun);
    const sepRunReach = __measureReachability(sepRun);
    const horiz = __measureHorizontalOverflow(scroll);

    const badge = document.querySelector(
      ".sep-license-badge",
    ) as HTMLElement | null;
    const badgeStyle = badge ? getComputedStyle(badge) : null;
    const badgeBg = popin
      ? getComputedStyle(popin).backgroundColor
      : "rgb(32, 36, 58)";
    const badgeContrast = badgeStyle
      ? __contrastRatio(badgeStyle.color, badgeBg)
      : null;

    const dateEl = document.querySelector(
      ".sep-license-date",
    ) as HTMLElement | null;
    const dateStyle = dateEl ? getComputedStyle(dateEl) : null;
    const dateContrast = dateStyle
      ? __contrastRatio(dateStyle.color, badgeBg)
      : null;

    const xIcon = document.querySelector(
      ".sep-exclusion-x",
    ) as HTMLElement | null;
    const xContrast = xIcon
      ? __contrastRatio(getComputedStyle(xIcon).color, badgeBg)
      : null;

    const download = document.querySelector(
      '[data-testid^="sep-download-"]',
    ) as HTMLButtonElement | null;
    const downloadReason = document.querySelector(
      '[data-testid^="sep-download-reason-"]',
    ) as HTMLElement | null;
    const runBlockedReason = document.querySelector(
      '[data-testid="sep-run-blocked-reason"]',
    ) as HTMLElement | null;
    const summary = document.querySelector(
      '[data-testid="sep-exclusions-summary"]',
    ) as HTMLElement | null;
    const revert = document.querySelector(
      '[data-testid="sep-revert-recommend"]',
    ) as HTMLElement | null;
    const formatLive = document.querySelector(
      '[data-testid="export-format-live"]',
    ) as HTMLElement | null;
    const disabledReason = document.querySelector(
      '[data-testid="export-disabled-reason"]',
    ) as HTMLElement | null;
    const title = document.querySelector(
      sceneName.startsWith("export")
        ? ".export-dialog-popin h3"
        : ".separation-recommend-popin h3",
    ) as HTMLElement | null;

    return {
      scene: sceneName,
      viewport: { width: vw, height: vh },
      popinRect: popin?.getBoundingClientRect(),
      footerReach,
      exportRunReach,
      sepRunReach,
      titleReach: __measureReachability(title),
      downloadReasonReach: __measureReachability(downloadReason),
      downloadReach: __measureReachability(download),
      exclusionsSummaryReach: __measureReachability(summary),
      revertReach: __measureReachability(revert),
      runBlockedReasonReach: __measureReachability(runBlockedReason),
      formatLivePresent: Boolean(formatLive?.getAttribute("aria-live")),
      exportDisabledReasonReach: __measureReachability(disabledReason),
      exportRunAriaDisabled:
        exportRun?.getAttribute("aria-disabled") === "true" || undefined,
      exportDescribedByLinked: Boolean(
        disabledReason &&
          exportRun?.getAttribute("aria-describedby") &&
          document.getElementById(
            exportRun.getAttribute("aria-describedby") as string,
          ) === disabledReason,
      ),
      horizontalOverflow: horiz,
      downloadAriaDisabled: download?.getAttribute("aria-disabled") === "true",
      sepRunAriaDisabled:
        sepRun?.getAttribute("aria-disabled") === "true" || undefined,
      contrast: {
        badge: badgeContrast,
        readDate: dateContrast,
        exclusionX: xContrast,
      },
      mockupNoteAbsent: !document.body.innerText.includes("Maquette Alphonse"),
    };
    },
    { sceneName: scene, script: VISIBILITY_BROWSER_BUNDLE },
  );

  await page.screenshot({
    path: path.join(OUT, `${scene}-1280x720.png`),
    fullPage: false,
  });

  return metrics;
}

function assertScene(scene: SceneId, m: SceneMetrics): void {
  if (scene === "regen-gate-blocked") {
    const reason = m.regenProceedReasonReach as { reachable?: boolean } | null;
    if (!reason?.reachable) {
      throw new Error("raison RegenerationGate non visible");
    }
    if (!m.regenProceedAriaDisabled) {
      throw new Error("Capturer et générer devrait être aria-disabled");
    }
    if (!m.regenDescribedByLinked) {
      throw new Error("aria-describedby regen non relié");
    }
    return;
  }
  if (scene === "export-stems-none-selected") {
    const footer = m.footerReach as { reachable?: boolean } | null;
    const run = m.exportRunReach as { reachable?: boolean } | null;
    const dr = m.exportDisabledReasonReach as { reachable?: boolean } | null;
    if (!footer?.reachable || !run?.reachable) {
      throw new Error("export 0 piste : pied ou bouton hors vue");
    }
    if (!dr?.reachable) throw new Error("raison export 0 piste invisible");
    if (!m.exportRunAriaDisabled) throw new Error("Exporter sans aria-disabled");
    if (!m.exportDescribedByLinked) {
      throw new Error("aria-describedby export non relié");
    }
    return;
  }
  const footer = m.footerReach as { reachable?: boolean } | null;
  if (!footer?.reachable) {
    throw new Error(`B1/I2 pied non atteignable (${scene})`);
  }
  if (scene.startsWith("export-drawer")) {
    const run = m.exportRunReach as { reachable?: boolean } | null;
    if (!run?.reachable) {
      throw new Error(`B1 Exporter non atteignable (${scene})`);
    }
  }
  if (scene === "sep-header") {
    const title = m.titleReach as { reachable?: boolean } | null;
    if (!title?.reachable) {
      throw new Error(`titre non visible (${scene})`);
    }
  }
  if (scene === "sep-footer") {
    const run = m.sepRunReach as { reachable?: boolean } | null;
    if (!run?.reachable) throw new Error("Lancer la séparation hors vue");
  }
  if (scene === "sep-download") {
    const dr = m.downloadReasonReach as { reachable?: boolean } | null;
    if (!dr?.reachable) throw new Error("raison download non visible");
    if (!m.downloadAriaDisabled) throw new Error("download sans aria-disabled");
  }
  if (scene === "sep-exclusions") {
    const s = m.exclusionsSummaryReach as { reachable?: boolean } | null;
    if (!s?.reachable) throw new Error("résumé exclusions non visible");
  }
  if (scene === "sep-revert") {
    const r = m.revertReach as { reachable?: boolean } | null;
    if (!r?.reachable) throw new Error("revenir reco non visible");
  }
  if (scene === "sep-run-blocked") {
    if (!m.sepRunAriaDisabled) throw new Error("run devrait être aria-disabled");
    const reason = m.runBlockedReasonReach as { reachable?: boolean } | null;
    if (!reason?.reachable) throw new Error("raison run bloqué non visible");
    const run = m.sepRunReach as { reachable?: boolean } | null;
    if (!run?.reachable) throw new Error("bouton run non atteignable");
  }
  if (scene === "export-mix" && !m.formatLivePresent) {
    throw new Error("aria-live format absent");
  }
  const horiz = m.horizontalOverflow as { ok?: boolean } | undefined;
  if (horiz && !horiz.ok) {
    throw new Error(`défilement horizontal (${scene})`);
  }
  const contrast = m.contrast as Record<string, number | null> | undefined;
  if (scene === "sep-header" && contrast) {
    for (const [k, v] of Object.entries(contrast)) {
      if (v != null && v < 4.5) {
        throw new Error(`contraste ${k} ${v} < 4.5`);
      }
    }
  }
}

mkdirSync(OUT, { recursive: true });

const vite = spawn(
  "pnpm",
  ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
  {
    cwd: ROOT,
    stdio: "ignore",
    env: { ...process.env, VITE_CAPTURE: "1" },
  },
);

const all: Record<string, SceneMetrics> = {};

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.addInitScript((script: string) => {
    // eslint-disable-next-line no-eval
    eval(script);
  }, VISIBILITY_BROWSER_BUNDLE);

  for (const scene of SCENES) {
    const m = await measureScene(page, scene);
    all[scene] = m;
    console.log(scene, JSON.stringify(m, null, 0));
    assertScene(scene, m);
    if (m.mockupNoteAbsent === false) throw new Error("note Alphonse visible");
  }

  await browser.close();
  writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(all, null, 2));
} finally {
  vite.kill("SIGTERM");
}
