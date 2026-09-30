/**
 * Preuves #202 — 4 états × FR/EN + licence bloquée (1280×720, VITE_CAPTURE=1).
 */
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5215;
const BASE = `http://127.0.0.1:${PORT}/`;
const VIEWPORT = { width: 1280, height: 720 };

type Locale = "fr" | "en";

type Shot = {
  id: string;
  file: string;
  hash: string;
  locale: Locale;
  /** Recadrage optionnel de ligne (suffixe `-clip.png`), en plus du plein écran. */
  rowSelector?: string;
};

const SHOTS: Shot[] = [
  {
    id: "active-fr",
    file: "first-launch-download-active-fr-1280x720.png",
    hash: "download",
    locale: "fr",
  },
  {
    id: "active-en",
    file: "first-launch-download-active-en-1280x720.png",
    hash: "download",
    locale: "en",
  },
  {
    id: "queue-fr",
    file: "first-launch-download-queue-fr-1280x720.png",
    hash: "download",
    locale: "fr",
    rowSelector: ".fl-file.fl-queued",
  },
  {
    id: "queue-en",
    file: "first-launch-download-queue-en-1280x720.png",
    hash: "download",
    locale: "en",
    rowSelector: ".fl-file.fl-queued",
  },
  {
    id: "failure-fr",
    file: "first-launch-download-failure-fr-1280x720.png",
    hash: "c",
    locale: "fr",
    rowSelector: ".fl-file.fl-needs-action.err",
  },
  {
    id: "failure-en",
    file: "first-launch-download-failure-en-1280x720.png",
    hash: "c",
    locale: "en",
    rowSelector: ".fl-file.fl-needs-action.err",
  },
  {
    id: "resume-fr",
    file: "first-launch-download-resume-fr-1280x720.png",
    hash: "reprise",
    locale: "fr",
    rowSelector: ".fl-file.fl-needs-resume",
  },
  {
    id: "resume-en",
    file: "first-launch-download-resume-en-1280x720.png",
    hash: "reprise",
    locale: "en",
    rowSelector: ".fl-file.fl-needs-resume",
  },
  {
    id: "license-blocked-fr",
    file: "first-launch-download-license-blocked-fr-1280x720.png",
    hash: "blocked-license",
    locale: "fr",
  },
];

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

function pngDimensions(buf: Buffer): { width: number; height: number } {
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("PNG invalide");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function gitHead(): string {
  const out = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  return out.stdout?.trim() ?? "unknown";
}

async function captureShot(browser: Browser, shot: Shot): Promise<Buffer> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: shot.locale === "en" ? "en-US" : "fr-FR",
  });
  if (shot.locale === "en") {
    await context.addInitScript(() => {
      localStorage.setItem("song-maker.locale", "en");
    });
  } else {
    await context.addInitScript(() => {
      localStorage.setItem("song-maker.locale", "fr");
    });
  }
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}#${shot.hash}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='fl-download-lead']", { timeout: 15_000 });
    await page.waitForTimeout(350);
    const outPath = path.join(OUT, shot.file);
    await page.screenshot({ path: outPath, fullPage: false });
    if (shot.rowSelector) {
      const clipPath = outPath.replace(/\.png$/i, "-clip.png");
      const loc = page.locator(shot.rowSelector).first();
      await loc.waitFor({ timeout: 10_000 });
      await loc.screenshot({ path: clipPath });
    }
    return await readFile(outPath);
  } finally {
    await context.close();
  }
}

