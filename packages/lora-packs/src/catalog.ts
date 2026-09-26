import type { LoraPack } from "./types.js";

/**
 * Catalog skeleton — metadata only, no weights.
 * Sources: audio.cpp yue2.md + community HF (september 2026).
 */
export const LORA_PACK_CATALOG: readonly LoraPack[] = [
  {
    id: "mothersuperior-instrumental-ar",
    kind: "ar_instrumental",
    displayName: "YuE2 instrumental CoT (AR)",
    repo: "Mothersuperior/YuE2-instrumental-cot-full-loras",
    license: "cc-by-nc-4.0",
    layout: "unfused_safetensors",
    files: [{ slot: "ar", filename: "instrumental_ar.safetensors" }],
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
    files: [{ slot: "nar", filename: "realaudio_nar_v4.safetensors" }],
    includedInFirstBuildInstaller: false,
    notes: "Optional NAR LoRA via yue2.nar_lora. Download opt-in only.",
  },
  {
    id: "becausereasons-chnsn-chanson-francaise",
    kind: "style",
    displayName: "Chanson française (chnsn)",
    repo: "becausereasons/yue2-chnsn-chanson-francaise",
    license: "cc-by-nc-4.0",
    trigger: "chnsn",
    layout: "unfused_safetensors",
    files: [
      { slot: "ar", filename: "chnsn_ar.safetensors" },
      { slot: "nar", filename: "chnsn_nar.safetensors" },
    ],
    includedInFirstBuildInstaller: false,
    notes:
      "Style pack for phase 4 catalog. Only if unfused and loadable via session options.",
  },
  {
    id: "monsterovich-industrial-rock",
    kind: "style",
    displayName: "Industrial rock",
    repo: "monsterovich/yue2-industrial-rock-lora",
    license: "cc-by-nc-4.0",
    layout: "unfused_safetensors",
    files: [
      { slot: "ar", filename: "industrial_rock_ar.safetensors" },
      { slot: "nar", filename: "industrial_rock_nar.safetensors" },
    ],
    includedInFirstBuildInstaller: false,
    notes: "Community style skeleton — verify unfused layout before download UI.",
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
