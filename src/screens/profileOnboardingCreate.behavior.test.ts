import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "../dev/captureViteServer.ts";
import { PROFILE_NAME_MAX_LENGTH } from "../lib/profileRenameValidation.ts";
import enProfiles from "../ui/en.profiles.json";
import fr from "../ui/fr.json";
import type { ViteDevServer } from "vite";

const PORT = 5233;
const BASE = captureBaseUrl(PORT, "profiles-capture.html");
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

async function withPage(
  locale: "fr" | "en",
  fn: (page: Page) => Promise<void>,
): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript((loc) => {
      localStorage.setItem("song-maker.locale", loc);
    }, locale);
    await fn(page);
  } finally {
    await browser.close();
  }
}

function expectedTooLongLabel(locale: "fr" | "en"): string {
  const template =
    locale === "en"
      ? enProfiles["profiles.rename.error.tooLong"]
      : fr["profiles.rename.error.tooLong"];
  return template.replace("{max}", String(PROFILE_NAME_MAX_LENGTH));
}

async function submitOverlongCreateName(page: Page): Promise<void> {
  await page.goto(`${BASE}#onboarding-commercial-disabled`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector('[data-testid="profile-create-name"]', { timeout: 15_000 });
  const overlong = "z".repeat(PROFILE_NAME_MAX_LENGTH + 1);
  const input = page.locator('[data-testid="profile-create-name"]');
  await input.evaluate((el) => el.removeAttribute("maxlength"));
  await input.fill(overlong);
  await page.click('[data-testid="profile-create-submit"]');
  await page.waitForSelector('[data-testid="capture-app-error"]', { timeout: 10_000 });
}

function assertNoRawI18nKeys(visible: string, ariaLive: string) {
  const combined = `${visible}\n${ariaLive}`;
  assert.doesNotMatch(combined, /profiles\.rename\.error\./);
}

describe("profile create name length (#212)", () => {
  afterEach(async () => {
    if (activeServer) {
      await stopCaptureViteServer(activeServer);
      activeServer = null;
    }
  });

  for (const locale of ["fr", "en"] as const) {
    it(
      `create > ${PROFILE_NAME_MAX_LENGTH} chars shows localized error (${locale}), not raw key`,
      { timeout: IT_TIMEOUT_MS },
      async () => {
        activeServer = await startCaptureViteServer(PORT);
        await waitServer(BASE);
        const expected = expectedTooLongLabel(locale);

        await withPage(locale, async (page) => {
          await submitOverlongCreateName(page);
          const banner = page.locator('[data-testid="capture-app-error"]');
          const visible = (await banner.innerText()).trim();
          assert.match(visible, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
          const ariaLive = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll("[aria-live]"));
            return nodes.map((n) => n.textContent ?? "").join("\n");
          });
          assertNoRawI18nKeys(visible, ariaLive);
        });
      },
    );
  }
});
