import type {
  LicenseAcceptance,
  LicenseGateDecision,
  LoraPack,
  Yue2LoraSessionOptions,
  Yue2LoraSettingsPatch,
} from "./types.js";
import { getLoraPack } from "./catalog.js";

const DEFAULT_LORA_SCALE = 1;

function isComfyOrFusedLayout(layout: LoraPack["layout"]): boolean {
  return layout === "comfyui" || layout === "fused_merged";
}

/**
 * CC BY-NC gate before any optional LoRA download or session wiring.
 * First-build installer never includes these packs.
 * Rejects ComfyUI / fused / incompatible; blocks unverified for install.
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

  if (
    pack.compatibilityStatus === "incompatible" ||
    isComfyOrFusedLayout(pack.layout) ||
    pack.layout !== "unfused_safetensors"
  ) {
    const reason =
      pack.compatibilityStatus === "incompatible"
        ? "incompatible_pack"
        : "comfyui_layout";
    return {
      ok: false,
      reason,
      message:
        "Layouts ComfyUI / fused / fusionnés refusés. audio.cpp exige des SafeTensors unfused (yue2.ar_lora / yue2.nar_lora). La génération standard (sans LoRA) reste disponible.",
    };
  }

  if (pack.compatibilityStatus === "unverified") {
    return {
      ok: false,
      reason: "unverified_pack",
      message:
        "Pack informatif / non vérifié pour audio.cpp — pas de téléchargement ni d’activation. La génération standard (sans LoRA) reste disponible.",
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
 * Builds session option paths (and scales) only after the gate passes.
 * Does not download files.
 */
export function buildYue2LoraSessionOptions(
  pack: LoraPack,
  localPaths: Partial<Record<"ar" | "nar", string>>,
  scales?: Partial<Record<"ar" | "nar", number>>,
): Yue2LoraSessionOptions {
  const options: Yue2LoraSessionOptions = {};
  for (const file of pack.files) {
    const path = localPaths[file.slot];
    if (!path) {
      continue;
    }
    const scale = scales?.[file.slot] ?? DEFAULT_LORA_SCALE;
    if (file.slot === "ar") {
      options["yue2.ar_lora"] = path;
      options["yue2.ar_lora_scale"] = scale;
    } else if (file.slot === "nar") {
      options["yue2.nar_lora"] = path;
      options["yue2.nar_lora_scale"] = scale;
    } else {
      const _exhaustive: never = file.slot;
      void _exhaustive;
    }
  }
  return options;
}

/** Map session options onto AppSettings LoRA fields (null clears a slot). */
export function settingsPatchFromYue2LoraSessionOptions(
  options: Yue2LoraSessionOptions,
  previous?: Partial<Yue2LoraSettingsPatch>,
): Yue2LoraSettingsPatch {
  return {
    yue2ArLora: options["yue2.ar_lora"] ?? previous?.yue2ArLora ?? null,
    yue2NarLora: options["yue2.nar_lora"] ?? previous?.yue2NarLora ?? null,
    yue2ArLoraScale:
      options["yue2.ar_lora_scale"] ??
      previous?.yue2ArLoraScale ??
      DEFAULT_LORA_SCALE,
    yue2NarLoraScale:
      options["yue2.nar_lora_scale"] ??
      previous?.yue2NarLoraScale ??
      DEFAULT_LORA_SCALE,
  };
}

/**
 * After opt-in download, build the settings patch that activates the pack
 * for the next generation (paths + default scales).
 */
export function activateLoraPackSettings(
  pack: LoraPack,
  localPaths: Partial<Record<"ar" | "nar", string>>,
  scales?: Partial<Record<"ar" | "nar", number>>,
): Yue2LoraSettingsPatch {
  const options = buildYue2LoraSessionOptions(pack, localPaths, scales);
  return {
    yue2ArLora: options["yue2.ar_lora"] ?? null,
    yue2NarLora: options["yue2.nar_lora"] ?? null,
    yue2ArLoraScale: options["yue2.ar_lora_scale"] ?? DEFAULT_LORA_SCALE,
    yue2NarLoraScale: options["yue2.nar_lora_scale"] ?? DEFAULT_LORA_SCALE,
  };
}

