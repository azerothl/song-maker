import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";

/** SheetSage2 host probe (#60). */
export type SheetsageHostProbe = {
  binaryPresent: boolean;
  binaryPath: string | null;
  cliPresent: boolean;
  cliPath: string | null;
  weightsPresent: boolean;
  weightsPath: string | null;
  weightsSha256Verified: boolean;
  diskBytesAvailable: number | null;
  acceleration: string;
  messageFr: string;
};

export type SheetsageHostTranscribeArgs = {
  jobId: string;
  audioPath: string;
  outAbcPath?: string | null;
  mode?: string | null;
  /** Requested ABC voice count (2–8). Optional; runner may ignore (#340). */
  nVoices?: number | null;
  licenseAccepted: boolean;
};

export type SheetsageHostTranscribeOutcome = {
  status: string;
  jobId: string;
  abc: string | null;
  warnings: string[];
  messageFr: string;
  outAbcPath: string | null;
};

export type AceStepInstallInfo = {
  gguf: string;
  sha256: string;
  bytes: number;
  repo: string;
  revision: string;
  remotePath: string;
  url: string;
  licenseNoticeFr: string;
  licenseNoticeEn: string;
  path: string;
  available: boolean;
  licenseAccepted: boolean;
  selected: boolean;
};

export type LoraTrainerProbe = {
  trainerExists: boolean;
  trainerScriptPath: string | null;
  jobsRoot: string;
  pythonAvailable: boolean;
  messageFr: string;
  yue2GpuTrainerExists?: boolean;
  yue2GpuTrainerScriptPath?: string | null;
  cudaAvailable?: boolean;
};

export type LoraAudioProbe = {
  path: string;
  exists: boolean;
  byteLength: number;
  durationMs: number | null;
  contentSha256: string | null;
  format: string;
  messageFr: string;
};

export type LoraLaunchResult = {
  status: string;
  jobId: string;
  pid: number | null;
  messageFr: string;
};

export type SyncArtifactMeta = {
  relativePath: string;
  contentSha256: string;
  byteLength: number;
};

export const runtimeApi = {
  sheetsageProbe: () => invoke<SheetsageHostProbe>("sheetsage_probe"),
  sheetsageTranscribe: (args: SheetsageHostTranscribeArgs) =>
    invoke<SheetsageHostTranscribeOutcome>("sheetsage_transcribe", { args }),
  sheetsageCancel: (jobId: string) =>
    invoke<string>("sheetsage_cancel", { jobId }),
  installSheetsage2: () => invoke<string>("install_sheetsage2"),
  cancelSheetsage2Install: () => invoke<string>("cancel_sheetsage2_install"),
  sheetsageInstallInfo: () =>
    invoke<{
      gguf: string;
      sha256: string;
      bytes: number;
      repo: string;
      remotePath: string;
      url: string;
      licenseNoticeFr: string;
      path: string;
      available: boolean;
    }>("sheetsage2_install_info"),
  aceStepInstallInfo: () =>
    invoke<AceStepInstallInfo>("ace_step_install_info"),
  installAceStep: (licenseAccepted: boolean) =>
    invoke<string>("install_ace_step", { licenseAccepted }),
  cancelAceStepInstall: () => invoke<string>("cancel_ace_step_install"),
  aceStepLegoStatus: () =>
    invoke<{
      engineId: string;
      ready: boolean;
      running: boolean;
      pythonPresent: boolean;
      venvPresent: boolean;
      sidecarScriptPresent: boolean;
      inferenceAvailable: boolean;
      mock: boolean;
      licenseAccepted: boolean;
      baseUrl: string;
      hfRepo: string;
      hfRevision: string;
      gitSource: string;
      outputKind: string;
      vramNoteFr: string;
      licenseNoticeFr: string;
      licenseNoticeEn: string;
      messageFr: string;
    }>("ace_step_lego_status"),
  installAceStepLego: (licenseAccepted: boolean) =>
    invoke<string>("install_ace_step_lego", { licenseAccepted }),
  cancelAceStepLegoInstall: () =>
    invoke<string>("cancel_ace_step_lego_install"),

  loraTrainProbe: () => invoke<LoraTrainerProbe>("lora_train_probe"),
  loraTrainProbeAudio: (path: string) =>
    invoke<LoraAudioProbe>("lora_train_probe_audio", { path }),
  loraTrainJobsRoot: () => invoke<string>("lora_train_jobs_root"),
  loraTrainWriteText: (path: string, data: string) =>
    invoke<void>("lora_train_write_text", { path, data }),
  loraTrainReadText: (path: string) =>
    invoke<string | null>("lora_train_read_text", { path }),
  loraTrainPathExists: (path: string) =>
    invoke<boolean>("lora_train_path_exists", { path }),
  loraTrainMkdir: (path: string) => invoke<void>("lora_train_mkdir", { path }),
  loraTrainRemove: (path: string) => invoke<void>("lora_train_remove", { path }),
  loraTrainLaunch: (args: {
    jobId: string;
    jobDir: string;
    trainerScriptPath: string;
  }) => invoke<LoraLaunchResult>("lora_train_launch", { args }),
  loraTrainPoll: (jobId: string) =>
    invoke<LoraLaunchResult>("lora_train_poll", { jobId }),
  loraTrainCancelProcess: (jobId: string) =>
    invoke<LoraLaunchResult>("lora_train_cancel_process", { jobId }),

  projectSyncListArtifacts: (projectId: string) =>
    invoke<SyncArtifactMeta[]>("project_sync_list_artifacts", { projectId }),
  projectSyncReadBytes: (projectId: string, relativePath: string) =>
    invoke<number[]>("project_sync_read_bytes", { projectId, relativePath }),
  projectSyncWriteBytes: (
    projectId: string,
    relativePath: string,
    bytes: number[],
  ) =>
    invoke<void>("project_sync_write_bytes", {
      projectId,
      relativePath,
      bytes,
    }),
  projectSyncFsRoot: () => invoke<string>("project_sync_fs_root"),
  projectSyncFsWrite: (
    root: string,
    projectId: string,
    relativePath: string,
    bytes: number[],
  ) =>
    invoke<void>("project_sync_fs_write", {
      root,
      projectId,
      relativePath,
      bytes,
    }),
  projectSyncFsRead: (root: string, projectId: string, relativePath: string) =>
    invoke<number[]>("project_sync_fs_read", {
      root,
      projectId,
      relativePath,
    }),
  projectSyncFsList: (root: string, projectId: string) =>
    invoke<SyncArtifactMeta[]>("project_sync_fs_list", { root, projectId }),
  projectSyncFsDelete: (root: string, projectId: string) =>
    invoke<void>("project_sync_fs_delete", { root, projectId }),
};

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Version de l'application, lue dans `tauri.conf.json` via `package.version`.
 * Renvoie `null` hors runtime Tauri (aperçu navigateur) ou si l'appel échoue :
 * l'appelant affiche alors un tiret plutôt qu'une version inventée.
 */
export async function readAppVersion(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const version = await getVersion();
    return version.trim() || null;
  } catch {
    return null;
  }
}
