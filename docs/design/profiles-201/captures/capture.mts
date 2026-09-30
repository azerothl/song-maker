import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
mkdirSync(OUT, { recursive: true });
const PORT = 5181;
const BASE = `http://127.0.0.1:${PORT}/profiles-app-capture.html`;

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

const SCENES: Array<{ hash: string; baseName: string; waitFor: string }> = [
  {
    hash: "onboarding-commercial-disabled",
    baseName: "profils-L1-01-creation-profil-commercial-desactive",
    waitFor: '[data-testid="profile-commercial-unavailable-reason"]',
  },
  {
    hash: "onboarding-six-max",
    baseName: "profils-L1-03-six-profils-sur-six",
    waitFor: '[data-testid="profile-limit-alert"]',
  },
  {
    hash: "selector-closed",
    baseName: "profils-L1-04-selecteur-ferme-badge-titre",
    waitFor: '[data-testid="profile-selector-trigger"]',
  },
  {
    hash: "selector-open",
    baseName: "profils-L1-05-selecteur-menu-ouvert",
    waitFor: '[data-testid="profile-selector-menu"]',
  },
  {
    hash: "switch-confirm",
    baseName: "profils-L1-06-changement-de-profil-confirmation",
    waitFor: '[data-testid="profile-switch-confirm-dialog"]',
  },
  {
    hash: "blocked-generation",
    baseName: "profils-L1-07-selecteur-desactive-generation-infobulle",
    waitFor: '[data-testid="profile-switch-block-alert"]',
  },
  {
    hash: "selector-collapsed",
    baseName: "profils-L1-09-barre-repliee-icone-infobulle",
    waitFor: '[data-testid="profile-selector-trigger"]',
  },
  {
    hash: "migration-banner",
    baseName: "profils-L1-11-migration-profil-hobby-par-defaut",
    waitFor: '[data-testid="profile-migration-banner"]',
  },
  {
    hash: "commercial-engines-fixture",
    baseName: "profils-L1-13-moteurs-non-proposes-commercial",
    waitFor: '[data-testid="commercial-engines-panel"]',
  },
];

/** Écart-type de luminance sur pixels décodés ; captures valides ~21–31 sur cette VM. */
const LUMINANCE_STDDEV_MIN = 18;
const NON_BACKGROUND_MIN = 0.02;
const PIXEL_DIFF_FROM_BG = 15;

type PngBlankStats = { stdDev: number; nonBackgroundFraction: number };

async function assertPngNotBlank(
  page: Page,
  filePath: string,
): Promise<PngBlankStats> {
  const buf = readFileSync(filePath);
  if (buf.length < 64) {
    throw new Error(`capture trop petite : ${filePath}`);
  }
  const b64 = buf.toString("base64");
  const stats = await page.evaluate(
    async ([b64, diffThreshold]: [string, number]) => {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("decode png"));
        img.src = `data:image/png;base64,${b64}`;
      });
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas 2d");
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      const lum: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        lum.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const stdDev = Math.sqrt(
        lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length,
      );
      const bg = [data[0], data[1], data[2]];
      let diff = 0;
      const n = width * height;
      for (let i = 0; i < data.length; i += 4) {
        const dr =
          Math.abs(data[i] - bg[0]) +
          Math.abs(data[i + 1] - bg[1]) +
          Math.abs(data[i + 2] - bg[2]);
        if (dr > diffThreshold) diff += 1;
      }
      return { stdDev, nonBackgroundFraction: diff / n };
    },
    [b64, PIXEL_DIFF_FROM_BG] as [string, number],
  );

  if (stats.stdDev < LUMINANCE_STDDEV_MIN) {
    throw new Error(
      `capture blanche ou quasi vide (écart-type luminance ${stats.stdDev.toFixed(1)} < ${LUMINANCE_STDDEV_MIN}) : ${filePath}`,
    );
  }
  if (stats.nonBackgroundFraction < NON_BACKGROUND_MIN) {
    throw new Error(
      `capture sans contenu (${(stats.nonBackgroundFraction * 100).toFixed(2)} % hors fond < ${NON_BACKGROUND_MIN * 100} %) : ${filePath}`,
    );
  }
  return stats;
}

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

