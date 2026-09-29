import { describe, expect, it } from "vitest";
import {
  assertVerifiedLicenseShape,
  licenseStatusIcon,
  separatorLicense,
} from "./licenses.js";

describe("separator license metadata (#167)", () => {
  it("marque Kim Vocal 2 et BS-RoFormer comme non vérifiés", () => {
    expect(separatorLicense("mel_band_roformer")?.status).toBe("unverified");
    expect(separatorLicense("bs_roformer")?.status).toBe("unverified");
    expect(separatorLicense("mel_band_roformer")?.sourceLabelFr).toMatch(
      /model_licenses/,
    );
  });

  it("cite la maintainer quote pour HTDemucs", () => {
    const info = separatorLicense("htdemucs");
    expect(info?.noticeFr).toMatch(/only for scientific purposes/i);
    expect(info?.sourceUrl).toMatch(/demucs\/issues\/327/);
  });

  it("exige source primaire + date pour le statut vérifié", () => {
    expect(() =>
      assertVerifiedLicenseShape({
        id: "htdemucs",
        status: "verified",
        badgeFr: "Vérifié",
        noticeFr: "x",
        sourceUrl: "https://example.com",
        sourceLabelFr: "x",
        offered: true,
        requiresAcceptBeforeDownload: false,
      }),
    ).toThrow(/source primaire/i);
  });

  it("expose une icône textuelle par statut", () => {
    expect(licenseStatusIcon("unverified")).toBe("⚠");
    expect(licenseStatusIcon("non_commercial")).toBe("ⓘ");
  });
});
