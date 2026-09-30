/**
 * Captures + mesures pli / focus Demucs pour l’écran de premier lancement (#199).
 *
 * Usage : pnpm exec tsx docs/design/first-launch/captures-react/capture.mts
 */
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
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

async function measureGridFocus(page: Page): Promise<FocusProof> {
  const grid = page.locator(".fl-grid").first();
  await grid.focus();
  return page.evaluate(`(() => {
    const el = document.querySelector(".fl-grid");
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

async function scrollInterruptedErrboxClear(page: Page): Promise<number> {
  return page.evaluate(`(() => {
    const body = document.querySelector(".fl-scroll-body");
    if (!body) return 0;
    body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
    const hint = document.querySelector(".fl-scroll-hint");
    const texts = [
      ...document.querySelectorAll(".fl-errbox h2, .fl-errbox p, .fl-errbox li"),
    ];
    if (!hint) return 0;
    const hr = hint.getBoundingClientRect();
    let masked = 0;
    for (const el of texts) {
      const tr = el.getBoundingClientRect();
      if (
        tr.height > 0 &&
        tr.bottom > hr.top + 0.5 &&
        tr.top < hr.bottom - 0.5 &&
        tr.right > hr.left &&
        tr.left < hr.right
      ) {
        masked += 1;
      }
    }
    return masked;
  })()`) as Promise<number>;
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
      env: { ...process.env, VITE_CAPTURE: "1" },
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

    const gridFocusResults: Record<string, unknown> = {};
    for (const height of [640, 720, 768] as const) {
      const page = await browser.newPage({
        viewport: { width: 1280, height },
      });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForSelector(".fl-grid[tabindex='0']", { timeout: 15_000 });
      const gridFocus = await measureGridFocus(page);
      const file = `first-launch-grid-focus-1280x${height}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
      const buf = await readFile(path.join(OUT, file));
      files[file] = { sha256: sha256(buf), bytes: buf.length };
      gridFocusResults[`grid-${height}`] = {
        file,
        viewport: { width: 1280, height },
        ...gridFocus,
        pass: gridFocus.isCyan2px && gridFocus.matchesFocusVisible,
      };
      await page.close();
    }

    const interruptedResults: Record<string, unknown> = {};
    for (const height of [640, 720, 768] as const) {
      const page = await browser.newPage({
        viewport: { width: 1280, height },
      });
      await page.goto(`${BASE}#c`, { waitUntil: "networkidle" });
      await page.waitForSelector(".fl-errbox", { timeout: 15_000 });
      await page.waitForTimeout(250);
      const masked = await scrollInterruptedErrboxClear(page);
      const file = `first-launch-interrupted-1280x${height}.png`;
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
      const buf = await readFile(path.join(OUT, file));
      files[file] = { sha256: sha256(buf), bytes: buf.length };
      interruptedResults[`interrupted-${height}`] = {
        file,
        viewport: { width: 1280, height },
        maskedErrboxTextNodes: masked,
        pass: masked === 0,
      };
      await page.close();
    }

    await browser.close();

    const baseGitSha = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).stdout?.trim();

    const metricsBody = {
      issue: 199,
      baseGitSha,
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
      gridFocus: gridFocusResults,
      interruptedErrbox: interruptedResults,
      files,
      pass:
        Object.values(foldResults).every(
          (row) =>
            row &&
            typeof row === "object" &&
            "checks" in row &&
            (row as { checks: { pass: boolean } }).checks.pass,
        ) &&
        demucsFocus.isCyan2px &&
        Object.values(gridFocusResults).every(
          (row) =>
            row &&
            typeof row === "object" &&
            "pass" in row &&
            (row as { pass: boolean }).pass,
        ) &&
        Object.values(interruptedResults).every(
          (row) =>
            row &&
            typeof row === "object" &&
            "pass" in row &&
            (row as { pass: boolean }).pass,
        ),
    };

    const metricsJson = `${JSON.stringify(metricsBody, null, 2)}\n`;
    const metricsSha256 = sha256(Buffer.from(metricsJson, "utf8"));

    await writeFile(
      path.join(OUT, "metrics.json"),
      `${JSON.stringify({ ...metricsBody, metricsSha256 }, null, 2)}\n`,
    );
    console.log(JSON.stringify({ ...metricsBody, metricsSha256 }, null, 2));
    if (!metricsBody.pass) {
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
