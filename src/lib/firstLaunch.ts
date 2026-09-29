import type {
  AccelerationKind,
  HealthSnapshot,
  InstallErrorCause,
  InstallErrorInfo,
  InstallFilePlan,
  InstallPlan,
  InstallProgress,
  SetupGpuInfo,
} from "./types";

export const MIX_ONLY_STORAGE_KEY = "song-maker.first-launch.mix-only";
export const NVIDIA_DRIVERS_URL = "https://www.nvidia.com/Download/index.aspx";
export const YUE2_LICENSE_URL = "https://creativecommons.org/licenses/by-nc/4.0/";

/** Pics publiés YuE2 (spec §2.2), pas une mesure live. */
export const YUE2_Q4_PEAK_MIB = 7755;
export const YUE2_Q8_PEAK_MIB = 8867;

export type ModelPack = "q4" | "q8";
export type FirstLaunchView = "loading" | "gpu" | "noGpu" | "download" | "interrupted";

export type FileRowStatus = "complete" | "partial" | "missing" | "active" | "waiting" | "error";

export type FileRow = {
  name: string;
  title: string;
  hint: string;
  status: FileRowStatus;
  receivedBytes: number;
  totalBytes: number | null;
  percent: number;
  bytesPerSec: number | null;
};

export type DownloadBuckets = {
  engineBytes: number;
  modelBytes: number;
  totalBytes: number;
};

export type InstallErrorCopy = {
  title: string;
  body: string;
  steps: string[];
};

