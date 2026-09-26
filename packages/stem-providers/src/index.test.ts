import { describe, expect, it } from "vitest";
import {
  BS_ROFORMER_CAPABILITIES,
  HTDEMUCS_PACKAGE,
  STEM_DISPLAY_NAMES,
  createStemSeparator,
  isCoreStemRole,
  listStemProviderIds,
  reliabilityForRole,
} from "./index.js";

describe("stem-providers", () => {
  it("lists both providers without colliding ids", () => {
    expect(listStemProviderIds()).toEqual(["htdemucs", "bs_roformer"]);
  });

  it("pins HTDemucs package hash from the first-build contract", () => {
    expect(HTDEMUCS_PACKAGE.gguf).toBe("htdemucs-q8_0.gguf");
    expect(HTDEMUCS_PACKAGE.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("marks guitar/piano less reliable and never renames other to Synths", () => {
    expect(reliabilityForRole("guitar")).toBe("less_reliable");
    expect(reliabilityForRole("vocals")).toBe("standard");
    expect(STEM_DISPLAY_NAMES.other).toBe("Accompagnement");
    expect(isCoreStemRole("other")).toBe(true);
    expect(isCoreStemRole("piano")).toBe(false);
  });

  it("BS-RoFormer stub advertises extras and refuses separate()", async () => {
    const provider = createStemSeparator("bs_roformer");
    expect(provider.capabilities).toEqual(BS_ROFORMER_CAPABILITIES);
    await expect(
      provider.separate({
        inputPath: "/tmp/in.wav",
        inputSha256: "0".repeat(64),
        projectSampleRate: 48000,
        outputDir: "/tmp/sep",
      }),
    ).rejects.toThrow(/stub/i);
  });

  it("HTDemucs separate() is deferred to the phase-1 worker", async () => {
    const provider = createStemSeparator("htdemucs");
    await expect(
      provider.separate({
        inputPath: "/tmp/in.wav",
        inputSha256: "0".repeat(64),
        projectSampleRate: 48000,
        outputDir: "/tmp/sep",
      }),
    ).rejects.toThrow(/not implemented/i);
  });
});
