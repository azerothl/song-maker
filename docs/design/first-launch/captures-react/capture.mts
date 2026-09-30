/**
 * Captures + mesures pli / focus Demucs pour l’écran de premier lancement (#199).
 *
 * Usage : pnpm exec tsx docs/design/first-launch/captures-react/capture.mts
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5192;
const BASE = `http://127.0.0.1:${PORT}/`;

type Viewport = { width: number; height: number };

type RectMetrics = {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  inViewport: boolean;
};

type FoldShot = {
  id: string;
  file: string;
  viewport: Viewport;
  requireCheckbox: boolean;
  requireDownload: boolean;
};

type FocusProof = {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  outlineOffset: string;
  matchesFocusVisible: boolean;
  isCyan2px: boolean;
};

const FOLD_SHOTS: FoldShot[] = [
  {
    id: "fold-720",
    file: "first-launch-gpu-fold-1280x720.png",
    viewport: { width: 1280, height: 720 },
    requireCheckbox: true,
    requireDownload: true,
  },
  {
    id: "fold-640",
    file: "first-launch-gpu-fold-1280x640.png",
    viewport: { width: 1280, height: 640 },
    requireCheckbox: true,
    requireDownload: true,
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

async function measureFold(page: Page) {
  return page.evaluate(`(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top * 10) / 10,
        bottom: Math.round(r.bottom * 10) / 10,
        left: Math.round(r.left * 10) / 10,
        right: Math.round(r.right * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
        inViewport:
          r.width > 0 &&
          r.height > 0 &&
          r.top >= -0.5 &&
          r.left >= -0.5 &&
          r.bottom <= vh + 0.5 &&
          r.right <= vw + 0.5,
      };
    };
    const main = document.querySelector(".main");
    return {
      viewport: { width: vw, height: vh },
      mainScrollHeight: main ? main.scrollHeight : null,
      mainClientHeight: main ? main.clientHeight : null,
      htdemucsCheckbox: pick('label[for="fl-htdemucs-license-accept"]'),
      downloadButton: pick(".fl-actions .fl-btn"),
      foot: pick(".fl-foot"),
      demucsLink: pick("a.fl-demucs-link"),
    };
  })()`) as Promise<{
    viewport: Viewport;
    mainScrollHeight: number | null;
    mainClientHeight: number | null;
    htdemucsCheckbox: RectMetrics | null;
    downloadButton: RectMetrics | null;
    foot: RectMetrics | null;
    demucsLink: RectMetrics | null;
  }>;
}

async function measureDemucsFocus(page: Page): Promise<FocusProof> {
  const link = page.locator("a.fl-demucs-link").first();
  await link.focus();
  return page.evaluate(`(() => {
    const el = document.querySelector("a.fl-demucs-link");
    if (!el) {
      return {
        outlineStyle: "",
        outlineWidth: "",
        outlineColor: "",
        outlineOffset: "",
        matchesFocusVisible: false,
        isCyan2px: false,
      };
    }
    el.focus();
    const cs = getComputedStyle(el);
    const outlineStyle = cs.outlineStyle;
    const outlineWidth = cs.outlineWidth;
    const outlineColor = cs.outlineColor;
    const outlineOffset = cs.outlineOffset;
    const matchesFocusVisible = el.matches(":focus-visible");
    const isCyan2px =
      outlineStyle === "solid" &&
      (outlineWidth === "2px" || outlineWidth === "2") &&
      /rgb\\(\\s*94\\s*,\\s*236\\s*,\\s*248\\s*\\)/.test(outlineColor);
    return {
      outlineStyle,
      outlineWidth,
      outlineColor,
      outlineOffset,
      matchesFocusVisible,
      isCyan2px,
    };
  })()`) as Promise<FocusProof>;
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
    const foldResults: Record<string, unknown> = {};
    const files: Record<string, { sha256: string; bytes: number }> = {};

    for (const shot of FOLD_SHOTS) {
      const page = await browser.newPage({ viewport: shot.viewport });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForSelector("#fl-htdemucs-license-accept", {
        timeout: 15_000,
      });
      await page.waitForTimeout(300);
      const fold = await measureFold(page);
      const outPath = path.join(OUT, shot.file);
      await page.screenshot({ path: outPath, fullPage: false });
      const buf = await readFile(outPath);
      files[shot.file] = { sha256: sha256(buf), bytes: buf.length };

      const checkboxOk = Boolean(fold.htdemucsCheckbox?.inViewport);
      const downloadOk = Boolean(fold.downloadButton?.inViewport);
      foldResults[shot.id] = {
        file: shot.file,
        viewport: shot.viewport,
        ...fold,
        checks: {
          htdemucsCheckboxAboveFold: checkboxOk,
          downloadButtonAboveFold: downloadOk,
          pass:
            (!shot.requireCheckbox || checkboxOk) &&
            (!shot.requireDownload || downloadOk),
        },
      };
      await page.close();
    }

    const focusPage = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await focusPage.goto(BASE, { waitUntil: "networkidle" });
    await focusPage.waitForSelector("a.fl-demucs-link", { timeout: 15_000 });
    const demucsFocus = await measureDemucsFocus(focusPage);
    const focusFile = "first-launch-demucs-link-focus-1280x720.png";
    await focusPage.locator("a.fl-demucs-link").first().screenshot({
      path: path.join(OUT, focusFile),
    });
    const focusBuf = await readFile(path.join(OUT, focusFile));
    files[focusFile] = { sha256: sha256(focusBuf), bytes: focusBuf.length };
    await focusPage.close();
    await browser.close();

    const metrics = {
      issue: 199,
      generatedAt: new Date().toISOString(),
      method:
        "Vite + App React réelle, Playwright Chromium/Chrome, getBoundingClientRect (pas pixels seuls)",
      fold: foldResults,
      demucsFocus: {
        file: focusFile,
        ...demucsFocus,
        expected: "2px solid var(--accent-cyan) / rgb(94, 236, 248)",
        pass: demucsFocus.isCyan2px && demucsFocus.matchesFocusVisible,
      },
      files,
      pass:
        Object.values(foldResults).every(
          (row) =>
            row &&
            typeof row === "object" &&
            "checks" in row &&
            (row as { checks: { pass: boolean } }).checks.pass,
        ) && demucsFocus.isCyan2px,
    };

    await writeFile(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify(metrics, null, 2)}\n`,
    );
    console.log(JSON.stringify(metrics, null, 2));
    if (!metrics.pass) {
      process.exitCode = 1;
    }
  } finally {
    proc.kill("SIGTERM");
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
