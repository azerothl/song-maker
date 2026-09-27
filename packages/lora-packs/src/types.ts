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

/**
 * Verified: loadable via audio.cpp yue2.ar_lora / yue2.nar_lora (unfused).
 * Unverified: informative catalog entry — not offered as install/activate.
 * Incompatible: ComfyUI / fused / merged — never treated as compatible.
 */
export type LoraCompatibilityStatus =
  | "verified"
  | "unverified"
  | "incompatible";

/** Unfused only is loadable; ComfyUI / fused layouts are rejected. */
export type LoraLayout =
  | "unfused_safetensors"
  | "comfyui"
  | "fused_merged";

export type LoraFileRef = {
  slot: LoraSlot;
  /** Hugging Face filename only — not downloaded by this package. */
  filename: string;
  /** Optional OID when known; omit until pinned. Host verifies when present. */
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
  layout: LoraLayout;
  /** audio.cpp compatibility — UI badges + install gate. */
  compatibilityStatus: LoraCompatibilityStatus;
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
        | "incompatible_pack"
        | "unverified_pack"
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
  "yue2.ar_lora_scale"?: number;
  "yue2.nar_lora_scale"?: number;
};

/** Settings fields that map 1:1 onto AppSettings camelCase LoRA keys. */
export type Yue2LoraSettingsPatch = {
  yue2ArLora: string | null;
  yue2NarLora: string | null;
  yue2ArLoraScale: number;
  yue2NarLoraScale: number;
};
