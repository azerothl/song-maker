import { describe, expect, it } from "vitest";
import {
  BS_ROFORMER_CAPABILITIES,
  BS_ROFORMER_PACKAGE,
  HTDEMUCS_PACKAGE,
  STEM_DISPLAY_NAMES,
  createStemSeparator,
  describeStemProvidersFr,
  isCoreStemRole,
  isStemProviderRunnable,
  listStemProviderIds,
  mapBsRoFormerStemIds,
  mapHtDemucsStemIds,
  reliabilityForRole,
  type AudiocppSepTransport,
} from "./index.js";

describe("stem-providers", () => {
  it("lists both providers without colliding ids", () => {
    expect(listStemProviderIds()).toEqual(["htdemucs", "bs_roformer"]);
  });

  it("pins HTDemucs package hash from the first-build contract", () => {
    expect(HTDEMUCS_PACKAGE.gguf).toBe("htdemucs-q8_0.gguf");
    expect(HTDEMUCS_PACKAGE.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("pins BS-RoFormer package metadata without shipping weights", () => {
    expect(BS_ROFORMER_PACKAGE.packageId).toBe("bs_roformer_q8_0");
    expect(BS_ROFORMER_PACKAGE.gguf).toBe("bs-roformer-ep368-q8_0.gguf");
    expect(BS_ROFORMER_PACKAGE.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("marks guitar/piano unavailable for both providers; other stays Accompagnement", () => {
    expect(reliabilityForRole("guitar")).toBe("less_reliable");
    expect(reliabilityForRole("vocals")).toBe("standard");
    expect(STEM_DISPLAY_NAMES.other).toBe("Accompagnement");
    expect(isCoreStemRole("other")).toBe(true);
    expect(isCoreStemRole("piano")).toBe(false);
    expect(BS_ROFORMER_CAPABILITIES.unavailableRoles).toEqual([
      "drums",
      "bass",
      "guitar",
      "piano",
    ]);
  });

  it("maps BS-RoFormer instrumental → other and refuses missing stems", () => {
    expect(mapBsRoFormerStemIds(["vocals", "instrumental"]).roles).toEqual([
      "vocals",
      "other",
    ]);
    expect(mapHtDemucsStemIds(["vocals", "drums", "bass", "other"])).toEqual([
      "vocals",
      "drums",
      "bass",
      "other",
    ]);
  });

  it("BS-RoFormer without transport refuses separate()", async () => {
    const provider = createStemSeparator("bs_roformer");
    expect(provider.capabilities).toEqual(BS_ROFORMER_CAPABILITIES);
    await expect(
      provider.separate({
        inputPath: "/tmp/in.wav",
        inputSha256: "0".repeat(64),
        projectSampleRate: 48000,
        outputDir: "/tmp/sep",
      }),
    ).rejects.toThrow(/AudiocppSepTransport|GGUF/i);
  });

  it("HTDemucs without transport refuses separate()", async () => {
    const provider = createStemSeparator("htdemucs");
    await expect(
      provider.separate({
        inputPath: "/tmp/in.wav",
        inputSha256: "0".repeat(64),
        projectSampleRate: 48000,
        outputDir: "/tmp/sep",
      }),
    ).rejects.toThrow(/AudiocppSepTransport/i);
  });

  it("runs HTDemucs separate() through an injected transport", async () => {
    const transport: AudiocppSepTransport = {
      async runSeparation() {
        return { namedStemIds: ["vocals", "drums", "bass", "other"] };
      },
      async sha256File() {
        return "a".repeat(64);
      },
    };
    const provider = createStemSeparator("htdemucs", transport);
    const result = await provider.separate({
      inputPath: "/tmp/in.wav",
      inputSha256: "0".repeat(64),
      projectSampleRate: 48000,
      outputDir: "/tmp/sep",
      separatorInputPath: "/tmp/sep/input-44100.wav",
    });
    expect(result.stems).toHaveLength(4);
    expect(result.unavailableRoles).toEqual(["guitar", "piano"]);
    expect(result.family).toBe("htdemucs");
  });

  it("runs BS-RoFormer separate() and marks drums/bass/guitar/piano unavailable", async () => {
    const transport: AudiocppSepTransport = {
      async runSeparation() {
        return { namedStemIds: ["vocals", "instrumental"] };
      },
      async sha256File() {
        return "b".repeat(64);
      },
    };
    const provider = createStemSeparator("bs_roformer", transport);
    const result = await provider.separate({
      inputPath: "/tmp/in.wav",
      inputSha256: "0".repeat(64),
      projectSampleRate: 48000,
      outputDir: "/tmp/sep",
      separatorInputPath: "/tmp/sep/input-44100.wav",
    });
    expect(result.stems.map((s) => s.role)).toEqual(["vocals", "other"]);
    expect(result.unavailableRoles).toContain("guitar");
    expect(result.unavailableRoles).toContain("drums");
  });

  it("BS-RoFormer is not runnable until weights are present", () => {
    expect(isStemProviderRunnable("bs_roformer")).toBe(false);
    expect(
      isStemProviderRunnable("bs_roformer", { bsRoFormerWeightsPresent: true }),
    ).toBe(true);
    const rows = describeStemProvidersFr({ bsRoFormerWeightsPresent: false });
    expect(rows.find((r) => r.id === "bs_roformer")?.runnable).toBe(false);
  });
});
