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

type Viewport = { width: number; height: number };

type SceneSpec = {
  hash: string;
  viewport: Viewport;
};

const DEFAULT_VP: Viewport = { width: 1280, height: 720 };

const SCENE_HASHES = [
  "sep-header",
  "sep-footer",
  "sep-download",
  "sep-exclusions",
  "sep-revert",
  "sep-run-blocked",
  "sep-unmeasured-badge",
  "export-drawer-top-4",
  "export-drawer-top-12",
  "export-drawer-top-16",
  "export-drawer-top-12-after",
  "export-drawer-b1-12",
  "sep-recommended-visible",
  "sep-selection-cachee",
  "sep-focus-vocals",
  "export-mix",
  "export-mix-tight",
  "export-stems-none-selected",
  "regen-gate-blocked",
] as const;

type SceneHash = (typeof SCENE_HASHES)[number];

function sceneSpecs(): SceneSpec[] {
  const specs: SceneSpec[] = [];
  for (const hash of SCENE_HASHES) {
    if (
      hash === "export-drawer-top-12" ||
      hash === "export-drawer-top-12-after"
    ) {
      specs.push({ hash, viewport: DEFAULT_VP });
      specs.push({ hash, viewport: { width: 1280, height: 600 } });
    } else if (hash === "export-drawer-b1-12") {
      specs.push({ hash, viewport: { width: 1280, height: 768 } });
      specs.push({ hash, viewport: { width: 1280, height: 900 } });
    } else if (hash === "sep-focus-vocals") {
      specs.push({ hash, viewport: DEFAULT_VP });
      specs.push({ hash, viewport: { width: 1280, height: 768 } });
    } else {
      specs.push({ hash, viewport: DEFAULT_VP });
    }
  }
  return specs;
}

function metricsKey(hash: string, viewport: Viewport): string {
  return `${hash}-${viewport.width}x${viewport.height}`;
}

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
  hash: SceneHash,
  viewport: Viewport,
): Promise<SceneMetrics> {
  await page.setViewportSize(viewport);
  await page.goto(`${BASE}?v=${encodeURIComponent(hash)}#${hash}`);
  const waitMs = hash.includes("after")
    ? 1400
    : hash === "export-drawer-b1-12"
      ? 1500
      : hash === "export-stems-none-selected"
        ? 1200
        : hash === "sep-download"
          ? 1400
          : hash === "sep-unmeasured-badge"
            ? 1100
            : hash === "sep-selection-cachee"
              ? 1900
              : hash === "sep-focus-vocals"
                ? 1100
                : 950;
  await page.waitForTimeout(waitMs);
  if (hash === "sep-selection-cachee") {
    await page.waitForSelector('[data-testid="sep-manual-pick-visible"]', {
      timeout: 8000,
    });
  }

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
      const badgeContrast = __contrastOnElement(badge);

      const dateEl = document.querySelector(
        ".sep-license-date",
      ) as HTMLElement | null;
      const dateContrast = __contrastOnElement(dateEl);

      const xIcon = document.querySelector(
        ".sep-exclusion-x",
      ) as HTMLElement | null;
      const xContrast = __contrastOnElement(xIcon);

      const licenseIcon = document.querySelector(
        ".sep-unmeasured-icon",
      ) as HTMLElement | null;
      const licenseIconContrast = __contrastOnElement(licenseIcon);

      const unmeasuredBadge = document.querySelector(
        '[data-testid="sep-unmeasured-rec-badge"]',
      ) as HTMLElement | null;
      const unmeasuredContrast = __contrastOnElement(unmeasuredBadge);

      const spotlight = document.querySelector(
        ".sep-recommended-spotlight [data-testid^='sep-quality-card-']",
      ) as HTMLElement | null;
      const spotlightReach = __measureReachability(spotlight);
      const unmeasuredBadgeEl = document.querySelector(
        '[data-testid="sep-unmeasured-rec-badge"]',
      ) as HTMLElement | null;
      const unmeasuredBadgeReach = __measureReachability(unmeasuredBadgeEl);
      const exclusionXReach = __measureReachability(xIcon);

      let scrollBodyPx: { scrollHeight?: number; clientHeight?: number; scrollTop?: number } | undefined;
      if (sceneName === "sep-recommended-visible" && scroll) {
        scrollBodyPx = {
          scrollHeight: scroll.scrollHeight,
          clientHeight: scroll.clientHeight,
          scrollTop: scroll.scrollTop,
        };
      }

      let manualPickReach: ReturnType<typeof __measureReachability> | null =
        null;
      if (sceneName === "sep-selection-cachee") {
        manualPickReach = __measureReachability(
          document.querySelector(
            '[data-testid="sep-manual-pick-visible"]',
          ) as HTMLElement | null,
        );
      }

      let sourceLinkHeights: number[] | undefined;
      if (sceneName.startsWith("sep-")) {
        sourceLinkHeights = Array.from(
          document.querySelectorAll(".separation-recommend-popin a.sep-source-link"),
        ).map((a) => (a as HTMLElement).getBoundingClientRect().height);
      }

      let exportPopinBtnHeights: number[] | undefined;
      if (sceneName === "export-mix-tight") {
        exportPopinBtnHeights = Array.from(
          document.querySelectorAll(".export-dialog-popin .btn"),
        ).map((b) => (b as HTMLElement).getBoundingClientRect().height);
      }

      let exportFieldsetBorder: { style: string; width: string } | undefined;
      if (
        sceneName.startsWith("export-drawer-top") ||
        sceneName === "export-drawer-b1-12"
      ) {
        const fs = document.querySelector(
          ".export-dialog-popin fieldset",
        ) as HTMLFieldSetElement | null;
        if (fs) {
          const s = getComputedStyle(fs);
          exportFieldsetBorder = {
            style: s.borderTopStyle,
            width: s.borderTopWidth,
          };
        }
      }

      const download = document.querySelector(
        sceneName === "sep-download"
          ? '[data-testid="sep-download-bs_roformer"]'
          : '[data-testid^="sep-download-"]',
      ) as HTMLButtonElement | null;
      const downloadReason = document.querySelector(
        sceneName === "sep-download"
          ? '[data-testid="sep-download-reason-bs_roformer"]'
          : '[data-testid^="sep-download-reason-"]',
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
          licenseIcon: licenseIconContrast,
          unmeasuredBadge: unmeasuredContrast,
        },
        spotlightReach,
        unmeasuredBadgeReach,
        exclusionXReach,
        scrollBodyPx,
        manualPickReach,
        sourceLinkHeights,
        exportPopinBtnHeights,
        exportFieldsetBorder,
        mockupNoteAbsent: !document.body.innerText.includes("Maquette Alphonse"),
      };
    },
    { sceneName: hash, script: VISIBILITY_BROWSER_BUNDLE },
  );

  const fileBase = metricsKey(hash, viewport);
  await page.screenshot({
    path: path.join(OUT, `${fileBase}.png`),
    fullPage: false,
  });

  return metrics;
}

