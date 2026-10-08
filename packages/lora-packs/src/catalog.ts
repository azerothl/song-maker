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
    displayName: "Rendu des voix (indisponible)",
    repo: "Mothersuperior/yue2-mothersuperior-realaudio-tokenizer-v4",
    license: "cc-by-nc-4.0",
    layout: "upstream_state_dict",
    compatibilityStatus: "unverified",
    // Upstream publishes .pt state dicts and also needs a separate tokenizer
    // head. Neither can be represented as the pinned runtime's lone NAR slot.
    files: [],
    includedInFirstBuildInstaller: false,
    notes: "Upstream assets are nar_lora_joint_v4.pt and tokenizer_head_joint_v4.pt (separate .pt files). The pinned runtime loader and complete NAR + tokenizer contract have not been validated; no download or activation is offered.",
  },
  {
    id: "becausereasons-chnsn-chanson-francaise",
    kind: "style",
    displayName: "Chanson française (chnsn)",
    repo: "becausereasons/yue2-chnsn-chanson-francaise",
    license: "cc-by-nc-4.0",
    trigger: "chnsn",
    layout: "combined_planner_decoder",
    compatibilityStatus: "unverified",
    // Each upstream checkpoint includes both the AR planner and decoder;
    // the current API takes these in separate AR/NAR slots.
    files: [],
    includedInFirstBuildInstaller: false,
    notes:
      "Upstream publishes chnsn_montmartre.safetensors, chnsn_cabaret.safetensors, chnsn_rive_gauche.safetensors and chnsn_grand_boulevard.safetensors. Each patches planner and decoder together, unlike separate runtime AR/NAR inputs; no download or activation is offered.",
  },
  {
    id: "monsterovich-industrial-rock",
    kind: "style",
    displayName: "Industrial rock",
    repo: "monsterovich/yue2-industrial-rock-lora",
    license: "cc-by-nc-4.0",
    layout: "unknown",
    compatibilityStatus: "unverified",
    files: [],
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
