import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5187;
const BASE = `http://127.0.0.1:${PORT}/separation-export-a11y-capture.html`;

type PointMetrics = {
  scene: string;
  footerVisible: boolean;
  footerBottomInViewport: boolean;
  runButtonVisible?: boolean;
  downloadAriaDisabled?: boolean;
  downloadReasonVisible?: boolean;
  exclusionsVisible?: boolean;
  formatLivePresent?: boolean;
  formatLabeled?: boolean;
  disabledReasonVisible?: boolean;
  mockupNoteAbsent?: boolean;
  minControlHeightPx?: number;
  viewport: { width: number; height: number };
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
  throw new Error(`serveur Vite inaccessible : ${url}`);
}

async function measureScene(
  page: import("playwright").Page,
  scene: string,
): Promise<PointMetrics> {
  await page.goto(`${BASE}#${scene}`);
  await page.waitForTimeout(900);

  if (scene === "separation") {
    await page.waitForSelector('[data-testid="sep-recommend-footer"]');
    // Change model manually so « Revenir à la recommandation » appears.
    const radios = page.locator('input[name="sep-model"]');
    const count = await radios.count();
    if (count > 1) await radios.nth(1).check({ force: true });
    await page.waitForTimeout(200);
  } else {
    await page.waitForSelector('[data-testid="export-dialog-footer"]');
  }

  const metrics = await page.evaluate((sceneName) => {
    const vh = window.innerHeight;
    const footer = document.querySelector(
      sceneName === "separation"
        ? '[data-testid="sep-recommend-footer"]'
        : '[data-testid="export-dialog-footer"]',
    ) as HTMLElement | null;
    const fr = footer?.getBoundingClientRect();
    const footerVisible = Boolean(
      footer && fr && fr.bottom <= vh + 1 && fr.top >= -1 && fr.height > 0,
    );
    const controls = Array.from(
      document.querySelectorAll(
        ".separation-recommend-popin .btn, .export-dialog-popin .btn, .separation-recommend-popin select, .export-dialog-popin select",
      ),
    ) as HTMLElement[];
    const heights = controls.map((el) => el.getBoundingClientRect().height);
    const minControlHeightPx =
      heights.length > 0 ? Math.min(...heights) : 0;

    if (sceneName === "separation") {
      const download = document.querySelector(
        '[data-testid^="sep-download-"]',
      ) as HTMLButtonElement | null;
      const reason = document.querySelector(
        '[data-testid^="sep-download-reason-"]',
      );
      const exclusions = document.querySelector(
        '[data-testid="sep-rec-exclusions"]',
      );
      const run = document.querySelector(
        '[data-testid="sep-recommend-run"]',
      ) as HTMLElement | null;
      const runRect = run?.getBoundingClientRect();
      return {
        scene: sceneName,
        footerVisible,
        footerBottomInViewport: footerVisible,
        runButtonVisible: Boolean(
          run && runRect && runRect.bottom <= vh + 1 && runRect.top >= 0,
        ),
        downloadAriaDisabled:
          download?.getAttribute("aria-disabled") === "true",
        downloadReasonVisible: Boolean(reason),
        exclusionsVisible: Boolean(exclusions),
        mockupNoteAbsent: !document.body.innerText.includes(
          "Maquette Alphonse",
        ),
        minControlHeightPx,
        viewport: { width: window.innerWidth, height: vh },
      };
    }

    const format = document.querySelector(
      '[data-testid="export-format"]',
    ) as HTMLSelectElement | null;
    const live = document.querySelector('[data-testid="export-format-live"]');
    const disabledReason = document.querySelector(
      '[data-testid="export-disabled-reason"]',
    );
    return {
      scene: sceneName,
      footerVisible,
      footerBottomInViewport: footerVisible,
      formatLivePresent: Boolean(live?.getAttribute("aria-live")),
      formatLabeled: Boolean(
        format &&
          (format.labels?.length ||
            document.querySelector(`label[for="${format.id}"]`)),
      ),
      disabledReasonVisible:
        sceneName === "export-stems" ? Boolean(disabledReason) : true,
      mockupNoteAbsent: !document.body.innerText.includes("Maquette Alphonse"),
      minControlHeightPx,
      viewport: { width: window.innerWidth, height: vh },
    };
  }, scene);

  const file = path.join(OUT, `${scene}-1280x720.png`);
  await page.screenshot({ path: file, fullPage: false });
  return metrics as PointMetrics;
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

const all: Record<string, PointMetrics> = {};

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  for (const scene of ["separation", "export-mix", "export-stems"] as const) {
    const m = await measureScene(page, scene);
    all[scene] = m;
    console.log(scene, JSON.stringify(m));
    if (!m.footerVisible) {
      throw new Error(`pied invisible (${scene})`);
    }
    if (m.minControlHeightPx != null && m.minControlHeightPx < 44) {
      throw new Error(
        `cible < 44 px (${scene}): ${m.minControlHeightPx}`,
      );
    }
    if (scene === "separation") {
      if (!m.runButtonVisible) throw new Error("Lancer la séparation hors vue");
      if (!m.downloadAriaDisabled) {
        throw new Error("download sans aria-disabled");
      }
      if (!m.downloadReasonVisible) {
        throw new Error("raison download absente");
      }
      if (!m.exclusionsVisible) throw new Error("exclusions absentes");
    }
    if (scene === "export-mix" && !m.formatLivePresent) {
      throw new Error("aria-live format absent");
    }
    if (scene === "export-mix" && !m.formatLabeled) {
      throw new Error("label format absent");
    }
    if (!m.mockupNoteAbsent) throw new Error("note Alphonse encore visible");
  }

  await browser.close();
  writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(all, null, 2));

  const mediaDir = path.resolve(
    "/cursor/stores/bc-60cbce62-e49a-4983-a762-3c29b086ca11/media/issue-187",
  );
  mkdirSync(mediaDir, { recursive: true });
  const artifacts = "/opt/cursor/artifacts/screenshots";
  mkdirSync(artifacts, { recursive: true });
  for (const scene of Object.keys(all)) {
    const src = path.join(OUT, `${scene}-1280x720.png`);
    copyFileSync(src, path.join(mediaDir, `${scene}-1280x720.png`));
    copyFileSync(src, path.join(artifacts, `issue-187-${scene}-1280x720.png`));
  }
  copyFileSync(
    path.join(OUT, "metrics.json"),
    path.join(mediaDir, "metrics.json"),
  );
} finally {
  vite.kill("SIGTERM");
}