export type LoraDownloadPlanFile = {
  slot: "ar" | "nar";
  filename: string;
  /** Hugging Face resolve URL — host must fetch; package never ships weights. */
  url: string;
  /** Suggested relative path under the user cache (models/lora/<packId>/). */
  relativeCachePath: string;
  /** Catalog sha256 when pinned — host verifies after download. */
  sha256?: string;
};

export type LoraDownloadPlan = {
  pack: LoraPack;
  files: LoraDownloadPlanFile[];
  /** French notice for the UI. */
  noticeFr: string;
};

/**
 * Builds an opt-in download plan (URLs + cache paths). Does not fetch.
 */
export function planOptionalLoraDownload(
  packId: string,
  acceptance: LicenseAcceptance,
): LicenseGateDecision & { plan?: LoraDownloadPlan } {
  const decision = gateLoraPackAccess(packId, acceptance);
  if (!decision.ok) {
    return decision;
  }
  const pack = decision.pack;
  const files: LoraDownloadPlanFile[] = pack.files.map((f) => ({
    slot: f.slot,
    filename: f.filename,
    url: `https://huggingface.co/${pack.repo}/resolve/${pack.revision ?? "main"}/${f.filename}`,
    relativeCachePath: `models/lora/${pack.id}/${f.filename}`,
    ...(f.sha256 ? { sha256: f.sha256 } : {}),
  }));
  return {
    ok: true,
    pack,
    plan: {
      pack,
      files,
      noticeFr:
        "Téléchargement optionnel CC BY-NC 4.0 — hors installeur du premier build. Aucune monétisation ni redistribution commerciale. Aucun poids n’est embarqué dans le dépôt.",
    },
  };
}

export type CacheFileFetcher = (
  url: string,
  relativeCachePath: string,
  expectedSha256?: string,
) => Promise<string>;

/**
 * Opt-in download — never called by first-build installer.
 * Without a fetcher, returns the plan only (host downloads).
 * With a fetcher, downloads each file after the CC BY-NC gate.
 * Passes catalog sha256 when present so the host can verify.
 */
export async function requestOptionalLoraDownload(
  packId: string,
  acceptance: LicenseAcceptance,
  fetchToCache?: CacheFileFetcher,
): Promise<
  LicenseGateDecision & { plan?: LoraDownloadPlan; savedPaths?: string[] }
> {
  const planned = planOptionalLoraDownload(packId, acceptance);
  if (!planned.ok || !planned.plan || !fetchToCache) {
    return planned;
  }
  const savedPaths: string[] = [];
  for (const file of planned.plan.files) {
    savedPaths.push(
      await fetchToCache(file.url, file.relativeCachePath, file.sha256),
    );
  }
  return { ...planned, savedPaths };
}

export type LoraPackLocalStatus = {
  packId: string;
  /** True when all listed files exist under the cache root. */
  installed: boolean;
  missingFiles: string[];
};

/**
 * Pure status check given a set of relative paths known to exist on disk.
 */
export function statusForLoraPack(
  pack: LoraPack,
  existingRelativePaths: ReadonlySet<string>,
): LoraPackLocalStatus {
  const missing: string[] = [];
  for (const f of pack.files) {
    const rel = `models/lora/${pack.id}/${f.filename}`;
    if (!existingRelativePaths.has(rel)) {
      missing.push(f.filename);
    }
  }
  return {
    packId: pack.id,
    installed: missing.length === 0,
    missingFiles: missing,
  };
}

/** French badge label for catalog UI. */
export function compatibilityLabelFr(
  status: LoraPack["compatibilityStatus"],
): string {
  switch (status) {
    case "verified":
      return "vérifié audio.cpp";
    case "unverified":
      return "informatif / non vérifié";
    case "incompatible":
      return "incompatible (ComfyUI / fusionné)";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
