import type { AdapterValidationReport } from "./types.js";

/**
 * Gate before exposing a trained adapter in the local catalog.
 * Never auto-activates. Fused/ComfyUI-style exports are rejected.
 */
export function validateAdapterForCatalog(input: {
  adapterPath: string;
  layoutHint?: "unfused_safetensors" | "fused" | "comfyui_unknown" | "unknown";
  loadProbeOk?: boolean;
  shortRenderOk?: boolean;
  sha256?: string | null;
}): AdapterValidationReport {
  const base = {
    adapterPath: input.adapterPath,
    sha256: input.sha256 ?? null,
    autoActivate: false as const,
  };

  if (
    input.layoutHint === "fused" ||
    input.layoutHint === "comfyui_unknown"
  ) {
    return {
      ...base,
      status:
        input.layoutHint === "fused"
          ? "rejected_fused"
          : "rejected_incompatible",
      catalogEligible: false,
      messageFr:
        "Export incompatible (fusionné / ComfyUI). " +
        "audio.cpp attend des SafeTensors non fusionnés. " +
        "Conversion + diagnostic requis — non ajouté au catalogue.",
    };
  }

  if (!input.adapterPath.toLowerCase().endsWith(".safetensors")) {
    return {
      ...base,
      status: "rejected_incompatible",
      catalogEligible: false,
      messageFr: "L’adaptateur doit être un fichier .safetensors non fusionné.",
    };
  }

  if (!input.loadProbeOk) {
    return {
      ...base,
      status: "pending",
      catalogEligible: false,
      messageFr:
        "Chargement audio.cpp non vérifié. " +
        "Lancez un essai de session (charger → courte prise → décharger) avant catalogue.",
    };
  }

  if (!input.shortRenderOk) {
    return {
      ...base,
      status: "load_ok",
      catalogEligible: false,
      messageFr:
        "Chargement OK, mais le rendu court A/B n’est pas validé. " +
        "Pas d’activation automatique ; reste hors catalogue utilisable.",
    };
  }

  return {
    ...base,
    status: "catalog_ready",
    catalogEligible: true,
    messageFr:
      "Validation runtime OK (format + charge + rendu court). " +
      "Éligible au catalogue local — activation manuelle uniquement.",
  };
}
