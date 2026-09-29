import { describe, expect, it } from "vitest";
import {
  BS_ROFORMER_CAPABILITIES,
  BS_ROFORMER_PACKAGE,
  EXCLUDED_SEPARATOR_NOTES_FR,
  HTDEMUCS_MAINTAINER_QUOTE_EN,
  HTDEMUCS_PACKAGE,
  LICENSE_STATUS_ICON,
  LICENSE_STATUS_LABEL_FR,
  MEL_BAND_ROFORMER_PACKAGE,
  STEM_DISPLAY_NAMES,
  buildQualityTimeOptions,
  canDownloadSeparator,
  createStemSeparator,
  describeStemProvidersFr,
  isCoreStemRole,
  isStemProviderRunnable,
  listStemProviderIds,
  mapBsRoFormerStemIds,
  mapHtDemucsStemIds,
  mapHtDemucs6sStemIds,
  recommendSeparator,
  separatorLicense,
  timeLabelFr,
  reliabilityForRole,
  type AudiocppSepTransport,
} from "./index.js";

describe("stem-providers", () => {
  it("lists the supported providers without colliding ids", () => {
    expect(listStemProviderIds()).toEqual([
      "htdemucs",
      "htdemucs_6s",
      "bs_roformer",
      "mel_band_roformer",
    ]);
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

  it("marks extra stems as experimental or unavailable; other stays Accompagnement", () => {
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
    const providers = describeStemProvidersFr({ htdemucs6sRuntimeAvailable: true });
    expect(providers.find((provider) => provider.id === "htdemucs_6s")?.runnable).toBe(true);
    expect(providers.find((provider) => provider.id === "htdemucs_6s")?.unavailableRoles).toEqual([]);
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

  it("maps the six HTDemucs outputs and marks guitar/piano as less reliable", () => {
    expect(mapHtDemucs6sStemIds([
      "drums", "bass", "other", "vocals", "guitar", "piano",
    ])).toEqual(["vocals", "drums", "bass", "other", "guitar", "piano"]);
    expect(reliabilityForRole("guitar")).toBe("less_reliable");
    expect(reliabilityForRole("piano")).toBe("less_reliable");
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

  it("pins Mel-Band RoFormer package and recommends it for vocals", () => {
    expect(MEL_BAND_ROFORMER_PACKAGE.gguf).toBe("mel-band-roformer-q8_0.gguf");
    expect(MEL_BAND_ROFORMER_PACKAGE.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(recommendSeparator("vocals")).toBe("mel_band_roformer");
    expect(recommendSeparator("mix")).toBe("htdemucs");
    expect(recommendSeparator("drums")).toBe("htdemucs");
    expect(
      isStemProviderRunnable("mel_band_roformer", {
        bsRoFormerWeightsPresent: false,
        melBandRoFormerWeightsPresent: true,
      }),
    ).toBe(true);
  });

  it("shows a time for every quality option (#166)", () => {
    const options = buildQualityTimeOptions({
      focus: "vocals",
      audioDurationSec: 180,
    });
    expect(options.length).toBeGreaterThanOrEqual(2);
    for (const opt of options) {
      expect(opt.estimatedMs).toBeGreaterThan(0);
      expect(timeLabelFr(opt.kind)).toMatch(/estimation|mesuré/);
    }
    expect(options.find((o) => o.id === "mel_band_roformer")?.recommended).toBe(
      true,
    );
    const measured = buildQualityTimeOptions({
      focus: "mix",
      audioDurationSec: 60,
      measured: { htdemucs: { msPerAudioSec: 200, samples: 2 } },
    });
    expect(measured.find((o) => o.id === "htdemucs")?.kind).toBe("mesure");
  });

  it("blocks download until license accepted (#167)", () => {
    expect(canDownloadSeparator("bs_roformer", {})).toBe(false);
    expect(canDownloadSeparator("bs_roformer", { bs_roformer: true })).toBe(
      true,
    );
    expect(canDownloadSeparator("htdemucs", {})).toBe(false);
    expect(canDownloadSeparator("htdemucs", { htdemucs: true })).toBe(true);
    expect(canDownloadSeparator("mel_band_roformer", {})).toBe(false);
  });

  it("types license status with icons, read dates, and cold-review labels (#167)", () => {
    const mel = separatorLicense("mel_band_roformer");
    expect(mel?.status).toBe("unverified");
    expect(mel?.badgeFr).toMatch(/source primaire/i);
    expect(LICENSE_STATUS_LABEL_FR[mel!.status]).toBe("non vérifié");
    expect(mel?.commercialOk).toBeUndefined();
    expect(mel?.sourceUrl).not.toMatch(/mlx-community/);
    expect(mel?.noticeFr).toMatch(/non vérifié/i);
    expect(mel?.readDate).toBe("2026-09-29");

    const bs = separatorLicense("bs_roformer");
    expect(bs?.status).toBe("unverified");
    expect(bs?.badgeFr).toMatch(/checkpoint/i);
    expect(bs?.noticeFr).toMatch(/non vérifié/i);

    const ht = separatorLicense("htdemucs");
    expect(ht?.status).toBe("unverified");
    expect(ht?.badgeFr).toMatch(/scientific purposes/i);
    expect(ht?.noticeFr).toMatch(/only for scientific purposes/);
    expect(ht?.noticeFr).toMatch(/Demucs #327/);
    expect(ht?.noticeFr).toMatch(/2026-09-29|23 mai 2022/);
    expect(ht?.sourceUrl).toContain("demucs/issues/327");
    expect(ht?.readDate).toBe("2026-09-29");

    expect(EXCLUDED_SEPARATOR_NOTES_FR.some((n) => /jarredou/i.test(n))).toBe(
      true,
    );
    expect(EXCLUDED_SEPARATOR_NOTES_FR.some((n) => /CC BY-NC/i.test(n))).toBe(
      true,
    );
    expect(LICENSE_STATUS_ICON.unverified).toBeTruthy();
    expect(LICENSE_STATUS_LABEL_FR.unverified).toBe("non vérifié");
    expect(LICENSE_STATUS_LABEL_FR.non_commercial).toBe(
      "usage non commercial",
    );
    expect(HTDEMUCS_MAINTAINER_QUOTE_EN).toBe("only for scientific purposes");
  });
});
