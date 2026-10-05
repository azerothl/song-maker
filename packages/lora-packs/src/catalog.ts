import type { LoraPack } from "./types.js";

/**
 * Catalog skeleton — metadata only, no weights.
 * Sources: audio.cpp yue2.md + community HF (september 2026).
 *
 * compatibilityStatus:
 * - verified — unfused SafeTensors intended for yue2.ar_lora / yue2.nar_lora
 * - unverified — informative only until layout/hashes proven on pinned audio.cpp
 * - incompatible — ComfyUI / fused / merged (never install/activate)
 */
export const LORA_PACK_CATALOG: readonly LoraPack[] = [
  {
    id: "mothersuperior-instrumental-ar",
    kind: "ar_instrumental",
    displayName: "YuE2 instrumental CoT (AR)",
    repo: "Mothersuperior/YuE2-instrumental-cot-full-loras",
    revision: "947f2f4b28978b2b6c3e316e6a87925c76bf3c4b",
    license: "cc-by-nc-4.0",
    layout: "unfused_safetensors",
    compatibilityStatus: "verified",
    files: [{ slot: "ar", filename: "ar_lora_inst_v3abc.bf16.safetensors", sha256: "e408fd3148b75b1165f7ddbf63db575d83bb6402a0b5f876fcb767dbcb2c5414" }],
    includedInFirstBuildInstaller: false,
    notes:
      "Optional AR LoRA via yue2.ar_lora. Not the [Instrumental] lyrics tag. Download opt-in only.",
  },
  {
    id: "mothersuperior-realaudio-nar-v4",
    kind: "nar_realaudio",
    displayName: "YuE2 realaudio tokenizer v4 (NAR)",
    repo: "Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4",
    license: "cc-by-nc-4.0",
    layout: "unfused_safetensors",
    compatibilityStatus: "unverified",
    files: [{ slot: "nar", filename: "nar_lora_joint_v4.bf16.safetensors" }],
    includedInFirstBuildInstaller: false,
    notes: "NAR adapter and tokenizer head are separate upstream files. Complete pinned-runtime loading contract not verified; installation unavailable.",
  },
  {
    id: "becausereasons-chnsn-chanson-francaise",
    kind: "style",
    displayName: "Chanson française (chnsn)",
    repo: "becausereasons/yue2-chnsn-chanson-francaise",
    license: "cc-by-nc-4.0",
    trigger: "chnsn",
    layout: "unfused_safetensors",
    compatibilityStatus: "unverified",
    files: [
      { slot: "ar", filename: "chnsn_cabaret.safetensors" },
    ],
    includedInFirstBuildInstaller: false,
    notes:
      "Upstream offers chanson variants rather than the AR/NAR files previously listed. Layout not verified; installation unavailable.",
  },
  {
    id: "monsterovich-industrial-rock",
    kind: "style",
    displayName: "Industrial rock",
    repo: "monsterovich/yue2-industrial-rock-lora",
    license: "cc-by-nc-4.0",
    layout: "unfused_safetensors",
    compatibilityStatus: "unverified",
    files: [
      { slot: "ar", filename: "industrial_rock_ar.safetensors" },
      { slot: "nar", filename: "industrial_rock_nar.safetensors" },
    ],
    includedInFirstBuildInstaller: false,
    notes:
      "Community style — informative only until unfused layout and hashes are verified for audio.cpp. Not offered for download/activate.",
  },
] as const;

export function getLoraPack(id: string): LoraPack | undefined {
  return LORA_PACK_CATALOG.find((p) => p.id === id);
}

export function listLoraPacksByKind(
  kind: LoraPack["kind"],
): LoraPack[] {
  return LORA_PACK_CATALOG.filter((p) => p.kind === kind);
}

export function listStyleLoraPacks(): LoraPack[] {
  return listLoraPacksByKind("style");
}

/** Packs the UI may install/activate (verified + unfused only). */
export function listInstallableLoraPacks(): LoraPack[] {
  return LORA_PACK_CATALOG.filter(
    (p) =>
      p.compatibilityStatus === "verified" &&
      p.layout === "unfused_safetensors",
  );
}
