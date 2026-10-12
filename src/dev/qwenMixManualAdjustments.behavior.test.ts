import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import { chromium, type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer, stopCaptureViteServer } from "./captureViteServer";

let server: ViteDevServer;
let browser: Browser;
const wav = Buffer.alloc(44 + 960);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24);
wav.writeUInt32LE(96000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(960, 40);
for (let index = 0; index < 480; index++) {
  wav.writeInt16LE(Math.round(Math.sin(index / 10) * 1000), 44 + index * 2);
}

before(async () => {
  server = await startCaptureViteServer(5232);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (server) await stopCaptureViteServer(server);
});

it("allows manual gain and pan changes to a Qwen proposal before applying it", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 830 } });
  try {
    await page.route("**/dev/null/*.wav", (route) =>
      route.fulfill({ status: 200, contentType: "audio/wav", body: wav }),
    );
    await page.addInitScript(() => {
      localStorage.setItem("song-maker.locale", "en");
      (
        window as unknown as {
          __captureQwenMix: (args: unknown) => unknown;
        }
      ).__captureQwenMix = (args: unknown) => {
        const request = args as {
          req: { tracks: Array<{ id: string; gainDb: number }> };
        };
        return {
          model: "fixture",
          elapsedMs: 50,
          explanation: "Testable proposal.",
          adjustments: [
            {
              trackId: request.req.tracks[0].id,
              gainDb: request.req.tracks[0].gainDb - 2,
              pan: 0.2,
            },
          ],
        };
      };
    });

    await page.goto("http://127.0.0.1:5232/production-capture.html#confortable-12", {
      waitUntil: "networkidle",
    });
    await page.getByTestId("production-mix-settings-trigger").click();
    const assistantTrigger = page.getByRole("button", {
      name: "Mix assistant",
      exact: true,
    });
    await assistantTrigger.evaluate((element) => {
      Object.assign((element as HTMLElement).style, {
        position: "fixed",
        top: "665px",
        left: "420px",
      });
    });
    await assistantTrigger.click();

    const panel = page.locator(".qwen-mix-assistant");
    await panel
      .getByRole("button", { name: "Propose settings with the assistant", exact: true })
      .click();
    await panel.getByRole("button", { name: "Review and apply", exact: true }).waitFor();

    const proposedGain = panel.getByRole("slider", {
      name: "Proposed gain for Voix lead",
      exact: true,
    });
    const proposedPan = panel.getByRole("slider", {
      name: "Proposed pan for Voix lead",
      exact: true,
    });
    await proposedGain.focus();
    await proposedGain.press("ArrowRight");
    await proposedPan.focus();
    await proposedPan.press("ArrowRight");
    const gain = Number(await proposedGain.evaluate((element) => (element as HTMLInputElement).value));
    const pan = Number(await proposedPan.evaluate((element) => (element as HTMLInputElement).value));
    assert.equal(gain, -4.5);
    assert.equal(pan, 0.21);

    await panel.getByRole("button", { name: "Review and apply", exact: true }).click();
    await panel.getByRole("button", { name: "Confirm settings", exact: true }).click();
    const appliedGain = page.locator(".track-gain-knob .mix-slider-range").first();
    const appliedPan = page.locator(".track-pan-knob .mix-slider-range").first();
    await page.waitForFunction(
      () =>
        (document.querySelector(".track-gain-knob .mix-slider-range") as HTMLInputElement | null)?.value === "-4.5" &&
        (document.querySelector(".track-pan-knob .mix-slider-range") as HTMLInputElement | null)?.value === "0.21",
      { timeout: 3000 },
    ).catch(async () => {
      const actual = await page.evaluate(() => ({
        gain: (document.querySelector(".track-gain-knob .mix-slider-range") as HTMLInputElement | null)?.value,
        pan: (document.querySelector(".track-pan-knob .mix-slider-range") as HTMLInputElement | null)?.value,
      }));
      assert.fail(`The confirmed proposal was not applied to the track controls: ${JSON.stringify(actual)}`);
    });
    assert.equal(await appliedGain.inputValue(), "-4.5");
    assert.equal(await appliedPan.inputValue(), "0.21");
  } finally {
    await page.close();
  }
});
