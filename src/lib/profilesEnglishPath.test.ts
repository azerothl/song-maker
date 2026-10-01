import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import {
  buildCommercialProfileCreationConfirm,
  COMMERCIAL_GRAY_REASONS_EN,
  COMMERCIAL_RESERVED_BADGE_EN,
  formatCommercialCreationEngineLineEn,
  formatCommercialReservedBadge,
} from "@song-maker/stem-providers";
import { buildCommercialEngineRowsUi } from "./commercialEnginesUi.ts";
import {
  formatProfileMigrationBannerEn,
  MIGRATION_DEFAULT_PROFILE_NAME,
  pickProfileMigrationBannerProfile,
} from "./profileMigrationBannerCopy.ts";
import type { ProfileSummary } from "./profilesTypes.ts";
import { t } from "../ui/i18n.ts";

const LOCALE_KEY = "song-maker.locale";
const store = new Map<string, string>();

before(() => {
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
});

afterEach(() => {
  store.delete(LOCALE_KEY);
});

describe("profiles English path (#212 R13)", () => {
  it("commercial engine rows use EN gray reasons and EN display names", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    const rows = buildCommercialEngineRowsUi();
    assert.equal(rows.length, 10);
    for (const row of rows.filter((r) => r.availability === "grayed")) {
      assert.equal(row.reasonLabel, COMMERCIAL_GRAY_REASONS_EN[row.grayReason], row.id);
    }
    const sheetsage = rows.find((r) => r.id === "sheetsage2");
    assert.ok(sheetsage);
    assert.equal(sheetsage!.name, "SheetSage2");
    assert.match(sheetsage!.whyLabel, /2026-09-21/);
    assert.doesNotMatch(sheetsage!.whyLabel, /21\/09\/2026/);
    const ace = rows.find((r) => r.id === "ace_step_1_5");
    assert.ok(ace);
    assert.match(ace!.reservationNote ?? "", /declares "other"/);
    assert.equal(ace!.sourceLinks.length, 7);
  });

  it("EN reserved badge and creation confirm line stay English", () => {
    assert.equal(
      formatCommercialReservedBadge("disponible avec réserve", "en"),
      COMMERCIAL_RESERVED_BADGE_EN,
    );
    assert.match(
      formatCommercialCreationEngineLineEn("HTDemucs", "disponible avec réserve"),
      /Available with conditions/,
    );
    assert.doesNotMatch(
      formatCommercialCreationEngineLineEn("HTDemucs", "disponible avec réserve"),
      /Disponible avec réserve/,
    );
    const confirm = buildCommercialProfileCreationConfirm();
    if (confirm) {
      for (const line of confirm.engineLinesEn) {
        assert.doesNotMatch(line, /Disponible avec réserve/);
      }
    }
  });

  it("selector collapsed aria and switch copy resolve in English", () => {
    localStorage.setItem(LOCALE_KEY, "en");
    assert.match(
      t("profiles.selector.collapsedAria", { name: "Studio", kind: "Hobby" }),
      /Active profile: Studio/,
    );
    assert.equal(
      t("profiles.switch.blocked.generation"),
      "Cannot switch profiles during generation. Wait until it finishes or cancel the operation.",
    );
    assert.match(t("profiles.engines.graySection"), /Engines not offered/);
  });

  it("migration banner pick uses exact default name (not includes)", () => {
    const hobby: ProfileSummary = {
      id: "profile-001",
      name: MIGRATION_DEFAULT_PROFILE_NAME,
      kind: "hobby",
      projectCount: 2,
      acceptedContractCount: 0,
      isLastUsed: true,
      isActive: true,
    };
    const decoy: ProfileSummary = {
      id: "profile-002",
      name: "Profil Hobby remix",
      kind: "hobby",
      projectCount: 0,
      acceptedContractCount: 0,
      isLastUsed: false,
      isActive: false,
    };
    assert.equal(
      pickProfileMigrationBannerProfile([decoy, hobby])?.id,
      "profile-001",
    );
    assert.match(formatProfileMigrationBannerEn(2), /Your 2 songs/);
  });
});
