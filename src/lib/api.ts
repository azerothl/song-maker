import { invoke } from "@tauri-apps/api/core";
import type { PortablePackagePlan } from "./projectPackage";
import type {
  AppSettings,
  FormInput,
  GenerationSummary,
  HealthSnapshot,
  InstallPlan,
  JobStatus,
  LibraryRow,
  LocalLoraAdapter,
  MixDoc,
  Phase3Status,
  PlaybackSources,
  ProjectDoc,
  ScoreSummary,
  SeparationInfo,
  SeparationVersionSummary,
  SetupGpuInfo,
} from "./types";

export const api = {
  getHealth: () => invoke<HealthSnapshot>("get_health"),
  getSetupGpuInfo: () => invoke<SetupGpuInfo>("get_setup_gpu_info"),
  getInstallPlan: (pack: "q4" | "q8") =>
    invoke<InstallPlan>("get_install_plan", { pack }),
  installRequiredAssets: (pack: "q4" | "q8", acceptedLicense: boolean) =>
    invoke<string>("install_required_assets", { pack, acceptedLicense }),
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    invoke<AppSettings>("update_settings", { settings }),
  getPhase3Status: () => invoke<Phase3Status>("get_phase3_status"),
  installHtDemucs6sRuntime: () =>
    invoke<string>("install_htdemucs_6s_runtime"),
  installBsRoFormer: () => invoke<string>("install_bs_roformer"),
  cancelBsRoFormerInstall: () => invoke<string>("cancel_bs_roformer_install"),
  bsRoFormerInstallInfo: () =>
    invoke<{
      gguf: string;
      sha256: string;
      bytes: number;
      remotePath: string;
      url: string;
      licenseNoticeFr: string;
      path: string;
      available: boolean;
      defaultSeparator: string;
      stemLayoutFr: string;
    }>("bs_roformer_install_info"),
  listLoraAdapters: () => invoke<LocalLoraAdapter[]>("list_lora_adapters"),
  importLoraAdapters: () =>
    invoke<LocalLoraAdapter[] | null>("import_lora_adapters"),
  confirmModelPack: (pack: string) =>
    invoke<AppSettings>("confirm_model_pack", { pack }),
  listProjects: (query?: string) =>
    invoke<LibraryRow[]>("list_projects", { query: query ?? null }),
  createProject: (title: string) =>
    invoke<ProjectDoc>("create_project", { input: { title } }),
  openProject: (id: string) => invoke<ProjectDoc>("open_project", { id }),
  saveProjectForm: (id: string, form: FormInput) =>
    invoke<ProjectDoc>("save_project_form", { id, form }),
  renameProject: (id: string, title: string) =>
    invoke<ProjectDoc>("rename_project", { id, title }),
  duplicateProject: (id: string) =>
    invoke<ProjectDoc>("duplicate_project", { id }),
  deleteProject: (id: string) => invoke<void>("delete_project", { id }),
  revealProject: (id: string) => invoke<string>("reveal_project", { id }),
  getJobStatus: () => invoke<JobStatus>("get_job_status"),
  cancelJob: () => invoke<string>("cancel_job"),
  startGeneration: (
    id: string,
    form: FormInput,
    abc?: string | null,
    options?: {
      stopAfter?: "abc" | null;
      sourceGenerationId?: string | null;
    },
  ) =>
    invoke<ProjectDoc>("start_generation", {
      id,
      form,
      abc: abc ?? null,
      stopAfter: options?.stopAfter ?? null,
      sourceGenerationId: options?.sourceGenerationId ?? null,
    }),
  /** Render audio from an existing gen's immutable score.abc (parent = source). */
  renderFromGeneration: (
    id: string,
    sourceGenId: string,
    form: FormInput,
  ) =>
    invoke<ProjectDoc>("render_from_generation", {
      id,
      sourceGenId,
      form,
    }),
  startSeparation: (id: string) => invoke<MixDoc>("start_separation", { id }),
  loadMix: (id: string) => invoke<MixDoc | null>("load_mix", { id }),
  loadSeparationInfo: (id: string) =>
    invoke<SeparationInfo | null>("load_separation_info", { id }),
  listSeparationVersions: (id: string) =>
    invoke<SeparationVersionSummary[]>("list_separation_versions_cmd", { id }),
  activateSeparationVersion: (id: string, separationId: string) =>
    invoke<MixDoc>("activate_separation_version", { id, separationId }),
  exportSeparationStems: (
    id: string,
    req: {
      trackIds: string[];
      pack: "folder" | "zip";
      destination: string | null;
    },
  ) =>
    invoke<string | null>("export_separation_stems", {
      id,
      req: {
        trackIds: req.trackIds,
        pack: req.pack,
        destination: req.destination,
      },
    }),
  updateMix: (
    id: string,
    update: {
      masterGainDb: number;
      tracks: {
        id: string;
        gainDb: number;
        pan: number;
        mute: boolean;
        solo: boolean;
        clips?: MixDoc["tracks"][number]["clips"];
      }[];
      tempoMap?: MixDoc["tempoMap"];
      timeSignatures?: MixDoc["timeSignatures"];
      markers?: MixDoc["markers"];
    },
  ) => invoke<MixDoc>("update_mix", { id, update }),
  /** Native dialog → copy + normalize → append user MixTrack (#40). Null if cancelled. */
  importUserAudioTrack: (id: string) =>
    invoke<MixDoc | null>("import_user_audio_track", { id }),
  beginUserAudioCapture: (id: string) =>
    invoke<{ sessionId: string; relativePath: string }>(
      "begin_user_audio_capture",
      { id },
    ),
  appendUserAudioChunk: (id: string, sessionId: string, chunk: number[]) =>
    invoke<void>("append_user_audio_chunk", { id, sessionId, chunk }),
  discardUserAudioCapture: (id: string, sessionId: string) =>
    invoke<void>("discard_user_audio_capture", { id, sessionId }),
  finalizeUserAudioCapture: (
    id: string,
    sessionId: string,
    displayName?: string | null,
  ) =>
    invoke<MixDoc>("finalize_user_audio_capture", {
      id,
      sessionId,
      displayName: displayName ?? null,
    }),
  finalizeUserAudioCaptureTakes: (
    id: string,
    sessionIds: string[],
    displayName?: string | null,
    startMs?: number | null,
  ) =>
    invoke<MixDoc>("finalize_user_audio_capture_takes", {
      id,
      req: {
        sessionIds,
        displayName: displayName ?? null,
        startMs: startMs ?? null,
      },
    }),
  saveMixVersion: (id: string) => invoke<MixDoc>("save_mix_version", { id }),
  renderPreview: (id: string) => invoke<string>("render_preview", { id }),
  playbackSources: (id: string) =>
    invoke<PlaybackSources>("playback_sources", { id }),
  exportAudio: (id: string, format: "wav" | "flac" | "mp3") =>
    invoke<string>("export_audio", {
      id,
      req: { format, destination: null },
    }),
  exportPcmAudio: (
    id: string,
    req: {
      format: "wav" | "flac" | "mp3";
      pcmLe: number[];
      sampleRate: number;
      channels: number;
      peakTrimDb: number;
      renderPath: string;
      matchMode: string;
      fileStem?: string;
    },
  ) =>
    invoke<string>("export_pcm_audio", {
      id,
      req: {
        format: req.format,
        destination: null,
        pcmLe: req.pcmLe,
        sampleRate: req.sampleRate,
        channels: req.channels,
        peakTrimDb: req.peakTrimDb,
        renderPath: req.renderPath,
        matchMode: req.matchMode,
        fileStem: req.fileStem ?? null,
      },
    }),
  saveProductionOverlay: (id: string, mixId: string, overlay: unknown) =>
    invoke<void>("save_production_overlay", { id, mixId, overlay }),
  loadProductionOverlayDisk: (id: string, mixId: string) =>
    invoke<unknown | null>("load_production_overlay", { id, mixId }),
  listProjectPackageInventory: (id: string) =>
    invoke<
      Array<{ relativePath: string; byteLength: number; exists: boolean }>
    >("list_project_package_inventory", { id }),
  exportProjectPackage: (id: string) =>
    invoke<{ path: string; plan: PortablePackagePlan }>(
      "export_project_package",
      { id },
    ),
  downloadCacheFile: (
    url: string,
    relativeCachePath: string,
    expectedSha256?: string,
  ) =>
    invoke<string>("download_cache_file", {
      req: {
        url,
        relativeCachePath,
        expectedSha256: expectedSha256 ?? null,
      },
    }),
  listGenerations: (id: string) =>
    invoke<GenerationSummary[]>("list_generations", { id }),
  readScoreAbc: (id: string, genId: string) =>
    invoke<string | null>("read_score_abc", { id, genId }),
  saveScore: (id: string, document: unknown) =>
    invoke<[ProjectDoc, string]>("save_score", { id, document }).then(
      ([project, scoreId]) => ({ project, scoreId }),
    ),
  loadScore: (id: string) => invoke<unknown | null>("load_score", { id }),
  clearScore: (id: string) => invoke<ProjectDoc>("clear_score", { id }),
  listScores: (id: string) => invoke<ScoreSummary[]>("list_scores", { id }),
  loadScoreVersion: (id: string, scoreId: string) =>
    invoke<unknown | null>("load_score_version", { id, scoreId }),
  setActiveScore: (id: string, scoreId: string) =>
    invoke<ProjectDoc>("set_active_score", { id, scoreId }),
  useGeneration: (id: string, genId: string) =>
    invoke<ProjectDoc>("use_generation", { id, genId }),
  /** Import remote worker WAV/score into a local gen-* with provenance (#65). */
  importRemoteGeneration: (
    id: string,
    payload: {
      remoteJobId: string;
      audioBase64: string;
      audioSha256: string;
      scoreAbc?: string | null;
      scoreSha256?: string | null;
      endpointBaseUrl: string;
      payloadSha256: string;
    },
  ) =>
    invoke<{ project: ProjectDoc; generationId: string }>(
      "import_remote_generation",
      {
        id,
        payload: {
          remoteJobId: payload.remoteJobId,
          audioBase64: payload.audioBase64,
          audioSha256: payload.audioSha256,
          scoreAbc: payload.scoreAbc ?? null,
          scoreSha256: payload.scoreSha256 ?? null,
          endpointBaseUrl: payload.endpointBaseUrl,
          payloadSha256: payload.payloadSha256,
        },
      },
    ),
  undoMix: (id: string) => invoke<MixDoc | null>("undo_mix", { id }),
  redoMix: (id: string) => invoke<MixDoc | null>("redo_mix", { id }),
};
