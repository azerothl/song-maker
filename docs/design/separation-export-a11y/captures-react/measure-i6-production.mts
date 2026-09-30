/**
 * I6 — mesures réelles ProductionWorkspace (harness production-capture.html).
 * Barre mix : documentée à ~32 px (décision Pascal pour 44 px).
 * Tiroir actions : boutons « Importer » / « Enregistrer » (mix-user-actions).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
const OUT = __dirname;
const PORT = 5191;
const BASE = `http://127.0.0.1:${PORT}/production-capture.html`;
const VP = { width: 1280, height: 720 };

type I6Scene = {
  hash: string;
  fileBase: string;
  mixToolbar44?: boolean;
};

const SCENES: I6Scene[] = [
  { hash: "6,auto,actions-open", fileBase: "i6-production-6-auto-actions-open" },
  { hash: "16,auto,actions-open", fileBase: "i6-production-16-auto-actions-open" },
  {
    hash: "6,auto,actions-open,mix-toolbar-44",
    fileBase: "i6-production-6-auto-mix-toolbar-44",
    mixToolbar44: true,
  },
];

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

type I6Metrics = {
  hash: string;
  viewport: { width: number; height: number };
  mixToolbarBarPx: { height: number; top: number; bottom: number } | null;
  mixToolbarBtnHeightsPx: number[];
  drawerImportRecordHeightsPx: number[];
  mixTracksScrollPx: {
    clientHeight: number;
    scrollHeight: number;
    top: number;
    bottom: number;
  } | null;
  noteMixToolbarTargetPx: number;
  noteDrawerTargetPx: number;
  mixToolbar44Variant: boolean;
};

async function measurePage(page: import("playwright").Page): Promise<I6Metrics> {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const toolbar = document.querySelector(
      ".production-mix-toolbar",
    ) as HTMLElement | null;
    const toolbarBtns = Array.from(
      document.querySelectorAll(
        ".production-mix-toolbar-actions .btn, .production-mix-toolbar-actions .mix-assist-trigger",
      ),
    ) as HTMLElement[];
    const drawerBtns = Array.from(
      document.querySelectorAll(".mix-user-actions .btn"),
    ) as HTMLElement[];
    const scroll = document.querySelector(
      ".production-mix-scroll",
    ) as HTMLElement | null;

    const tr = toolbar?.getBoundingClientRect();
    const sr = scroll?.getBoundingClientRect();

    return {
      hash: location.hash,
      viewport: { width: vw, height: vh },
      mixToolbarBarPx: tr
        ? { height: tr.height, top: tr.top, bottom: tr.bottom }
        : null,
      mixToolbarBtnHeightsPx: toolbarBtns.map((b) => b.getBoundingClientRect().height),
      drawerImportRecordHeightsPx: drawerBtns.map((b) =>
        b.getBoundingClientRect().height,
      ),
      mixTracksScrollPx: scroll
        ? {
            clientHeight: scroll.clientHeight,
            scrollHeight: scroll.scrollHeight,
            top: sr!.top,
            bottom: sr!.bottom,
          }
        : null,
      noteMixToolbarTargetPx: 32,
      noteDrawerTargetPx: 44,
      mixToolbar44Variant: document
        .querySelector(".production-capture-root")
        ?.classList.contains("production-capture-mix-toolbar-44") ?? false,
    };
  });
}

function assertMetrics(m: I6Metrics, scene: I6Scene): void {
  const label = scene.fileBase;
  if (!m.mixToolbarBarPx) throw new Error(`${label}: barre mix absente`);
  if (!m.mixTracksScrollPx) throw new Error(`${label}: zone pistes absente`);
  if (m.drawerImportRecordHeightsPx.length < 2) {
    throw new Error(`${label}: boutons tiroir mix-user-actions absents`);
  }
  for (const h of m.drawerImportRecordHeightsPx) {
    if (h < 44 - 0.5) {
      throw new Error(`${label}: bouton tiroir ${h}px < 44`);
    }
  }
  if (!scene.mixToolbar44) {
    for (const h of m.mixToolbarBtnHeightsPx) {
      if (h > 36) {
        console.warn(
          `${label}: bouton barre mix ${h}px > 36 (attendu ~32 en prod, décision Pascal pour 44)`,
        );
      }
    }
  } else {
    for (const h of m.mixToolbarBtnHeightsPx) {
      if (h < 44 - 0.5) {
        throw new Error(`${label}: variante 44 px — bouton ${h}px < 44`);
      }
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

const all: Record<string, I6Metrics> = {};

try {
  await waitServer(BASE);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const scene of SCENES) {
    await page.setViewportSize(VP);
    await page.goto(`${BASE}#${scene.hash}`);
    await page.waitForTimeout(1200);
    const m = await measurePage(page);
    const key = `${scene.fileBase}-1280x720`;
    all[key] = m;
    await page.screenshot({
      path: path.join(OUT, `${key}.png`),
      fullPage: false,
    });
    console.log(key, JSON.stringify(m, null, 0));
    assertMetrics(m, scene);
  }

  await browser.close();
  writeFileSync(
    path.join(OUT, "i6-production-metrics.json"),
    JSON.stringify(all, null, 2),
  );
} finally {
  vite.kill("SIGTERM");
}
