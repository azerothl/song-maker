/**
 * Preuve #202 — libellés file d’attente vs bloqué, viewport 1280×720.
 *
 * Usage : pnpm exec tsx docs/design/first-launch/captures-react/capture-queue-label.mts
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5193;
const BASE = `http://127.0.0.1:${PORT}/`;

async function waitServer(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`serveur Vite inaccessible : ${url}`);
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: "chrome" });
  }
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const proc = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitServer(BASE);
    const browser = await launchBrowser();
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.goto(`${BASE}#download`, { waitUntil: "networkidle" });
    await page.waitForSelector("#fl-title", { timeout: 15_000 });
    await page.waitForFunction(() => {
      const title = document.querySelector("#fl-title")?.textContent ?? "";
      return title.includes("Téléchargement en cours");
    });
    await page.waitForTimeout(400);

    const labels = await page.evaluate(() => {
      const title = document.querySelector("#fl-title")?.textContent?.trim() ?? "";
      const lead = document.querySelector(".fl-lead")?.textContent?.trim() ?? "";
      const statuses = Array.from(document.querySelectorAll(".fl-st")).map((el) =>
        (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      );
      return { title, lead, statuses };
    });

    const file = "first-launch-queue-label-1280x720.png";
    const outPath = path.join(OUT, file);
    await page.screenshot({ path: outPath, fullPage: false });
    const buf = await readFile(outPath);

    const hasQueue = labels.statuses.some((s) =>
      s.includes("En file d’attente") && s.includes("Démarre après"),
    );
    const hasActive = labels.statuses.some((s) => s.includes("En cours"));
    const hasBareWaiting = labels.statuses.some(
      (s) => s === "◷ En attente" || s === "En attente",
    );
    const pass =
      labels.title.includes("Téléchargement en cours") &&
      /l’un après l’autre|un après l’autre/i.test(labels.lead) &&
      hasQueue &&
      hasActive &&
      !hasBareWaiting;

    const metrics = {
      issue: 202,
      generatedAt: new Date().toISOString(),
      method:
        "Vite + FirstLaunchScreen React, hash #download, Playwright 1280×720",
      viewport: { width: 1280, height: 720 },
      file,
      labels,
      checks: {
        downloadTitle: labels.title.includes("Téléchargement en cours"),
        sequentialLead: /l’un après l’autre|un après l’autre/i.test(labels.lead),
        queueLabelWithAfter: hasQueue,
        activeInProgress: hasActive,
        noBareEnAttente: !hasBareWaiting,
        pass,
      },
      files: {
        [file]: { sha256: sha256(buf), bytes: buf.length },
      },
      pass,
    };

    await writeFile(
      path.join(OUT, "queue-label-metrics.json"),
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    console.log(JSON.stringify(metrics, null, 2));
    await browser.close();
    if (!pass) process.exitCode = 1;
  } finally {
    proc.kill("SIGTERM");
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