const hashes = new Map<string, string>();
const EXPECTED_CAPTURES = SCENES.length * 2;

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  for (const height of [720, 768]) {
    for (const scene of SCENES) {
      const page = await browser.newPage({
        viewport: { width: 1280, height },
      });
      await page.goto(`${BASE}#${scene.hash}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      if (scene.hash === "selector-open") {
        await page.waitForSelector('[data-testid="profile-selector-trigger"]', {
          timeout: 15_000,
        });
        await page.click('[data-testid="profile-selector-trigger"]');
        await page.waitForSelector(scene.waitFor, { timeout: 15_000 });
      } else if (scene.hash === "blocked-generation") {
        await page.waitForSelector(scene.waitFor, { timeout: 15_000 });
      } else {
        await page.waitForSelector(scene.waitFor, { timeout: 15_000 });
      }
      if (scene.hash === "onboarding-commercial-disabled") {
        const commercial = page.locator('[data-testid="profile-type-commercial"]');
        await commercial.waitFor({ state: "visible", timeout: 10_000 });
        const reason = page.locator(
          '[data-testid="profile-commercial-unavailable-reason"]',
        );
        await reason.waitFor({ state: "visible", timeout: 10_000 });
        const reasonText = (await reason.textContent())?.trim() ?? "";
        if (!reasonText.includes("usage commercial")) {
          throw new Error(
            `L1-01 : raison Commercial absente ou incomplète (« ${reasonText.slice(0, 80)} »)`,
          );
        }
        const box = await commercial.boundingBox();
        if (!box || box.height < 40) {
          throw new Error("L1-01 : tuile Commercial non entièrement visible");
        }
      }
      if (scene.hash === "onboarding-six-max") {
        await page.locator('[data-testid="profile-type-commercial"]').waitFor({
          state: "visible",
          timeout: 10_000,
        });
      }
      await page.waitForTimeout(scene.hash.includes("open") ? 500 : 350);
      const file = `${scene.baseName}-1280x${height}.png`;
      const outPath = path.join(OUT, file);
      await page.screenshot({ path: outPath, fullPage: false });
      const blankStats = await assertPngNotBlank(page, outPath);
      const md5 = createHash("md5").update(readFileSync(outPath)).digest("hex");
      const prior = hashes.get(md5);
      if (prior && prior !== file) {
        throw new Error(`capture dupliquée (md5) ${file} == ${prior}`);
      }
      hashes.set(md5, file);
      let sceneNote = "";
      if (scene.hash === "blocked-generation" && height === 720) {
        const lock = await page.evaluate(() => {
          const alert = document.querySelector(
            '[data-testid="profile-switch-block-alert"]',
          );
          const menu = document.querySelector(
            '[data-testid="profile-selector-menu"]',
          );
          const ar = alert?.getBoundingClientRect();
          const mr = menu?.getBoundingClientRect();
          return {
            alertHeight: ar ? Math.round(ar.height * 10) / 10 : null,
            menuWidth: mr ? Math.round(mr.width * 10) / 10 : null,
            alertVisible: alert ? getComputedStyle(alert).display !== "none" : false,
          };
        });
        sceneNote = ` lock720 alertH=${lock.alertHeight}px menuW=${lock.menuWidth}px`;
      }
      console.log(
        file,
        md5,
        `lumStd=${blankStats.stdDev.toFixed(1)}`,
        `nonBg=${(blankStats.nonBackgroundFraction * 100).toFixed(2)}%`,
        sceneNote.trim(),
      );
      await page.close();
    }
  }
  await browser.close();
  if (hashes.size !== EXPECTED_CAPTURES) {
    throw new Error(
      `captures distinctes : ${hashes.size} md5 pour ${EXPECTED_CAPTURES} fichiers attendus`,
    );
  }
} finally {
  vite.kill("SIGTERM");
}
