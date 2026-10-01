import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chromium, type Page } from "playwright";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "../dev/captureViteServer.ts";
import type { ViteDevServer } from "vite";

const PORT = 5198;
const BASE = captureBaseUrl(PORT, "score-tab-bench.html");
const IT_TIMEOUT_MS = 120_000;

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

describe("piano roll focus (virtualisation)", () => {
  afterEach(async () => {
    if (activeServer) {
      await stopCaptureViteServer(activeServer);
      activeServer = null;
    }
  });

  it(
    "référence : note focalisée reste document.activeElement après défilement",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT);
      await waitServer(BASE);
      await withPage(async (page) => {
        await page.goto(BASE, { waitUntil: "networkidle" });
        const probe = await page.evaluate(async () => {
          const api = window.__scoreTabBench;
          if (!api) throw new Error("bench API missing");
          return await api.probePianoNoteFocusAfterScroll(
            api.referenceDoc,
            "reference",
          );
        });
        assert.equal(probe.focusKeptOnNote, true, JSON.stringify(probe));
        assert.equal(probe.activeElementIsBody, false, JSON.stringify(probe));
        assert.equal(probe.activeNoteId, probe.focusedNoteId);
      });
    },
  );

  it(
    "longue : note focalisée reste document.activeElement après défilement",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT);
      await waitServer(BASE);
      await withPage(async (page) => {
        await page.goto(BASE, { waitUntil: "networkidle" });
        const probe = await page.evaluate(async () => {
          const api = window.__scoreTabBench;
          if (!api) throw new Error("bench API missing");
          return await api.probePianoNoteFocusAfterScroll(
            api.longReferenceDoc,
            "long",
          );
        });
        assert.equal(probe.focusKeptOnNote, true, JSON.stringify(probe));
        assert.equal(probe.activeElementIsBody, false, JSON.stringify(probe));
      });
    },
  );

  it(
    "défilement sans note focalisée : le focus reste sur .piano-roll",
    { timeout: IT_TIMEOUT_MS },
    async () => {
      activeServer = await startCaptureViteServer(PORT);
      await waitServer(BASE);
      await withPage(async (page) => {
        await page.goto(BASE, { waitUntil: "networkidle" });
        const probe = await page.evaluate(async () => {
          const api = window.__scoreTabBench;
          if (!api) throw new Error("bench API missing");
          return await api.probePianoRollFocusNotStolenOnScroll(api.referenceDoc);
        });
        assert.equal(probe.focusOnRoll, true, JSON.stringify(probe));
      });
    },
  );
});
