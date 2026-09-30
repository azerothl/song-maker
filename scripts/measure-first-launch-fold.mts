/**
 * Measure HTDemucs license checkbox / Download button fold visibility.
 * Usage: pnpm exec tsx scripts/measure-first-launch-fold.mts
 */
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5188;
const url = `http://127.0.0.1:${PORT}/`;

async function waitForServer(timeoutMs: number): Promise<void> {
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
  throw new Error(`Vite unreachable: ${url}`);
}

const proc = spawn(
  "pnpm",
  ["exec", "vite", "--host", "127.0.0.1", "--port", String(PORT)],
  {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

try {
  await waitForServer(60_000);
  const browser = await chromium.launch({ channel: "chrome" });

  async function measure(height: number) {
    const context = await browser.newContext({
      viewport: { width: 1280, height },
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("#fl-htdemucs-license-accept", {
      timeout: 15_000,
    });
    const m = await page.evaluate(`(() => {
      const vh = window.innerHeight;
      const main = document.querySelector(".main");
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          sel,
          top: Math.round(r.top),
          bottom: Math.round(r.bottom),
          height: Math.round(r.height),
          inView: r.top >= -0.5 && r.bottom <= vh + 0.5 && r.height > 0,
        };
      };
      return {
        vh,
        innerWidth: window.innerWidth,
        docScrollHeight: document.documentElement.scrollHeight,
        mainScrollHeight: main ? main.scrollHeight : null,
        mainClientHeight: main ? main.clientHeight : null,
        mainScrollTop: main ? main.scrollTop : null,
        checkbox: pick('label[for="fl-htdemucs-license-accept"]'),
        download: pick(".fl-actions .fl-btn"),
        foot: pick(".fl-foot"),
        notice: pick("[data-testid=fl-htdemucs-notice]"),
        demucsLink: pick('.fl-license a[href*="demucs"]'),
        yue2Cb: pick('label[for="fl-license-accept"]'),
      };
    })()`);
    await context.close();
    return m;
  }

  const report = {
    h720: await measure(720),
    h640: await measure(640),
  };
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} finally {
  proc.kill("SIGTERM");
}
