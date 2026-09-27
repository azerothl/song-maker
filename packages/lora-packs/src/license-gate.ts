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

export type LoraDownloadPlanFile = {
  slot: "ar" | "nar";
  filename: string;
  /** Hugging Face resolve URL — host must fetch; package never ships weights. */
  url: string;
  /** Suggested relative path under the user cache (models/lora/<packId>/). */
  relativeCachePath: string;
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
    url: `https://huggingface.co/${pack.repo}/resolve/main/${f.filename}`,
    relativeCachePath: `models/lora/${pack.id}/${f.filename}`,
  }));
  return {
    ok: true,
    pack,
    plan: {
      pack,
      files,
      noticeFr:
        "Téléchargement optionnel CC BY-NC 4.0 — hors installeur du premier build. Aucun poids n’est embarqué dans le dépôt.",
    },
  };
}

export type CacheFileFetcher = (
  url: string,
  relativeCachePath: string,
) => Promise<string>;

/**
 * Opt-in download — never called by first-build installer.
 * Without a fetcher, returns the plan only (host downloads).
 * With a fetcher, downloads each file after the CC BY-NC gate.
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
    savedPaths.push(await fetchToCache(file.url, file.relativeCachePath));
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
