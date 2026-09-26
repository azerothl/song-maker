/**
 * Optional LoRA pack registry (§23 phases 3–4, yue2-ameliorations items 6 & 8).
 * Metadata only — never ships SafeTensors weights in the first-build installer.
 */

export type LoraSlot = "ar" | "nar";

export type LoraLicenseId = "cc-by-nc-4.0";

export type LoraPackKind =
  | "ar_instrumental"
  | "nar_realaudio"
  | "style";

export type LoraFileRef = {
  slot: LoraSlot;
  /** Hugging Face filename only — not downloaded by this package. */
  filename: string;
  /** Optional OID when known; omit until pinned. */
  sha256?: string;
};

export type LoraPack = {
  id: string;
  kind: LoraPackKind;
  displayName: string;
  /** HF repo id, e.g. Mothersuperior/... */
  repo: string;
  license: LoraLicenseId;
  /** Trigger token when the pack documents one (e.g. chnsn). */
  trigger?: string;
  /** Must be unfused SafeTensors loadable via yue2.ar_lora / yue2.nar_lora. */
  layout: "unfused_safetensors";
  files: LoraFileRef[];
  /** Never true for first-build installer contents. */
  includedInFirstBuildInstaller: false;
  notes?: string;
};

export type LicenseGateDecision =
  | { ok: true; pack: LoraPack }
  | {
      ok: false;
      reason:
        | "license_not_accepted"
        | "comfyui_layout"
        | "commercial_use_blocked"
        | "unknown_pack";
      message: string;
    };

export type LicenseAcceptance = {
  /** User explicitly accepted CC BY-NC on the licences screen. */
  ccByNcAccepted: boolean;
  /** Product still blocks commercial redistribution of weights. */
  allowCommercialRedistribution: boolean;
};

/**
 * Session options names expected by audio.cpp YuE2 (v0.8.1+).
 * Values are local paths once the user opts in to download.
 */
export type Yue2LoraSessionOptions = {
  "yue2.ar_lora"?: string;
  "yue2.nar_lora"?: string;
};
