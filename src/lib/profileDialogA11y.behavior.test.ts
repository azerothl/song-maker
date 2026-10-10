import assert from "node:assert/strict";
import { createServer } from "node:net";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "../dev/captureViteServer.ts";
import type { ViteDevServer } from "vite";

const IT_TIMEOUT_MS = 60_000;

let activeServer: ViteDevServer | null = null;

async function findAvailablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    throw new Error("port disponible introuvable");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`serveur inaccessible : ${url}`);
}

async function withPage(fn: (page: Page) => Promise<void>): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await fn(page);
  } finally {
    await browser.close();
  }
}

async function openRenameDialog(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}#onboarding-commercial-disabled`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="profile-rename-profile-002"]', {
    timeout: 15_000,
  });
  await page.click('[data-testid="profile-rename-profile-002"]');
  await page.waitForSelector('[data-testid="profile-rename-dialog"]', { timeout: 10_000 });
  const input = page.locator('[data-testid="profile-rename-input"]');
  await input.waitFor({ state: "visible" });
  await input.focus();
}

describe("profile rename dialog keyboard (#212 B1)", () => {
  afterEach(async () => {
    if (activeServer) {
      await stopCaptureViteServer(activeServer);
      activeServer = null;
    }
  });

  it(
    "ArrowLeft and Home keep focus in the text field; Tab and Escape still work",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const port = await findAvailablePort();
      activeServer = await startCaptureViteServer(port);
      await waitServer(captureBaseUrl(port, "profiles-app-capture.html"));

      await withPage(async (page) => {
        await openRenameDialog(page, captureBaseUrl(port, "profiles-app-capture.html"));

        const inputSel = '[data-testid="profile-rename-input"]';
        await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          if (!el) throw new Error("input missing");
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }, inputSel);

        await page.keyboard.press("Home");
        const afterHome = await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          return {
            active: document.activeElement === el,
            start: el?.selectionStart ?? -1,
          };
        }, inputSel);
        assert.equal(afterHome.active, true, "Home must not move focus out of input");
        assert.equal(afterHome.start, 0, "Home must move caret to start");

        await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          el?.setSelectionRange(el.value.length, el.value.length);
        }, inputSel);

        await page.keyboard.press("ArrowLeft");
        const afterLeft = await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          return document.activeElement === el;
        }, inputSel);
        assert.equal(afterLeft, true, "ArrowLeft must not move focus to Cancel");

        await page.keyboard.press("Tab");
        const afterTab = await page.evaluate(() => {
          const cancel = document.querySelector(
            '[data-testid="profile-rename-cancel"]',
          );
          return document.activeElement === cancel;
        });
        assert.equal(afterTab, true, "Tab must move focus within the dialog");

        await page.keyboard.press("Escape");
        const afterEsc = await page.evaluate(() => ({
          dialogOpen: !!document.querySelector('[data-testid="profile-rename-dialog"]'),
        }));
        assert.equal(afterEsc.dialogOpen, false, "Escape must close the dialog");
      });
    },
  );
});
