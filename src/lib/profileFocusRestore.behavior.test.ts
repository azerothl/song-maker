import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "../dev/captureViteServer.ts";
import type { ViteDevServer } from "vite";

const PORT = 5197;
const BASE = captureBaseUrl(PORT, "profiles-app-capture.html");
const IT_TIMEOUT_MS = 60_000;

let activeServer: ViteDevServer | null = null;

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

async function activeIsTestId(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return el !== null && document.activeElement === el;
  }, testId);
}

describe("profile focus restore (behavior)", () => {
  afterEach(async () => {
    if (activeServer) {
      await stopCaptureViteServer(activeServer);
      activeServer = null;
    }
  });

  it(
    "switch confirm: Escape returns focus to profile selector trigger",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT);
      await waitServer(BASE);
      await withPage(async (page) => {
        await page.goto(`${BASE}#selector-open`, { waitUntil: "networkidle" });
        await page.waitForSelector('[data-testid="profile-selector-menu"]', {
          timeout: 15_000,
        });
        await page.click('[data-testid="profile-menu-item-profile-002"]');
        await page.waitForSelector('[data-testid="profile-switch-confirm-dialog"]', {
          timeout: 15_000,
        });
        await page.keyboard.press("Escape");
        await page.waitForSelector('[data-testid="profile-switch-confirm-dialog"]', {
          state: "hidden",
          timeout: 10_000,
        });
        assert.equal(
          await activeIsTestId(page, "profile-selector-trigger"),
          true,
          "focus must return to selector trigger after Escape",
        );
      });
    },
  );

  it(
    "onboarding rename: Escape, Cancel and Save return focus to edit trigger",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT);
      await waitServer(BASE);
      const trigger = "profile-rename-profile-002";

      await withPage(async (page) => {
        await page.goto(`${BASE}#onboarding-commercial-disabled`, {
          waitUntil: "networkidle",
        });
        await page.waitForSelector(`[data-testid="${trigger}"]`, { timeout: 15_000 });

        await page.click(`[data-testid="${trigger}"]`);
        await page.waitForSelector('[data-testid="profile-rename-dialog"]');

        await page.keyboard.press("Escape");
        await page.waitForSelector('[data-testid="profile-rename-dialog"]', {
          state: "hidden",
        });
        assert.equal(await activeIsTestId(page, trigger), true, "after Escape");

        await page.click(`[data-testid="${trigger}"]`);
        await page.click('[data-testid="profile-rename-cancel"]');
        assert.equal(await activeIsTestId(page, trigger), true, "after Cancel");

        await page.click(`[data-testid="${trigger}"]`);
        const input = page.locator('[data-testid="profile-rename-input"]');
        await input.fill("Reprises studio");
        await page.click('[data-testid="profile-rename-save"]');
        assert.equal(await activeIsTestId(page, trigger), true, "after Save");
      });
    },
  );
});
