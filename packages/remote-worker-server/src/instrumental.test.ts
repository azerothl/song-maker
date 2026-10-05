import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { remoteInstrumental } from "./instrumental.js";
import { buildMinimalWav } from "./server.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("keeps the original and explains a missing FFmpeg instead of publishing raw vocals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rw-missing-ffmpeg-"));
  const original = buildMinimalWav(0.25);
  vi.stubEnv("SONG_MAKER_FFMPEG", join(directory, "missing-ffmpeg"));
  try {
    await expect(remoteInstrumental(original, directory, "http://unused", () => false)).rejects.toThrow("FFmpeg est absent");
    expect(await readFile(join(directory, "audio-original.wav"))).toEqual(original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it("honors cancellation before starting audio preparation and retains the original", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rw-cancel-instrumental-"));
  const original = buildMinimalWav(0.25);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(remoteInstrumental(original, directory, "http://unused", () => true)).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
    expect(await readFile(join(directory, "audio-original.wav"))).toEqual(original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
