import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_CREATION_DISABLED_REASON_FR,
  COMMERCIAL_GRAY_REASONS_EN,
  COMMERCIAL_GRAY_REASONS_FR,
  COMMERCIAL_PROFILE_DESCRIPTION_EN,
  COMMERCIAL_PROFILE_DESCRIPTION_FR,
} from "./commercial-profile-i18n.js";
import {
  APP_ENGINE_CATALOG,
  buildCommercialEngineList,
  COMMERCIAL_CREATION_UI_MODE,
  engineContractFingerprint,
  isCommercialProfileAvailable,
  listProductionWiredCommercialEngines,
  resolveCommercialCreationState,
  type EngineContractTemplate,
  type EngineLicenseRow201,
  type WiredCommercialEngine,
} from "./engine-licenses-201.js";

const FORBIDDEN = /\b(sûr|surs|garanti|garantie|garanties|libre de droits)\b/i;

function commercialCopyFrEn(): string[] {
  return [
    COMMERCIAL_PROFILE_DESCRIPTION_FR,
    COMMERCIAL_PROFILE_DESCRIPTION_EN,
    COMMERCIAL_CREATION_DISABLED_REASON_FR,
    ...Object.values(COMMERCIAL_GRAY_REASONS_FR),
    ...Object.values(COMMERCIAL_GRAY_REASONS_EN),
  ];
}

describe("commercial profile availability (#201)", () => {
  it("has no wired commercial engines in production", () => {
    expect(listProductionWiredCommercialEngines()).toEqual([]);
    expect(isCommercialProfileAvailable()).toBe(false);
  });

  it("presentation fallback defaults to visible (not hidden)", () => {
    expect(COMMERCIAL_CREATION_UI_MODE).toBe("disabled");
  });

  it("shows unavailable reason in production until a wired engine has a dated license row", () => {
    const state = resolveCommercialCreationState();
    expect(state.activatable).toBe(false);
    expect(state.showUnavailableReason).toBe(true);
  });

  it("enables Commercial when a test-only wired engine has a dated fixture row", () => {
    const rows = new Map<string, EngineLicenseRow201>([
      [
        "__fixture_commercial_wired__",
        {
          id: "__fixture_commercial_wired__",
          nom: "Fixture",
          licence_poids: "MIT",
          citation: "",
          source_url: "https://example.test/license",
          licence_code: "",
          donnees_entrainement: "",
          restriction_sorties: "",
          statut: "test",
          date_verification: "2026-09-30",
          raison_grise_fr: "",
        },
      ],
    ]);
    const wired: WiredCommercialEngine[] = [
      {
        engineId: "htdemucs",
        licenseDataId: "__fixture_commercial_wired__",
      },
    ];
    const state = resolveCommercialCreationState(wired, rows);
    expect(state.activatable).toBe(true);
    expect(state.showUnavailableReason).toBe(false);
  });

  it("keeps unavailable reason when engine is wired but license row has no date", () => {
    const rows = new Map<string, EngineLicenseRow201>([
      [
        "__fixture_undated__",
        {
          id: "__fixture_undated__",
          nom: "Fixture",
          licence_poids: "MIT",
          citation: "",
          source_url: "https://example.test/license",
          licence_code: "",
          donnees_entrainement: "",
          restriction_sorties: "",
          statut: "test",
          date_verification: "",
          raison_grise_fr: "",
        },
      ],
    ]);
    const wired: WiredCommercialEngine[] = [
      { engineId: "htdemucs", licenseDataId: "__fixture_undated__" },
    ];
    const state = resolveCommercialCreationState(wired, rows);
    expect(state.activatable).toBe(false);
    expect(state.showUnavailableReason).toBe(true);
  });

  it("keeps unavailable reason when license row is dated but engine is not wired", () => {
    const state = resolveCommercialCreationState([]);
    expect(state.activatable).toBe(false);
    expect(state.showUnavailableReason).toBe(true);
  });

  it("never shows reserved without wired engine and dated license row", () => {
    const list = buildCommercialEngineList();
    expect(list.every((e) => e.availability === "grayed")).toBe(true);
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "yue2_3b", licenseDataId: "yue2_3b" },
    ];
    const withFixture = buildCommercialEngineList(fixtureWired);
    const yue = withFixture.find((e) => e.engine.id === "yue2_3b");
    expect(yue?.availability).toBe("reserved");
  });

  it("shows reserved only when wired and license row is dated (test fixture)", () => {
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "htdemucs", licenseDataId: "htdemucs" },
    ];
    const list = buildCommercialEngineList(fixtureWired);
    const h = list.find((e) => e.engine.id === "htdemucs");
    expect(h?.availability).toBe("reserved");
  });

  it("grays engine without dated source when license row missing date", () => {
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "sheetsage2", licenseDataId: "__missing__" },
    ];
    const list = buildCommercialEngineList(fixtureWired);
    const s = list.find((e) => e.engine.id === "sheetsage2");
    expect(s?.availability).toBe("grayed");
    expect(s?.grayReason).toBe("weights_unverified");
  });

  it("catalog excludes ACE-Step", () => {
    const ids = APP_ENGINE_CATALOG.map((e) => e.id);
    expect(ids.some((id) => id.toLowerCase().includes("ace"))).toBe(false);
  });

  it("forbidden words absent from commercial profile copy (fr/en)", () => {
    for (const text of commercialCopyFrEn()) {
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it("contract fingerprint changes when text version changes", async () => {
    const base: EngineContractTemplate = {
      engineId: "__test_engine__",
      titleFr: "Titre",
      titleEn: "Title",
      bodyFr: "Corps",
      bodyEn: "Body",
      quoteEn: "Quote",
      checkboxFr: "Case",
      checkboxEn: "Check",
      version: "1",
    };
    const a = await engineContractFingerprint(base);
    const b = await engineContractFingerprint({ ...base, version: "2" });
    expect(a).not.toBe(b);
    expect(a).toBe(
      createHash("sha256")
        .update(
          [
            base.version,
            base.titleFr,
            base.titleEn,
            base.bodyFr,
            base.bodyEn,
            base.quoteEn,
            base.checkboxFr,
            base.checkboxEn,
          ].join("\n"),
          "utf8",
        )
        .digest("hex"),
    );
  });
});
