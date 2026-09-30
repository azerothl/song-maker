import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { COMMERCIAL_COPY_FORBIDDEN } from "./commercial-copy-forbidden.js";
import {
  COMMERCIAL_CREATION_DISABLED_REASON_FR,
  COMMERCIAL_GRAY_REASONS_EN,
  COMMERCIAL_GRAY_REASONS_FR,
  COMMERCIAL_PROFILE_DESCRIPTION_EN,
  COMMERCIAL_PROFILE_DESCRIPTION_FR,
} from "./commercial-profile-i18n.js";
import { buildCommercialProfileCreationConfirm } from "./commercial-creation-confirm.js";
import {
  APP_ENGINE_CATALOG,
  buildCommercialEngineList,
  buildHobbyEngineOffers,
  HOBBY_NON_COMMERCIAL_USAGE_FR,
  COMMERCIAL_CREATION_UI_MODE,
  engineContractFingerprint,
  isCommercialProfileAvailable,
  isCommercialReservedStatut,
  listProductionWiredCommercialEngines,
  licenseRowQualifiesForCommercialReserved,
  resolveCommercialCreationState,
  type EngineContractTemplate,
  type EngineLicenseRow201,
  type WiredCommercialEngine,
} from "./engine-licenses-201.js";

const FORBIDDEN = COMMERCIAL_COPY_FORBIDDEN;

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
  it("lists wired engines from catalog but Commercial stays off without reserved statut", () => {
    const wired = listProductionWiredCommercialEngines();
    expect(wired.length).toBeGreaterThan(0);
    expect(wired.some((w) => w.engineId === "yue2_3b")).toBe(true);
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
          statut: "disponible avec réserve",
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

  it("never shows reserved without disponible avec réserve statut", () => {
    const list = buildCommercialEngineList();
    expect(list.every((e) => e.availability === "grayed")).toBe(true);
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "yue2_3b", licenseDataId: "yue2_3b" },
    ];
    const withFixture = buildCommercialEngineList(fixtureWired);
    const yue = withFixture.find((e) => e.engine.id === "yue2_3b");
    expect(yue?.availability).toBe("grayed");
    expect(yue?.grayReason).toBe("non_commercial");
  });

  it("keeps ADTOF grayed when wired with dated non-commercial license", () => {
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "adtof", licenseDataId: "adtof" },
    ];
    const list = buildCommercialEngineList(fixtureWired);
    const adtof = list.find((e) => e.engine.id === "adtof");
    expect(adtof?.availability).toBe("grayed");
    expect(adtof?.grayReason).toBe("non_commercial");
  });

  it("shows reserved only when wired, dated, and statut disponible avec réserve", () => {
    const rows = new Map<string, EngineLicenseRow201>([
      [
        "htdemucs",
        {
          id: "htdemucs",
          nom: "HTDemucs",
          licence_poids: "MIT",
          citation: "",
          source_url: "https://example.test/license",
          licence_code: "",
          donnees_entrainement: "",
          restriction_sorties: "",
          statut: "disponible avec réserve",
          date_verification: "2026-09-30",
          raison_grise_fr: "",
        },
      ],
    ]);
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "htdemucs", licenseDataId: "htdemucs" },
    ];
    const list = buildCommercialEngineList(fixtureWired, rows);
    const h = list.find((e) => e.engine.id === "htdemucs");
    expect(h?.availability).toBe("reserved");
    expect(isCommercialReservedStatut("disponible avec réserve")).toBe(true);
    expect(
      licenseRowQualifiesForCommercialReserved(rows.get("htdemucs")!),
    ).toBe(true);
  });

  it("grays SheetSage2 in commercial with non_commercial reason and dated license row", () => {
    const list = buildCommercialEngineList();
    const s = list.find((e) => e.engine.id === "sheetsage2");
    expect(s?.availability).toBe("grayed");
    expect(s?.grayReason).toBe("non_commercial");
    expect(s?.licenseRow?.date_verification).toBe("2026-09-30");
    expect(s?.licenseRow?.raison_grise_fr).toBe(
      "Usage non commercial : la licence interdit la vente ou la diffusion commerciale.",
    );
    expect(s?.licenseRow?.licence_poids).toMatch(/audio\.cpp/i);
    expect(s?.licenseRow?.licence_poids).toMatch(/n'a pas été relue/i);
    expect(s?.licenseRow?.licence_poids).not.toMatch(/carte Hugging Face d'origine a été/i);
  });

  it("every grayed commercial engine has a gray reason label and a dated license row", () => {
    const list = buildCommercialEngineList();
    for (const entry of list) {
      if (entry.availability !== "grayed") continue;
      const reason = COMMERCIAL_GRAY_REASONS_FR[entry.grayReason];
      expect(reason?.length).toBeGreaterThan(10);
      const dated = entry.licenseRow?.date_verification?.trim();
      expect(dated, `missing date for ${entry.engine.id}`).toBeTruthy();
    }
  });

  it("offers SheetSage2 in Hobby with Usage non commercial notice", () => {
    const row = buildHobbyEngineOffers().find((o) => o.engine.id === "sheetsage2");
    expect(row?.usageNoticeFr).toBe(HOBBY_NON_COMMERCIAL_USAGE_FR);
  });

  it("grays engine without dated source when license row missing date", () => {
    const fixtureWired: WiredCommercialEngine[] = [
      { engineId: "htdemucs", licenseDataId: "__missing__" },
    ];
    const list = buildCommercialEngineList(fixtureWired);
    const s = list.find((e) => e.engine.id === "htdemucs");
    expect(s?.availability).toBe("grayed");
    expect(s?.grayReason).toBe("weights_unverified");
  });

  it("returns no Commercial create confirm dialog in production (no wired dated engines)", () => {
    expect(buildCommercialProfileCreationConfirm()).toBeNull();
  });

  it("builds engine lines from licence rows when wired with reserved statut", () => {
    const rows = new Map<string, EngineLicenseRow201>([
      [
        "htdemucs",
        {
          id: "htdemucs",
          nom: "HTDemucs 4 stems",
          licence_poids: "MIT",
          citation: "",
          source_url: "https://example.test/license",
          licence_code: "",
          donnees_entrainement: "",
          restriction_sorties: "",
          statut: "disponible avec réserve",
          date_verification: "2026-09-30",
          raison_grise_fr: "",
        },
      ],
    ]);
    const wired: WiredCommercialEngine[] = [
      { engineId: "htdemucs", licenseDataId: "htdemucs" },
    ];
    const dialog = buildCommercialProfileCreationConfirm(wired, rows);
    expect(dialog).not.toBeNull();
    expect(dialog!.engineLinesFr[0]).toMatch(/^Moteur proposé aujourd'hui :/);
    expect(dialog!.engineLinesFr[0]).toContain("HTDemucs");
    expect(dialog!.engineLinesFr[0]).toMatch(/disponible avec réserve/i);
    expect(dialog!.engineLinesFr.join(" ")).not.toMatch(/ACE-Step/i);
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
