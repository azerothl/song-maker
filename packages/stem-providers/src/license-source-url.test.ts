import { describe, expect, it } from "vitest";
import { ENGINE_LICENSE_ROWS_201 } from "./engine-licenses-201.js";
import {
  extractPrimaryLicenseSourceUrl,
  isValidLicenseHref,
} from "./license-source-url.js";

describe("license source URLs (#201)", () => {
  it("extracts a clean https URL without trailing punctuation", () => {
    const url = extractPrimaryLicenseSourceUrl(
      "https://github.com/Anjok07/ultimatevocalremovergui (README.md, branche master) ; https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models",
    );
    expect(url).toBe("https://github.com/Anjok07/ultimatevocalremovergui");
    expect(isValidLicenseHref(url!)).toBe(true);
  });

  it("every licence row primary URL is valid (no parens or punctuation glued)", () => {
    for (const row of ENGINE_LICENSE_ROWS_201) {
      const url = extractPrimaryLicenseSourceUrl(row.source_url);
      expect(url, `no URL for ${row.id}`).toBeTruthy();
      expect(isValidLicenseHref(url!), row.id).toBe(true);
      expect(url).not.toMatch(/[),.;]$/);
      expect(url).not.toMatch(/\(/);
    }
  });
});
