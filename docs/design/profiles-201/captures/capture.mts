import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
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

const SCENES: Array<{ hash: string; baseName: string }> = [
  {
    hash: "onboarding-commercial-disabled",
    baseName: "profils-L1-01-creation-profil-commercial-desactive",
  },
  { hash: "onboarding-six-max", baseName: "profils-L1-03-six-profils-sur-six" },
  { hash: "selector-closed", baseName: "profils-L1-04-selecteur-ferme-badge-titre" },
  { hash: "selector-open", baseName: "profils-L1-05-selecteur-menu-ouvert" },
  { hash: "switch-confirm", baseName: "profils-L1-06-changement-de-profil-confirmation" },
  {
    hash: "blocked-generation",
    baseName: "profils-L1-07-selecteur-desactive-generation-infobulle",
  },
  { hash: "selector-collapsed", baseName: "profils-L1-09-barre-repliee-icone-infobulle" },
  { hash: "migration-banner", baseName: "profils-L1-11-migration-profil-hobby-par-defaut" },
  {
    hash: "commercial-engines-fixture",
    baseName: "profils-L1-13-moteurs-non-proposes-commercial",
  },
];

const vite = spawn("pnpm", ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, VITE_CAPTURE: "1" },
});

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  for (const height of [720, 768]) {
    for (const scene of SCENES) {
      const page = await browser.newPage({
        viewport: { width: 1280, height },
      });
      await page.goto(`${BASE}#${scene.hash}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(scene.hash.includes("open") ? 700 : 450);
      const file = `${scene.baseName}-1280x${height}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
      console.log(file);
      await page.close();
    }
  }
  await browser.close();
} finally {
  vite.kill("SIGTERM");
}
