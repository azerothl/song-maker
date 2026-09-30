import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
mkdirSync(OUT, { recursive: true });
const PORT = 5181;
const BASE = `http://127.0.0.1:${PORT}/profiles-capture.html`;

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

function assertPngNotBlank(filePath: string): void {
  const buf = readFileSync(filePath);
  if (buf.length < 64) {
    throw new Error(`capture trop petite : ${filePath}`);
  }
  let dark = 0;
  const sampleStep = 97;
  for (let i = 0; i < buf.length; i += sampleStep) {
    if (buf[i]! < 250) dark += 1;
  }
  if (dark < 8) {
    throw new Error(`capture vide ou blanche : ${filePath}`);
  }
}

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

const hashes = new Map<string, string>();

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  for (const height of [720, 768]) {
    for (const scene of SCENES) {
      const page = await browser.newPage({
        viewport: { width: 1280, height },
      });
      await page.goto(`${BASE}#${scene.hash}`, { waitUntil: "networkidle" });
      if (scene.hash === "selector-open" || scene.hash === "blocked-generation") {
        await page.waitForSelector('[data-testid="profile-selector-trigger"]', {
          timeout: 15_000,
        });
        if (scene.hash === "blocked-generation") {
          await page.waitForTimeout(350);
        }
        await page.click('[data-testid="profile-selector-trigger"]');
        await page.waitForSelector(scene.waitFor, { timeout: 15_000 });
      } else {
        await page.waitForSelector(scene.waitFor, { timeout: 15_000 });
      }
      await page.waitForTimeout(scene.hash.includes("open") ? 500 : 300);
      const file = `${scene.baseName}-1280x${height}.png`;
      const outPath = path.join(OUT, file);
      await page.screenshot({ path: outPath, fullPage: false });
      assertPngNotBlank(outPath);
      const hash = createHash("sha256").update(readFileSync(outPath)).digest("hex");
      const prior = hashes.get(hash);
      if (prior && prior !== file) {
        throw new Error(`capture dupliquée ${file} == ${prior}`);
      }
      hashes.set(hash, file);
      console.log(file, hash.slice(0, 12));
      await page.close();
    }
  }
  await browser.close();
  if (hashes.size < SCENES.length) {
    throw new Error(
      `trop peu de captures distinctes : ${hashes.size} hashes pour ${SCENES.length} scènes`,
    );
  }
} finally {
  vite.kill("SIGTERM");
}
