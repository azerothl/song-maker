import type {
  LicenseAcceptance,
  LicenseGateDecision,
  LoraPack,
  Yue2LoraSessionOptions,
} from "./types.js";
import { getLoraPack } from "./catalog.js";

/**
 * CC BY-NC gate before any optional LoRA download or session wiring.
 * First-build installer never includes these packs.
 */
export function gateLoraPackAccess(
  packId: string,
  acceptance: LicenseAcceptance,
): LicenseGateDecision {
  const pack = getLoraPack(packId);
  if (!pack) {
    return {
      ok: false,
      reason: "unknown_pack",
      message: `Pack LoRA inconnu : ${packId}`,
    };
  }

  if (pack.layout !== "unfused_safetensors") {
    return {
      ok: false,
      reason: "comfyui_layout",
      message:
        "Layouts ComfyUI / fused refusés. audio.cpp exige des SafeTensors unfused (yue2.ar_lora / yue2.nar_lora).",
    };
  }

  if (acceptance.allowCommercialRedistribution) {
    return {
      ok: false,
      reason: "commercial_use_blocked",
      message:
        "Les poids LoRA CC BY-NC 4.0 ne peuvent pas être redistribués commercialement. Pas de badge monétisation.",
    };
  }

  if (!acceptance.ccByNcAccepted) {
    return {
      ok: false,
      reason: "license_not_accepted",
      message:
        "Accepter CC BY-NC 4.0 sur l’écran Licences avant tout téléchargement optionnel de LoRA.",
    };
  }

  if (pack.includedInFirstBuildInstaller !== false) {
    return {
      ok: false,
      reason: "commercial_use_blocked",
      message: "Un pack LoRA ne doit jamais être marqué inclus dans l’installeur du premier build.",
    };
  }

  return { ok: true, pack };
}

/**
 * Builds session option paths only after the gate passes.
 * Does not download files.
 */
export function buildYue2LoraSessionOptions(
  pack: LoraPack,
  localPaths: Partial<Record<"ar" | "nar", string>>,
): Yue2LoraSessionOptions {
  const options: Yue2LoraSessionOptions = {};
  for (const file of pack.files) {
    const path = localPaths[file.slot];
    if (!path) {
      continue;
    }
    if (file.slot === "ar") {
      options["yue2.ar_lora"] = path;
    } else if (file.slot === "nar") {
      options["yue2.nar_lora"] = path;
    } else {
      const _exhaustive: never = file.slot;
      void _exhaustive;
    }
  }
  return options;
}

/**
 * Placeholder download entry — opt-in only. Never called by first-build installer.
 */
export async function requestOptionalLoraDownload(
  packId: string,
  acceptance: LicenseAcceptance,
): Promise<LicenseGateDecision> {
  const decision = gateLoraPackAccess(packId, acceptance);
  if (!decision.ok) {
    return decision;
  }
  // Intentionally no network / no weights. Phase 3–4 wires HF download behind this gate.
  return decision;
}