export function isMixOnlySkipped(): boolean {
  try {
    return globalThis.localStorage?.getItem(MIX_ONLY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function persistMixOnlySkip(): void {
  try {
    globalThis.localStorage?.setItem(MIX_ONLY_STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function setupComplete(health: HealthSnapshot | null): boolean {
  return Boolean(health?.modelsOk && health?.binaryOk);
}

export function parsePack(value: string | undefined | null): ModelPack {
  return value === "q8" ? "q8" : "q4";
}

export function formatBytesFr(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value >= 1024 ** 3) {
    const go = value / 1024 ** 3;
    const digits = go >= 10 ? 0 : 1;
    return `${go.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits })} Go`;
  }
  if (value >= 1024 ** 2) {
    return `${Math.round(value / 1024 ** 2).toLocaleString("fr-FR")} Mo`;
  }
  if (value >= 1024) {
    return `${Math.round(value / 1024).toLocaleString("fr-FR")} Ko`;
  }
  return `${Math.round(value)} o`;
}

export function formatVramGo(vramMib: number | null | undefined): string | null {
  if (vramMib == null || vramMib <= 0) return null;
  const go = vramMib / 1024;
  const digits = Number.isInteger(go) ? 0 : 1;
  return `${go.toLocaleString("fr-FR", { maximumFractionDigits: digits })} Go`;
}

export function formatRateFr(bytesPerSec: number | null | undefined): string | null {
  if (bytesPerSec == null || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return null;
  return `${formatBytesFr(bytesPerSec)}/s`;
}

export function formatEtaFr(seconds: number | null | undefined, isEstimate: boolean): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return isEstimate
      ? "Estimation dès que le débit sera mesuré"
      : "—";
  }
  const rounded = Math.max(0, Math.round(seconds));
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  let core: string;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    core = `≈ ${h} h ${m} min`;
  } else if (min > 0) {
    core = sec > 0 ? `≈ ${min} min ${sec} s` : `≈ ${min} min`;
  } else {
    core = `≈ ${sec} s`;
  }
  return isEstimate ? `${core} (estimation)` : core;
}

export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "").trim();
  const n = raw.length === 3
    ? raw.split("").map((c) => c + c).join("")
    : raw;
  const r = Number.parseInt(n.slice(0, 2), 16) / 255;
  const g = Number.parseInt(n.slice(2, 4), 16) / 255;
  const b = Number.parseInt(n.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const FIRST_LAUNCH_TOKENS = {
  text: "#F3F0FA",
  card: "#221E2C",
  muted: "#BDB6CF",
  teal: "#5ED8C9",
  license: "#E4DEF3",
  button: "#805CDF",
  buttonHover: "#6A3FD9",
  buttonText: "#FFFFFF",
  alert: "#FFD5CF",
  alertBg: "#3A1F26",
  focus: "#FFD76A",
  link: "#C4B2FF",
  line2: "#7A6EA1",
  panel: "#2A2536",
  foot: "#1F1B28",
} as const;

export function fileMeta(name: string): { title: string; hint: string; kind: "engine" | "model" | "vae" | "stems" | "sidecar" } {
  const lower = name.toLowerCase();
  if (lower.includes("yue2-3b-q8")) {
    return { title: "YuE2 (Q8)", hint: "Modèle de génération", kind: "model" };
  }
  if (lower.includes("yue2-3b-q4")) {
    return { title: "YuE2 (Q4)", hint: "Modèle de génération", kind: "model" };
  }
  if (lower.includes("yue2-vae")) {
    return { title: "VAE", hint: "Décodage audio", kind: "vae" };
  }
  if (lower.includes("htdemucs")) {
    return { title: "HTDemucs", hint: "Séparation de stems", kind: "stems" };
  }
  if (lower.includes("cudart")) {
    return { title: "Runtime CUDA", hint: "Bibliothèques NVIDIA", kind: "engine" };
  }
  if (lower.endsWith(".json") || lower.endsWith(".tiktoken")) {
    return { title: name, hint: "Fichiers d’accompagnement", kind: "sidecar" };
  }
  return { title: "Moteur audio", hint: "Traitement du son", kind: "engine" };
}

export function bucketPlanBytes(plan: InstallPlan | null): DownloadBuckets {
  if (!plan) {
    return { engineBytes: 0, modelBytes: 0, totalBytes: 0 };
  }
  let engineBytes = 0;
  let modelBytes = 0;
  for (const file of plan.files) {
    const remaining = file.remainingBytes;
    if (fileMeta(file.name).kind === "model") modelBytes += remaining;
    else engineBytes += remaining;
  }
  return {
    engineBytes,
    modelBytes,
    totalBytes: plan.bytesToDownload,
  };
}

/** Tailles épinglées YuE2 (spec §2.2), pas les exemples de maquette. */
export const YUE2_Q4_BYTES = 2_665_632_320;
export const YUE2_Q8_BYTES = 4_264_186_432;

export function packModelBytes(pack: ModelPack): number {
  return pack === "q8" ? YUE2_Q8_BYTES : YUE2_Q4_BYTES;
}

export function yue2PeakMib(pack: ModelPack): number {
  return pack === "q8" ? YUE2_Q8_PEAK_MIB : YUE2_Q4_PEAK_MIB;
}

export function vramBarPercent(pack: ModelPack, vramMib: number | null | undefined): number {
  if (vramMib == null || vramMib <= 0) return pack === "q8" ? 90 : 70;
  return Math.min(100, Math.round((yue2PeakMib(pack) / vramMib) * 100));
}

export function resolveFirstLaunchView(input: {
  loading: boolean;
  gpu: SetupGpuInfo | null;
  plan: InstallPlan | null;
  progress: InstallProgress | null;
  busy: boolean;
  interruptDismissed: boolean;
}): FirstLaunchView {
  if (input.loading) return "loading";
  const state = input.progress?.state;
  if (input.busy || state === "downloading" || state === "preparing") {
    return "download";
  }
  if (state === "error") return "interrupted";
  if (input.plan?.hasPartialDownloads && !input.interruptDismissed) {
    return "interrupted";
  }
  const kind = input.gpu?.accelerationKind ?? "none";
  if (kind === "appleMetal" || input.gpu?.accelerationAvailable) return "gpu";
  return "noGpu";
}

export function normalizeAcceleration(kind: AccelerationKind | undefined): "nvidiaCuda" | "appleMetal" | "none" {
  if (kind === "appleMetal") return "appleMetal";
  if (kind === "nvidiaCuda") return "nvidiaCuda";
  return "none";
}

export function detectHeadline(kind: AccelerationKind | undefined): {
  status: string;
  detail: string;
  sub: string;
} {
  const accel = normalizeAcceleration(kind);
  switch (accel) {
    case "appleMetal":
      return {
        status: "Apple Metal détecté",
        detail: "Apple Metal",
        sub: "Compatible avec la génération de musique (Metal)",
      };
    case "nvidiaCuda":
      return {
        status: "Carte graphique détectée",
        detail: "GPU NVIDIA",
        sub: "Compatible avec la génération de musique (CUDA)",
      };
    case "none":
      return {
        status: "Aucune carte graphique compatible",
        detail: "Aucun GPU NVIDIA ni Apple Metal",
        sub: "La génération YuE2 n’est pas proposée sur cet ordinateur.",
      };
    default: {
      const _exhaustive: never = accel;
      return _exhaustive;
    }
  }
}

export function gpuDetailLine(gpu: SetupGpuInfo): string {
  const headline = detectHeadline(gpu.accelerationKind);
  if (gpu.accelerationKind === "appleMetal") {
    return headline.detail;
  }
  const name = gpu.gpuName?.trim() || headline.detail;
  const vram = formatVramGo(gpu.vramMib);
  return vram ? `${name}, ${vram} de VRAM` : name;
}

export function normalizeInstallCause(
  cause: InstallErrorCause | undefined,
): "network" | "diskFull" | "hashInvalid" | "http" | "other" {
  if (cause === "network" || cause === "diskFull" || cause === "hashInvalid" || cause === "http") {
    return cause;
  }
  return "other";
}

export function installErrorCopy(error: InstallErrorInfo | null | undefined): InstallErrorCopy {
  const receivedHint = "Les octets déjà reçus sont conservés.";
  const cause = normalizeInstallCause(error?.cause);
  switch (cause) {
    case "network":
      return {
        title: error?.fileName
          ? `La connexion Internet a été coupée pendant le téléchargement de ${error.fileName}`
          : "La connexion Internet a été coupée pendant le téléchargement",
        body: `Ce n’est pas grave. ${receivedHint} Que faire :`,
        steps: [
          "Vérifiez que vous êtes connecté à Internet (Wi-Fi ou câble).",
          "Cliquez sur « Reprendre ». Si cela échoue encore, essayez dans quelques minutes.",
        ],
      };
    case "diskFull":
      return {
        title: "Le disque est plein : le téléchargement n’a pas pu se terminer",
        body: `${receivedHint} Libérez de l’espace, puis reprenez.`,
        steps: [
          "Supprimez des fichiers inutiles ou videz la corbeille.",
          "Cliquez sur « Reprendre le téléchargement ».",
        ],
      };
    case "hashInvalid":
      return {
        title: "Le fichier reçu n’a pas l’empreinte attendue",
        body: "Le téléchargement a peut-être été altéré. Le fichier incomplet sera repris.",
        steps: [
          "Cliquez sur « Reprendre le téléchargement ».",
          "Si l’erreur revient, vérifiez votre connexion ou réessayez plus tard.",
        ],
      };
    case "http":
      return {
        title: "Le serveur a refusé ou interrompu le téléchargement",
        body: `${error?.message ?? "Erreur HTTP."} ${receivedHint}`,
        steps: [
          "Réessayez dans quelques minutes.",
          "Cliquez sur « Reprendre le téléchargement ».",
        ],
      };
    case "other":
      return {
        title: "Le téléchargement a été interrompu",
        body: `${error?.message ?? "Une erreur est survenue."} ${receivedHint}`,
        steps: [
          "Vérifiez la connexion et l’espace disque.",
          "Cliquez sur « Reprendre le téléchargement ».",
        ],
      };
    default: {
      const _exhaustive: never = cause;
      return _exhaustive;
    }
  }
}

function rowPercent(received: number, total: number | null): number {
  if (!total || total <= 0) return received > 0 ? 1 : 0;
  return Math.min(100, Math.round((received / total) * 100));
}

export function buildFileRows(
  plan: InstallPlan | null,
  progress: InstallProgress | null,
): FileRow[] {
  if (!plan) return [];
  const activeName = progress?.fileName ?? progress?.label ?? null;
  const downloading = progress?.state === "downloading" || progress?.state === "preparing";
  const errored = progress?.state === "error";
  const errorName = progress?.error?.fileName ?? progress?.fileName ?? null;

  return plan.files.map((file) => {
    const meta = fileMeta(file.name);
    let received = file.receivedBytes;
    let total = file.totalBytes ?? null;
    let status: FileRowStatus = file.status === "complete"
      ? "complete"
      : file.status === "partial"
        ? "partial"
        : "missing";

    const isActive = Boolean(
      activeName &&
        (file.name === activeName ||
          file.name.includes(activeName) ||
          activeName.includes(file.name)),
    );

    if (downloading && isActive) {
      received = progress?.receivedBytes ?? received;
      total = progress?.totalBytes ?? total;
      status = "active";
    } else if (errored && errorName && (file.name === errorName || file.name.includes(errorName))) {
      status = "error";
    } else if (status === "missing" && downloading) {
      status = "waiting";
    } else if (status === "missing" && (errored || plan.hasPartialDownloads)) {
      status = "waiting";
    } else if (status === "partial" && errored) {
      status = "error";
    }

    return {
      name: file.name,
      title: meta.title,
      hint: meta.hint,
      status,
      receivedBytes: received,
      totalBytes: total,
      percent: rowPercent(received, total),
      bytesPerSec: downloading && isActive ? progress?.bytesPerSec ?? null : null,
    };
  });
}

export function overallReceived(plan: InstallPlan | null, progress: InstallProgress | null): number {
  if (progress?.overallReceivedBytes != null) return progress.overallReceivedBytes;
  if (!plan) return 0;
  return plan.files.reduce((sum, file) => {
    if (file.status === "complete") return sum + (file.totalBytes ?? file.receivedBytes);
    return sum + file.receivedBytes;
  }, 0);
}

export function overallTotal(plan: InstallPlan | null, progress: InstallProgress | null): number | null {
  if (progress?.overallTotalBytes != null) return progress.overallTotalBytes;
  if (!plan) return null;
  let total = 0;
  for (const file of plan.files) {
    if (file.totalBytes == null) return null;
    total += file.totalBytes;
  }
  return total;
}

export function summarizePartial(files: InstallFilePlan[]): { received: number; of: number | null } {
  let received = 0;
  let of = 0;
  let known = true;
  for (const file of files) {
    received += file.receivedBytes;
    if (file.totalBytes == null) known = false;
    else of += file.totalBytes;
  }
  return { received, of: known ? of : null };
}

export type BrowserDemoFixture = {
  gpu: SetupGpuInfo;
  pack: ModelPack;
  plan: InstallPlan;
  progress: InstallProgress | null;
};

export function demoSetupGpu(kind: "nvidiaCuda" | "appleMetal" | "none"): SetupGpuInfo {
  if (kind === "appleMetal") {
    return {
      accelerationKind: "appleMetal",
      gpuName: "Apple Metal",
      driverVersion: null,
      vramMib: null,
      suggestedPack: "q4",
      suggestedPackReasonFr:
        "Apple Metal est disponible sur ce Mac. Le pack Q4 est recommandé par défaut (mémoire unifiée non mesurée par l’assistant).",
      accelerationAvailable: true,
    };
  }
  if (kind === "none") {
    return {
      accelerationKind: "none",
      gpuName: null,
      driverVersion: null,
      vramMib: null,
      suggestedPack: "q4",
      suggestedPackReasonFr: "Aucun GPU compatible détecté.",
      accelerationAvailable: false,
    };
  }
  return {
    accelerationKind: "nvidiaCuda",
    gpuName: "NVIDIA GeForce RTX 4060",
    driverVersion: "560.35",
    vramMib: 8188,
    suggestedPack: "q4",
    suggestedPackReasonFr:
      "VRAM détectée : 8 Go — en dessous du seuil de 12 Go pour le pack Q8 ; Q4 recommandé.",
    accelerationAvailable: true,
  };
}

/** Fixtures navigateur (hash `#a` / `#metal` / `#b` / `#c`) hors runtime Tauri. */
export function browserDemoFromHash(hashRaw?: string): BrowserDemoFixture {
  const hash = (hashRaw ?? globalThis.location?.hash ?? "").replace(/^#/, "");
  const metal = hash === "metal";
  const none = hash === "b" || hash === "nogpu";
  const interrupted = hash === "c" || hash === "interrompu";
  const gpu = demoSetupGpu(metal ? "appleMetal" : none ? "none" : "nvidiaCuda");
  const pack = parsePack(gpu.suggestedPack);
  return {
    gpu,
    pack,
    plan: demoInstallPlan(pack, interrupted),
    progress: interrupted ? demoProgressError() : null,
  };
}

export function demoInstallPlan(pack: ModelPack, interrupted: boolean): InstallPlan {
  const model = pack === "q8" ? "yue2-3b-q8_0.gguf" : "yue2-3b-q4_0.gguf";
  const modelTotal = packModelBytes(pack);
  const modelReceived = interrupted ? Math.round(modelTotal * 0.43) : 0;
  const files: InstallFilePlan[] = [
    {
      name: "audio-v0.8.2-bin-ubuntu-x64-cuda12.8-colab.tar.gz",
      status: interrupted ? "complete" : "missing",
      totalBytes: 65_293_844,
      receivedBytes: interrupted ? 65_293_844 : 0,
      remainingBytes: interrupted ? 0 : 65_293_844,
    },
    {
      name: model,
      status: interrupted ? "partial" : "missing",
      totalBytes: modelTotal,
      receivedBytes: modelReceived,
      remainingBytes: modelTotal - modelReceived,
    },
    {
      name: "yue2-vae-f16.gguf",
      status: "missing",
      totalBytes: 265_218_656,
      receivedBytes: 0,
      remainingBytes: 265_218_656,
    },
    {
      name: "htdemucs-q8_0.gguf",
      status: "missing",
      totalBytes: 300_000_000,
      receivedBytes: 0,
      remainingBytes: 300_000_000,
    },
  ];
  return {
    pack,
    fileCount: files.length,
    bytesToDownload: files.reduce((sum, file) => sum + file.remainingBytes, 0),
    bytesKnown: true,
    hasPartialDownloads: interrupted,
    files,
  };
}

export function demoProgressError(): InstallProgress {
  return {
    state: "error",
    label: "yue2-3b-q4_0.gguf",
    fileIndex: 2,
    fileCount: 4,
    receivedBytes: Math.round(YUE2_Q4_BYTES * 0.43),
    totalBytes: YUE2_Q4_BYTES,
    fileName: "yue2-3b-q4_0.gguf",
    bytesPerSec: 0,
    etaSeconds: 85,
    etaIsEstimate: true,
    overallReceivedBytes: Math.round(YUE2_Q4_BYTES * 0.43) + 65_293_844,
    overallTotalBytes: YUE2_Q4_BYTES + 65_293_844 + 265_218_656 + 300_000_000,
    overallEtaIsEstimate: true,
    error: {
      message: "La connexion a été interrompue.",
      cause: "network",
      fileName: "YuE2 (Q4)",
    },
  };
}
