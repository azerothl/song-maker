import { describe, expect, it } from "vitest";
import {
  LORA_PACK_CATALOG,
  activateLoraPackSettings,
  buildYue2LoraSessionOptions,
  compatibilityLabelFr,
  gateLoraPackAccess,
  getLoraPack,
  listInstallableLoraPacks,
  listStyleLoraPacks,
  planOptionalLoraDownload,
  requestOptionalLoraDownload,
  statusForLoraPack,
} from "./index.js";

describe("lora-packs registry", () => {
  it("never marks packs as first-build installer contents", () => {
    expect(LORA_PACK_CATALOG.length).toBeGreaterThanOrEqual(3);
    for (const pack of LORA_PACK_CATALOG) {
      expect(pack.includedInFirstBuildInstaller).toBe(false);
      expect(pack.license).toBe("cc-by-nc-4.0");
      expect(["verified", "unverified", "incompatible"]).toContain(
        pack.compatibilityStatus,
      );
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

  it("marks industrial-rock unverified and excludes it from installable packs", () => {
    const industrial = getLoraPack("monsterovich-industrial-rock");
    expect(industrial?.compatibilityStatus).toBe("unverified");
    expect(compatibilityLabelFr("unverified")).toContain("informatif");
    expect(
      listInstallableLoraPacks().some(
        (p) => p.id === "monsterovich-industrial-rock",
      ),
    ).toBe(false);
    expect(
      listInstallableLoraPacks().every(
        (p) => p.compatibilityStatus === "verified",
      ),
    ).toBe(true);
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
      "mothersuperior-instrumental-ar",
      { ccByNcAccepted: true, allowCommercialRedistribution: false },
    );
    expect(allowed.ok).toBe(true);
  });

  it("blocks unverified and would-be ComfyUI/merged packs", () => {
    const unverified = gateLoraPackAccess("monsterovich-industrial-rock", {
      ccByNcAccepted: true,
      allowCommercialRedistribution: false,
    });
    expect(unverified.ok).toBe(false);
    if (!unverified.ok) {
      expect(unverified.reason).toBe("unverified_pack");
    }

    const planned = planOptionalLoraDownload("monsterovich-industrial-rock", {
      ccByNcAccepted: true,
      allowCommercialRedistribution: false,
    });
    expect(planned.ok).toBe(false);
  });

  it("maps local paths to yue2.ar_lora / yue2.nar_lora session options with scales", () => {
    const pack = { ...getLoraPack("mothersuperior-instrumental-ar")!, files: [
      { slot: "ar" as const, filename: "fixture_ar.safetensors" },
      { slot: "nar" as const, filename: "fixture_nar.safetensors" },
    ] };
    expect(pack).toBeDefined();
    const options = buildYue2LoraSessionOptions(pack!, {
      ar: "/cache/chnsn_ar.safetensors",
      nar: "/cache/chnsn_nar.safetensors",
    });
    expect(options).toEqual({
      "yue2.ar_lora": "/cache/chnsn_ar.safetensors",
      "yue2.ar_lora_scale": 1,
      "yue2.nar_lora": "/cache/chnsn_nar.safetensors",
      "yue2.nar_lora_scale": 1,
    });
    const patch = activateLoraPackSettings(pack!, {
      ar: "/cache/chnsn_ar.safetensors",
      nar: "/cache/chnsn_nar.safetensors",
    });
    expect(patch.yue2ArLora).toBe("/cache/chnsn_ar.safetensors");
    expect(patch.yue2NarLora).toBe("/cache/chnsn_nar.safetensors");
    expect(patch.yue2ArLoraScale).toBe(1);
    expect(patch.yue2NarLoraScale).toBe(1);
  });

  it("plans opt-in HF downloads without shipping weights and forwards sha256", () => {
    const planned = planOptionalLoraDownload("mothersuperior-instrumental-ar", {
      ccByNcAccepted: true,
      allowCommercialRedistribution: false,
    });
    expect(planned.ok).toBe(true);
    if (planned.ok && planned.plan) {
      expect(planned.plan.files[0]?.url).toContain("huggingface.co/");
      expect(planned.plan.files[0]?.relativeCachePath).toContain("models/lora/");
      expect(planned.pack.includedInFirstBuildInstaller).toBe(false);
      expect(planned.plan.noticeFr).toContain("CC BY-NC");
      expect(planned.plan.noticeFr.toLowerCase()).toContain("monétisation");
    }
    const status = statusForLoraPack(
      getLoraPack("mothersuperior-instrumental-ar")!,
      new Set(),
    );
    expect(status.installed).toBe(false);
    expect(status.missingFiles.length).toBeGreaterThan(0);
  });

  it("downloads via injected fetcher after CC BY-NC gate and passes sha when set", async () => {
    const calls: Array<{
      url: string;
      path: string;
      sha?: string;
    }> = [];
    const result = await requestOptionalLoraDownload(
      "mothersuperior-instrumental-ar",
      { ccByNcAccepted: true, allowCommercialRedistribution: false },
      async (url, relativeCachePath, expectedSha256) => {
        calls.push({ url, path: relativeCachePath, sha: expectedSha256 });
        return `/cache/${relativeCachePath}`;
      },
    );
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain("/resolve/947f2f4b28978b2b6c3e316e6a87925c76bf3c4b/ar_lora_inst_v3abc.bf16.safetensors");
    expect(calls[0]?.sha).toBe("e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414");
    expect(result.savedPaths?.[0]).toContain("models/lora/");
  });
});