async function readLabels(browser: Browser, hash: string, locale: Locale) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: locale === "en" ? "en-US" : "fr-FR",
  });
  if (locale === "en") {
    await context.addInitScript(() => {
      localStorage.setItem("song-maker.locale", "en");
    });
  } else {
    await context.addInitScript(() => {
      localStorage.setItem("song-maker.locale", "fr");
    });
  }
  const page = await context.newPage();
  try {
    await page.goto(`${BASE}#${hash}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-testid='fl-download-lead']", { timeout: 15_000 });
    const labels = await page.evaluate(() => ({
      lead:
        document.querySelector("[data-testid='fl-download-lead']")?.textContent?.trim() ??
        "",
      etaLine: document.querySelector(".fl-global")?.textContent?.trim() ?? "",
      resumePartialLine:
        document.querySelector(".fl-file.fl-needs-resume .fl-st")?.textContent?.trim() ?? "",
      locale: localStorage.getItem("song-maker.locale"),
    }));
    return labels;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const captureBaseSha = gitHead();
  await writeFile(
    path.join(OUT, "CAPTURES_BASE.txt"),
    [
      "# SHA git enregistré au lancement de capture-download-states.mts",
      "# (commit parent des PNG si le script est exécuté juste avant le commit des captures).",
      captureBaseSha,
      "",
    ].join("\n"),
  );

  const proc = spawn(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
    {
      cwd: ROOT,
      env: { ...process.env, VITE_CAPTURE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitServer(BASE);
    let browser = await launchBrowser();

    const files: Record<
      string,
      { sha256: string; bytes: number; width: number; height: number }
    > = {};
    const shots: Record<string, unknown> = {};

    for (const shot of SHOTS) {
      const buf = await captureShot(browser, shot);
      const dim = pngDimensions(buf);
      if (dim.width !== VIEWPORT.width || dim.height !== VIEWPORT.height) {
        throw new Error(
          `${shot.file} : ${dim.width}×${dim.height}, attendu ${VIEWPORT.width}×${VIEWPORT.height}`,
        );
      }
      files[shot.file] = { sha256: sha256(buf), bytes: buf.length, ...dim };
      shots[shot.id] = {
        file: shot.file,
        locale: shot.locale,
        bytes: buf.length,
        width: dim.width,
        height: dim.height,
      };
    }
    await browser.close();

    const downloadFr = await readLabels(await launchBrowser(), "download", "fr");
    const downloadEn = await readLabels(await launchBrowser(), "download", "en");
    const resumeEn = await readLabels(await launchBrowser(), "reprise", "en");

    const retryBtnHeightPx = await (async () => {
      const b = await launchBrowser();
      const page = await b.newPage({ viewport: VIEWPORT });
      try {
        await page.goto(`${BASE}#c`, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-testid='fl-retry-file']", { timeout: 15_000 });
        return await page.evaluate(() => {
          const btn = document.querySelector("[data-testid='fl-retry-file']");
          return btn ? Math.round(btn.getBoundingClientRect().height) : 0;
        });
      } finally {
        await b.close();
      }
    })();

    const borderStyles = await (async () => {
      const b = await launchBrowser();
      const page = await b.newPage({ viewport: VIEWPORT });
      try {
        await page.goto(`${BASE}#blocked-license`, { waitUntil: "networkidle" });
        await page.waitForSelector(".fl-file.fl-queued", { timeout: 15_000 });
        const queueStyle = await page.evaluate(() => {
          const el = document.querySelector(".fl-file.fl-queued");
          return el ? getComputedStyle(el).borderStyle : "";
        });
        const blockedStyle = await page.evaluate(() => {
          const el = document.querySelector(".fl-file.fl-blocked-license");
          return el ? getComputedStyle(el).borderStyle : "";
        });
        return { queueBorderStyle: queueStyle, blockedBorderStyle: blockedStyle };
      } finally {
        await b.close();
      }
    })();

    const checks = {
      allPng1280x720: Object.values(files).every(
        (f) => f.width === VIEWPORT.width && f.height === VIEWPORT.height,
      ),
      counterFr: /· \d+ sur \d+/.test(downloadFr.lead),
      counterEn: /· \d+ of \d+/.test(downloadEn.lead),
      etaEnNoFrenchPending: !/Estimation dès|Temps restant/i.test(downloadEn.etaLine),
      etaEnHasEstimate: /estimate|Estimated/i.test(downloadEn.etaLine),
      resumeEnLeftAfterResume: /left after resume/i.test(resumeEn.resumePartialLine),
      retryButtonMin36px: retryBtnHeightPx >= 36,
      licenseDistinctFromQueue:
        borderStyles.queueBorderStyle === "dashed" &&
        borderStyles.blockedBorderStyle === "double",
    };

    const metricsBody = {
      issue: 202,
      captureBaseSha,
      generatedAt: new Date().toISOString(),
      method:
        "Vite VITE_CAPTURE=1 + FirstLaunchScreen, Playwright viewport 1280×720 plein écran (clips `-clip.png` optionnels)",
      viewport: VIEWPORT,
      shots,
      labels: { downloadFr, downloadEn, resumeEn },
      measures: { retryBtnHeightPx, borderStyles },
      checks,
      files,
      pass: Object.values(checks).every(Boolean),
    };

    const metricsJson = `${JSON.stringify(metricsBody, null, 2)}\n`;
    const metricsSha256 = sha256(Buffer.from(metricsJson, "utf8"));
    await writeFile(
      path.join(OUT, "download-states-metrics.json"),
      `${JSON.stringify({ ...metricsBody, metricsSha256 }, null, 2)}\n`,
    );

    console.log(JSON.stringify({ ...metricsBody, metricsSha256 }, null, 2));
    if (!metricsBody.pass) process.exitCode = 1;
  } finally {
    proc.kill("SIGTERM");
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
