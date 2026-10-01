/**
 * Captures réelles de l’onglet Créer (React + App.css) via Vite et mock Tauri.
 *
 * Usage : pnpm exec tsx scripts/capture-create-react.mts
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outDir = path.join(
  rootDir,
  "docs/design/creer-deux-colonnes/captures-react",
);

const shots: Record<string, { width: number; height: number }> = {
  "creer-react-1280x720": { width: 1280, height: 720 },
  "creer-react-1600x900": { width: 1600, height: 900 },
  "creer-react-800x700-une-colonne": { width: 800, height: 700 },
};

type VisibilityRow = {
  label: string;
  top: number;
  bottom: number;
  viewportHeight: number;
  ok: boolean;
};

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Serveur Vite inaccessible : ${url}`);
}

function startVite(): { proc: ReturnType<typeof spawn>; url: string } {
  const url = "http://127.0.0.1:5179/create-capture.html";
  const proc = spawn(
    "pnpm",
    ["exec", "vite", "--config", "vite.config.ts"],
    {
      cwd: rootDir,
      env: { ...process.env, VITE_CAPTURE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  proc.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });
  return { proc, url };
}

async function measureVisibility(
  page: import("playwright").Page,
): Promise<VisibilityRow[]> {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const selectors: { label: string; sel: string }[] = [
      { label: "Style", sel: ".form-field-style textarea" },
      { label: "Paroles", sel: ".form-field-lyrics textarea" },
      { label: "Générer", sel: ".song-create-generate-btn" },
    ];
    return selectors.map(({ label, sel }) => {
      const el = document.querySelector(sel);
      if (!el) {
        return { label, top: -1, bottom: -1, viewportHeight: vh, ok: false };
      }
      const r = el.getBoundingClientRect();
      const ok = r.top >= 0 && r.bottom <= vh && r.height > 0;
      return {
        label,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        viewportHeight: vh,
        ok,
      };
    });
  });
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const { proc, url } = startVite();
  try {
    await waitForServer(url, 60_000);
    const browser = await chromium.launch();
    const report: Record<string, VisibilityRow[]> = {};

    for (const [name, viewport] of Object.entries(shots)) {
      const page = await browser.newPage({ viewport });
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector(".song-create-layout", { timeout: 15_000 });
      await page.waitForTimeout(400);
      const filePath = path.join(outDir, `${name}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
      if (name === "creer-react-1280x720") {
        report[name] = await measureVisibility(page);
      }
      await page.close();
    }

    await browser.close();

    const lines: string[] = [
      "# Rapport capture React — onglet Créer",
      "",
      `Généré le ${new Date().toISOString()}.`,
      "",
      "## Visibilité sans défilement (1280×720)",
      "",
    ];
    for (const row of report["creer-react-1280x720"] ?? []) {
      lines.push(
        `- **${row.label}** : top ${row.top}px, bottom ${row.bottom}px (viewport ${row.viewportHeight}px) — ${row.ok ? "OK" : "HORS ÉCRAN / scroll requis"}`,
      );
    }
    await writeFile(path.join(outDir, "REPORT.md"), `${lines.join("\n")}\n`);
    console.log(lines.join("\n"));
  } finally {
    proc.kill("SIGTERM");
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
