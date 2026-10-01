/**
 * Captures + métriques a11y notes piano roll (#246).
 *
 * Usage : pnpm exec tsx docs/design/piano-roll-a11y/captures-react/capture.mts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  captureBaseUrl,
  startCaptureViteServer,
  stopCaptureViteServer,
} from "../../../../src/dev/captureViteServer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const PORT = 5196;
const BASE = captureBaseUrl(PORT, "piano-roll-a11y-capture.html");
const VIEWPORTS = [
  { id: "1280", width: 1280, height: 720 },
  { id: "640", width: 640, height: 720 },
] as const;

type NoteMetric = {
  id: string;
  ariaLabel: string | null;
  ariaSelected: string | null;
  width: number;
  height: number;
};

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

async function noteMetrics(page: import("playwright").Page): Promise<NoteMetric[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll<HTMLButtonElement>(".piano-note")).map(
      (el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute("data-piano-note-id") ?? "",
          ariaLabel: el.getAttribute("aria-label"),
          ariaSelected: el.getAttribute("aria-selected"),
          width: r.width,
          height: r.height,
        };
      },
    );
  });
}

await mkdir(OUT, { recursive: true });
const server = await startCaptureViteServer(PORT);
const browser = await chromium.launch();
const results: Record<string, unknown> = {
  issue: 246,
  capturedAt: new Date().toISOString(),
  viewports: {},
};

try {
  await waitServer(BASE);
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForSelector(".piano-note", { timeout: 15_000 });

    const before = await noteMetrics(page);
    const first = page.locator(".piano-note").first();
    await first.focus();
    await page.keyboard.press("Enter");
    const afterEnter = await noteMetrics(page);
    await page.locator(".piano-note").nth(1).focus();
    await page.keyboard.press(" ");
    const afterSpace = await noteMetrics(page);

    const file = `piano-notes-${vp.id}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });

    const allGe44 = afterSpace.every((n) => n.width >= 44 && n.height >= 44);
    const allLabeled = afterSpace.every(
      (n) => typeof n.ariaLabel === "string" && n.ariaLabel.includes("Note"),
    );
    const selectedAfterEnter = afterEnter.find((n) => n.id === before[0]?.id);
    const selectedAfterSpace = afterSpace.find((n) => n.id === before[1]?.id);

    results.viewports[vp.id] = {
      file,
      viewport: { width: vp.width, height: vp.height },
      notes: afterSpace,
      checks: {
        targetsAtLeast44Px: allGe44,
        accessibleNames: allLabeled,
        enterSelects: selectedAfterEnter?.ariaSelected === "true",
        spaceSelects: selectedAfterSpace?.ariaSelected === "true",
      },
    };

    if (!allGe44) throw new Error(`cibles < 44 px @ ${vp.id}`);
    if (!allLabeled) throw new Error(`aria-label manquant @ ${vp.id}`);
    if (selectedAfterEnter?.ariaSelected !== "true") {
      throw new Error(`Entrée ne sélectionne pas @ ${vp.id}`);
    }
    if (selectedAfterSpace?.ariaSelected !== "true") {
      throw new Error(`Espace ne sélectionne pas @ ${vp.id}`);
    }

    await page.close();
    console.log(JSON.stringify({ viewport: vp.id, file, ok: true }));
  }

  await writeFile(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
  await stopCaptureViteServer(server);
}
