import { describe, expect, it } from "vitest";
import {
  LORA_PACK_CATALOG,
  buildYue2LoraSessionOptions,
  gateLoraPackAccess,
  getLoraPack,
  listStyleLoraPacks,
  requestOptionalLoraDownload,
} from "./index.js";

describe("lora-packs registry", () => {
  it("never marks packs as first-build installer contents", () => {
    expect(LORA_PACK_CATALOG.length).toBeGreaterThanOrEqual(3);
    for (const pack of LORA_PACK_CATALOG) {
      expect(pack.includedInFirstBuildInstaller).toBe(false);
      expect(pack.license).toBe("cc-by-nc-4.0");
      expect(pack.layout).toBe("unfused_safetensors");
    }
  });

  it("lists style catalog skeleton separately from AR/NAR production packs", () => {
    const styles = listStyleLoraPacks();
    expect(styles.every((p) => p.kind === "style")).toBe(true);
    expect(getLoraPack("mothersuperior-instrumental-ar")?.kind).toBe(
      "ar_instrumental",
    );
    expect(getLoraPack("mothersuperior-realaudio-nar-v4")?.kind).toBe(
      "nar_realaudio",
    );
  });

  it("blocks download without CC BY-NC acceptance", async () => {
    const denied = gateLoraPackAccess("mothersuperior-instrumental-ar", {
      ccByNcAccepted: false,
      allowCommercialRedistribution: false,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.reason).toBe("license_not_accepted");
    }

    const commercial = gateLoraPackAccess("mothersuperior-instrumental-ar", {
      ccByNcAccepted: true,
      allowCommercialRedistribution: true,
    });
    expect(commercial.ok).toBe(false);
    if (!commercial.ok) {
      expect(commercial.reason).toBe("commercial_use_blocked");
    }

    const allowed = await requestOptionalLoraDownload(
      "becausereasons-chnsn-chanson-francaise",
      { ccByNcAccepted: true, allowCommercialRedistribution: false },
    );
    expect(allowed.ok).toBe(true);
  });

  it("maps local paths to yue2.ar_lora / yue2.nar_lora session options", () => {
    const pack = getLoraPack("becausereasons-chnsn-chanson-francaise");
    expect(pack).toBeDefined();
    const options = buildYue2LoraSessionOptions(pack!, {
      ar: "/cache/chnsn_ar.safetensors",
      nar: "/cache/chnsn_nar.safetensors",
    });
    expect(options).toEqual({
      "yue2.ar_lora": "/cache/chnsn_ar.safetensors",
      "yue2.nar_lora": "/cache/chnsn_nar.safetensors",
    });
  });
});
