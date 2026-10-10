import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "./captureViteServer.ts";

const PORT = 5297;
const BASE = captureBaseUrl(PORT, "app-error-boundary-capture.html");
let server: ViteDevServer | null = null;
let browser: Browser | null = null;

afterEach(async () => {
  await browser?.close();
  browser = null;
  if (server) await stopCaptureViteServer(server);
  server = null;
});

it("replaces a render failure with accessible recovery steps and hidden diagnostics", { timeout: 60_000 }, async () => {
  server = await startCaptureViteServer(PORT);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(BASE, { waitUntil: "networkidle" });

  const heading = page.getByRole("heading", { level: 1 });
  await heading.waitFor({ state: "visible" });
  assert.match(await heading.innerText(), /n’a pas pu afficher|could not display/i);
  await page.waitForFunction(() => document.activeElement?.id === "app-error-title");

  const alert = page.getByRole("alert");
  assert.match(await alert.innerText(), /Rechargez l’application|Reload the app/i);
  assert.doesNotMatch(await alert.innerText(), /capture component render failed/);

  const details = page.locator(".app-error-details");
  assert.equal(await details.getAttribute("open"), null);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "SUMMARY");
  await page.keyboard.press("Enter");
  assert.equal(await details.getAttribute("open"), "");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "PRE");
  assert.match(await details.innerText(), /capture component render failed/);
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("button", { name: /Recharger l’application|Reload the app/i }).evaluate(button => document.activeElement === button), true);
});
