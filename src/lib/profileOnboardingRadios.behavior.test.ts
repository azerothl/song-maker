import assert from "node:assert/strict";
import { createServer } from "node:net";
import { afterEach, describe, it } from "node:test";
import { chromium } from "playwright";
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
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    throw new Error("port disponible introuvable");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitServer(url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`serveur inaccessible : ${url}`);
}

describe("profile onboarding radio group keyboard", () => {
  afterEach(async () => {
    if (activeServer) {
      await stopCaptureViteServer(activeServer);
      activeServer = null;
    }
  });

  it(
    "uses native radio semantics and arrow-key selection",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      const port = await findAvailablePort();
      activeServer = await startCaptureViteServer(port);
      const baseUrl = captureBaseUrl(port, "profiles-capture.html");
      await waitServer(baseUrl);

      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto(`${baseUrl}#onboarding`, {
          waitUntil: "networkidle",
        });

        assert.equal(
          await page.getByRole("group", { name: "Type de profil" }).count(),
          1,
        );
        assert.equal(await page.getByRole("radio", { name: /Hobby/ }).count(), 1);

        const name = page.locator('[data-testid="profile-create-name"]');
        const create = page.locator('[data-testid="profile-create-submit"]');
        assert.equal(await create.isEnabled(), true, "empty name should be validated on submit");
        await create.click();
        assert.equal(await name.getAttribute("aria-invalid"), "true");
        assert.equal(
          await name.getAttribute("aria-describedby"),
          "profile-create-name-error",
        );
        assert.equal(
          await page.locator('[data-testid="profile-create-name-error"]').isVisible(),
          true,
        );
        assert.equal(await name.evaluate((input) => document.activeElement === input), true);

        await name.fill("Profil clavier");
        assert.equal(await name.getAttribute("aria-invalid"), null);
        assert.equal(
          await page.locator('[data-testid="profile-create-name-error"]').count(),
          0,
        );

        await name.focus();
        await page.keyboard.press("Tab");
        assert.equal(
          await page.locator('input[name="profile-kind"][value="hobby"]').evaluate(
            (input) => document.activeElement === input,
          ),
          true,
          "Tab should enter the radio group at its checked option",
        );

        await page.keyboard.press("ArrowRight");
        assert.equal(
          await page.locator('input[name="profile-kind"][value="commercial"]').isChecked(),
          true,
          "ArrowRight should select the next enabled option",
        );
        assert.equal(
          await page.locator('input[name="profile-kind"][value="commercial"]').evaluate(
            (input) => input.matches(":focus-visible"),
          ),
          true,
          "keyboard focus should stay visible on the selected option",
        );

        await page.keyboard.press("ArrowLeft");
        assert.equal(
          await page.locator('input[name="profile-kind"][value="hobby"]').isChecked(),
          true,
          "ArrowLeft should return to the hobby option",
        );

        await page.setViewportSize({ width: 320, height: 720 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
          "the onboarding screen should reflow without horizontal scrolling at 320px",
        );
      } finally {
        await browser.close();
      }
    },
  );
});
