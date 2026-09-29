import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir =
  process.env.CAPTURE_OUT_DIR ??
  path.join(root, "docs", "captures", "issue-167");

async function waitForServer(url, timeoutMs = 60_000) {
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
  throw new Error(`Serveur inaccessible : ${url}`);
}

const vite = spawn(
  "pnpm",
  ["exec", "vite", "--port", "5179", "--strictPort"],
  {
    cwd: root,
    env: { ...process.env, VITE_CAPTURE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

try {
  await waitForServer("http://127.0.0.1:5179/phase3-license-capture.html");
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://127.0.0.1:5179/phase3-license-capture.html", {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".sep-license-badge-text");
  const shot = path.join(outDir, "phase3-license-badges-1280x720.png");
  await page.screenshot({ path: shot, fullPage: true });
  await browser.close();
  console.log(`Capture enregistrée : ${shot}`);
} finally {
  vite.kill("SIGTERM");
}