function assertScene(hash: SceneHash, m: SceneMetrics): void {
  const label = `${hash} (${(m.viewport as Viewport)?.width}x${(m.viewport as Viewport)?.height})`;

  if (hash === "regen-gate-blocked") {
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
  if (hash === "export-stems-none-selected") {
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
  if (hash === "export-mix-tight") {
    const heights = m.exportPopinBtnHeights as number[] | undefined;
    if (!heights?.length) throw new Error("boutons popin mix tight absents");
    for (const h of heights) {
      if (h < 44) throw new Error(`bouton popin ${h}px < 44`);
    }
  }
  const footer = m.footerReach as { reachable?: boolean } | null;
  if (
    hash !== "regen-gate-blocked" &&
    hash !== "sep-selection-cachee" &&
    !footer?.reachable
  ) {
    throw new Error(`B1/I2 pied non atteignable (${label})`);
  }
  if (hash === "export-drawer-b1-12" || hash.startsWith("export-drawer-top")) {
    const run = m.exportRunReach as { reachable?: boolean } | null;
    if (!run?.reachable) {
      throw new Error(`B1 Exporter non atteignable (${label})`);
    }
    const fb = m.exportFieldsetBorder as
      | { style?: string; width?: string }
      | undefined;
    if (fb?.style !== "none" || fb?.width !== "0px") {
      throw new Error(
        `fieldset export bordure native (${fb?.style} ${fb?.width})`,
      );
    }
    const popinRect = m.popinRect as { bottom?: number } | undefined;
    const vh = (m.viewport as Viewport)?.height;
    if (popinRect?.bottom != null && vh != null && popinRect.bottom > vh + 1) {
      throw new Error(`popin dépasse viewport (${popinRect.bottom} > ${vh})`);
    }
  }
  if (hash === "sep-recommended-visible" || hash === "sep-focus-vocals") {
    const spot = m.spotlightReach as { reachable?: boolean } | null;
    if (!spot?.reachable) {
      throw new Error(`fiche recommandée hors vue initiale (${label})`);
    }
    const badge = m.unmeasuredBadgeReach as { reachable?: boolean } | null;
    if (!badge?.reachable) {
      throw new Error(`pastille non mesurée hors vue (${label})`);
    }
    const scroll = m.scrollBodyPx as { scrollTop?: number } | undefined;
    if (scroll?.scrollTop != null && scroll.scrollTop > 2) {
      throw new Error(
        `scroll initial ${scroll.scrollTop}px (reco devrait être sans défilement)`,
      );
    }
  }
  if (hash === "sep-header") {
    const badge = m.unmeasuredBadgeReach as { reachable?: boolean } | null;
    if (!badge?.reachable) {
      throw new Error(`pastille non mesurée hors vue (${label})`);
    }
  }
  if (hash === "sep-exclusions") {
    const xR = m.exclusionXReach as { reachable?: boolean } | null;
    if (!xR?.reachable) throw new Error("✕ exclusion non visible");
  }
  if (hash === "sep-selection-cachee") {
    const mp = m.manualPickReach as { reachable?: boolean } | null;
    if (!mp?.reachable) {
      throw new Error("choix manuel non visible après fermeture Autres modèles");
    }
    const spot = m.spotlightReach as { reachable?: boolean } | null;
    if (!spot?.reachable) {
      throw new Error("fiche reco spotlight hors vue (sep-selection-cachee)");
    }
  }
  if (hash.startsWith("sep-") && hash !== "sep-selection-cachee") {
    const links = m.sourceLinkHeights as number[] | undefined;
    if (links?.length) {
      for (const h of links) {
        if (h < 44) throw new Error(`lien source ${h}px < 44 (${label})`);
      }
    }
  }
  if (hash === "sep-header") {
    const title = m.titleReach as { reachable?: boolean } | null;
    if (!title?.reachable) {
      throw new Error(`titre non visible (${label})`);
    }
    const contrast = m.contrast as Record<string, number | null> | undefined;
    if (contrast?.licenseIcon != null && contrast.licenseIcon < 4.5) {
      throw new Error(`contraste pastille ${contrast.licenseIcon} < 4.5`);
    }
  }
  if (hash === "sep-footer") {
    const run = m.sepRunReach as { reachable?: boolean } | null;
    if (!run?.reachable) throw new Error("Lancer la séparation hors vue");
  }
  if (hash === "sep-download") {
    const dr = m.downloadReasonReach as { reachable?: boolean } | null;
    if (!dr?.reachable) throw new Error("raison download non visible");
    if (!m.downloadAriaDisabled) throw new Error("download sans aria-disabled");
  }
  if (hash === "sep-exclusions") {
    const s = m.exclusionsSummaryReach as { reachable?: boolean } | null;
    if (!s?.reachable) throw new Error("résumé exclusions non visible");
  }
  if (hash === "sep-revert") {
    const r = m.revertReach as { reachable?: boolean } | null;
    if (!r?.reachable) throw new Error("revenir reco non visible");
  }
  if (hash === "sep-run-blocked") {
    if (!m.sepRunAriaDisabled) throw new Error("run devrait être aria-disabled");
    const reason = m.runBlockedReasonReach as { reachable?: boolean } | null;
    if (!reason?.reachable) throw new Error("raison run bloqué non visible");
    const run = m.sepRunReach as { reachable?: boolean } | null;
    if (!run?.reachable) throw new Error("bouton run non atteignable");
  }
  if (hash === "export-mix" && !m.formatLivePresent) {
    throw new Error("aria-live format absent");
  }
  const horiz = m.horizontalOverflow as { ok?: boolean } | undefined;
  if (horiz && !horiz.ok) {
    throw new Error(`défilement horizontal (${label})`);
  }
  const contrast = m.contrast as Record<string, number | null> | undefined;
  if (hash === "sep-header" && contrast) {
    for (const [k, v] of Object.entries(contrast)) {
      if (k === "unmeasuredBadge") continue;
      if (v != null && v < 4.5) {
        throw new Error(`contraste ${k} ${v} < 4.5 (fond effectif)`);
      }
    }
    const expected: Record<string, number> = {
      badge: 10.4737,
      readDate: 5.8974,
      licenseIcon: 9.5548,
      exclusionX: 8.7437,
    };
    for (const [k, exp] of Object.entries(expected)) {
      const v = contrast[k];
      if (v == null) continue;
      if (Math.abs(v - exp) > 0.15) {
        console.warn(
          `contraste ${k} mesuré ${v.toFixed(2)} ≠ attendu ~${exp} (tolérance 0,15)`,
        );
      }
    }
  }
  if (hash === "sep-unmeasured-badge" && contrast) {
    const ub = contrast.unmeasuredBadge;
    if (ub == null || ub < 4.5) {
      throw new Error(`contraste badge non mesurée ${ub} < 4.5 (fond effectif)`);
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
  const page = await browser.newPage();
  await page.addInitScript((script: string) => {
    // eslint-disable-next-line no-eval
    eval(script);
  }, VISIBILITY_BROWSER_BUNDLE);

  for (const { hash, viewport } of sceneSpecs()) {
    const key = metricsKey(hash, viewport);
    const m = await measureScene(page, hash, viewport);
    all[key] = m;
    console.log(key, JSON.stringify(m, null, 0));
    assertScene(hash, m);
    if (m.mockupNoteAbsent === false) throw new Error("note Alphonse visible");
  }

  await browser.close();
  writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(all, null, 2));
} finally {
  vite.kill("SIGTERM");
}
