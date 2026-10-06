import { invoke } from "@tauri-apps/api/core";
import type { PortablePackagePlan } from "./projectPackage";
import type { ProfilesState, ProfileSummary } from "./profilesTypes";
import type {
  NativeCaptureBackend,
  NativeCapturePoll,
  NativeCaptureStopResult,
  NativeInputDevice,
} from "./nativeCapture";
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
  MixVersionSummary,
  Phase3Status,
  PlaybackSources,
  ProjectDoc,
  ScoreSummary,
  SeparationInfo,
  SeparationVersionSummary,
  SetupGpuInfo,
  Vst3CatalogEntry,
  Vst3PluginDescription,
  Vst3ProcessedPcm,
} from "./types";

export const api = {
  getHealth: () => invoke<HealthSnapshot>("get_health"),
  restartAudioRuntime: () => invoke<string>("restart_audio_runtime"),
  getSetupGpuInfo: () => invoke<SetupGpuInfo>("get_setup_gpu_info"),
  getInstallPlan: (pack: "q4" | "q8", mixOnly?: boolean) =>
    invoke<InstallPlan>("get_install_plan", { pack, mixOnly: mixOnly ?? null }),
  installRequiredAssets: (pack: "q4" | "q8", acceptedLicense: boolean) =>
    invoke<string>("install_required_assets", { pack, acceptedLicense }),
  installMixOnlyAssets: () => invoke<string>("install_mix_only_assets"),
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    invoke<AppSettings>("update_settings", { settings }),
  embeddedDeclUiStatus: () =>
    invoke<{
      running: boolean;
      url: string | null;
      bind: string;
      notesFr: string;
    }>("embedded_declui_status"),
  startEmbeddedDeclUiHost: () =>
    invoke<{
      running: boolean;
      url: string | null;
      bind: string;
      notesFr: string;
    }>("start_embedded_declui_host"),
  stopEmbeddedDeclUiHost: () =>
    invoke<{
      running: boolean;
      url: string | null;
      bind: string;
      notesFr: string;
    }>("stop_embedded_declui_host"),
  vst3SpikeStatus: () =>
    invoke<{ enabled: boolean; isHost: boolean; notesFr: string }>(
      "vst3_spike_status",
    ),
  vst3SpikeScan: () =>
    invoke<
      { path: string; name: string; binaryPath: string | null }[]
    >("vst3_spike_scan"),
  vst3SpikeLoad: (path: string) =>
    invoke<{
      path: string;
      factoryPresent: boolean;
      isolatedProcess: boolean;
      notesFr: string;
    }>("vst3_spike_load", { path }),
  vst3SpikeAttach: (projectId: string, trackId: string, path: string) =>
    invoke<MixDoc>("vst3_spike_attach", { projectId, trackId, path }),
  vst3ListPlugins: () => invoke<Vst3CatalogEntry[]>("vst3_list_plugins"),
  vst3PluginParameters: (
    path: string,
    parameters: Record<string, number> = {},
  ) =>
    invoke<Vst3PluginDescription>("vst3_plugin_parameters", {
      path,
      parameters,
    }),
  vst3ProcessPcm: (request: {
    path: string;
    parameters: Record<string, number>;
    sampleRate: number;
    peakCeilingDb: number;
    pcmLe: number[];
  }) =>
    invoke<Vst3ProcessedPcm>("vst3_process_pcm", {
      path: request.path,
      parameters: request.parameters,
      sampleRate: request.sampleRate,
      peakCeilingDb: request.peakCeilingDb,
      pcmLe: request.pcmLe,
    }),
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
  installMelBandRoFormer: () => invoke<string>("install_mel_band_roformer"),
  cancelMelBandRoFormerInstall: () =>
    invoke<string>("cancel_mel_band_roformer_install"),
  melBandRoFormerInstallInfo: () =>
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
    }>("mel_band_roformer_install_info"),
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
  cancelJob: () => invoke<boolean>("cancel_job"),
  startGeneration: (
    id: string,
    form: FormInput,
    abc?: string | null,
    options?: {
      stopAfter?: "abc" | null;
      sourceGenerationId?: string | null;
      /** One-shot engine; does not persist Settings default. */
      engine?: "yue2" | "ace_step" | "ace_step_lego" | null;
      /** Production add-track only; ignored for Créer. */
      instrumentalRole?: "bass" | "drums" | "other" | null;
    },
  ) =>
    invoke<ProjectDoc>("start_generation", {
      id,
      form,
      abc: abc ?? null,
      stopAfter: options?.stopAfter ?? null,
      sourceGenerationId: options?.sourceGenerationId ?? null,
      engine: options?.engine ?? null,
      instrumentalRole: options?.instrumentalRole ?? null,
    }),
  generateInstrumentalPart: (
    id: string,
    form: FormInput,
    role: "bass" | "drums" | "other",
    engine?: "ace_step_lego",
  ) => invoke<{ project: ProjectDoc; generationId: string }>("generate_instrumental_part", {
    id, form, role, engine: engine ?? null,
  }),
  generateComparisonTake: (
    id: string,
    form: FormInput,
    abc?: string | null,
    engine?: "yue2" | "ace_step",
    stopAfter?: "abc" | null,
  ) => invoke<{ project: ProjectDoc; generationId: string }>("generate_comparison_take", {
    id, form, abc: abc ?? null, engine: engine ?? null, stopAfter: stopAfter ?? null,
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
      vst3MasterInsert?: NonNullable<MixDoc["vst3MasterInsert"]>;
      clearVst3MasterInsert?: boolean;
    },
  ) => invoke<MixDoc>("update_mix", { id, update }),
  /** Native dialog → copy + normalize → append user MixTrack (#40). Null if cancelled. */
  importUserAudioTrack: (id: string) =>
    invoke<MixDoc | null>("import_user_audio_track", { id }),
  importGenerationAsUserTrack: (
    id: string,
    generationId: string,
    displayName?: string | null,
    muteExisting = false,
  ) =>
    invoke<MixDoc>("import_generation_as_user_track", {
      id,
      generationId,
      displayName: displayName ?? null,
      muteExisting,
    }),
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
    startMs?: number | null,
  ) =>
    invoke<MixDoc>("finalize_user_audio_capture", {
      id,
      sessionId,
      displayName: displayName ?? null,
      startMs: startMs ?? null,
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
  nativeCaptureBackend: () => invoke<NativeCaptureBackend>("native_capture_backend"),
  listNativeCaptureDevices: () =>
    invoke<NativeInputDevice[]>("list_native_capture_devices"),
  startNativeCapture: (id: string, deviceId?: string | null) =>
    invoke<{ sessionId: string; relativePath: string }>("start_native_capture", {
      id,
      deviceId: deviceId ?? null,
    }),
  pollNativeCapture: () => invoke<NativeCapturePoll | null>("poll_native_capture"),
  pauseNativeCapture: (paused: boolean) =>
    invoke<void>("pause_native_capture", { paused }),
  stopNativeCapture: () => invoke<NativeCaptureStopResult>("stop_native_capture"),
  saveMixVersion: (id: string) => invoke<MixDoc>("save_mix_version", { id }),
  listMixVersions: (id: string) =>
    invoke<MixVersionSummary[]>("list_mix_versions", { id }),
  renderPreview: (id: string) => invoke<string>("render_preview", { id }),
  playbackSources: (id: string) =>
    invoke<PlaybackSources>("playback_sources", { id }),
  exportAudio: (
    id: string,
    format: "wav" | "flac" | "mp3",
    options?: {
      bitDepth?: 16 | 24;
      bitrateKbps?: 128 | 192 | 320;
      pack?: "folder" | "zip";
      destination?: string | null;
    },
  ) =>
    invoke<string>("export_audio", {
      id,
      req: {
        format,
        destination: options?.destination ?? null,
        bitDepth: options?.bitDepth ?? null,
        bitrateKbps: options?.bitrateKbps ?? null,
        pack: options?.pack ?? null,
      },
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
      bitDepth?: 16 | 24;
      bitrateKbps?: 128 | 192 | 320;
      pack?: "folder" | "zip";
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
        bitDepth: req.bitDepth ?? null,
        bitrateKbps: req.bitrateKbps ?? null,
        pack: req.pack ?? null,
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
  transcribeBasicpitch: (id: string, trackId: string) =>
    invoke<{
      midiBytes: number[];
      noteCount: number;
      backend: string;
      tensorflowInstalled: boolean;
      model: string;
    }>("transcribe_basicpitch", { id, trackId }),
  useGeneration: (id: string, genId: string) =>
    invoke<ProjectDoc>("use_generation", { id, genId }),
  renameGeneration: (id: string, genId: string, name: string) =>
    invoke<ProjectDoc>("rename_generation", { id, genId, name }),
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
  getProfilesState: () => invoke<ProfilesState>("get_profiles_state"),
  createProfile: (name: string, kind: "hobby" | "commercial") =>
    invoke<ProfileSummary>("create_profile", { name, kind }),
  renameProfile: (id: string, name: string) =>
    invoke<void>("rename_profile", { id, name }),
  activateProfile: (id: string) => invoke<void>("activate_profile", { id }),
  dismissProfileMigrationBanner: () =>
    invoke<void>("dismiss_profile_migration_banner"),
  acceptEngineContract: (
    profileId: string,
    engineId: string,
    textFingerprint: string,
    textVersion: string,
  ) =>
    invoke<void>("accept_engine_contract", {
      profileId,
      engineId,
      textFingerprint,
      textVersion,
    }),
  rbitnetStatus: () =>
    invoke<{
      releaseTag: string;
      binaryPresent: boolean;
      binaryPath?: string;
      running: boolean;
      ready: boolean;
      baseUrl: string;
      selectedModelId: string;
      modelPresent: boolean;
      modelPath?: string;
      tokenizerPresent: boolean;
      catalog: {
        id: string;
        labelFr: string;
        ggufRepo: string;
        ggufFile: string;
        bytes: number;
        present: boolean;
      }[];
      messageFr: string;
    }>("rbitnet_status"),
  installRbitnetBinary: () => invoke<string>("install_rbitnet_binary"),
  installRbitnetModel: (modelId: string) =>
    invoke<string>("install_rbitnet_model", { modelId }),
  cancelRbitnetInstall: () => invoke<string>("cancel_rbitnet_install"),
  ensureRbitnetSidecar: (modelId?: string) =>
    invoke<{ baseUrl: string; modelId: string; ready: boolean }>(
      "ensure_rbitnet_sidecar",
      { modelId: modelId ?? null },
    ),
  validateBatchImport: () => invoke<BatchValidateResult>("validate_batch_import"),
  verifyBatchParallelism: (startToken: string) =>
    invoke<BatchValidateResult & {
      messageFr: string;
      verified?: boolean;
      audioEngineRestartFailed?: boolean;
    }>("verify_batch_parallelism", {startToken}),
  updateBatchPreview: (
    startToken: string,
    overrides: { generations?: number | null; maxParallelGenerations?: number | null },
  ) =>
    invoke<BatchValidateResult>("update_batch_preview", {
      startToken,
      overrides,
    }),
  startBatch: (startToken: string, revision: number) =>
    invoke<{ batchId: string; idempotent: boolean }>("start_batch", {
      startToken,
      revision,
    }),
  listBatches: () => invoke<BatchSnapshot[]>("list_batches"),
  getBatchStatus: (batchId: string) => invoke<BatchSnapshot>("get_batch_status", { batchId }),
  pauseBatch: (batchId: string) => invoke<BatchSnapshot>("pause_batch", { batchId }),
  resumeBatch: (batchId: string) => invoke<BatchSnapshot>("resume_batch", { batchId }),
  cancelBatch: (batchId: string) => invoke<BatchSnapshot>("cancel_batch", { batchId }),
  cancelBatchTask: (batchId: string, taskId: string) =>
    invoke<unknown>("cancel_batch_task", { batchId, taskId }),
  retryBatchTasks: (batchId: string, taskIds: string[]) =>
    invoke<BatchSnapshot>("retry_batch_tasks", { batchId, taskIds }),
  exportBatchResults: (batchId: string) =>
    invoke<string | null>("export_batch_results", { batchId }),
  downloadBatchExample: () => invoke<string | null>("download_batch_example"),
};

export type BatchError = { path: string; messageFr: string };

export type BatchSongPreview = {
  id: string;
  title: string;
  stylePreview: string;
  generations: number;
  lyricsChars: number;
  lyrics?: string;
  style?: string;
  instrumentalMode?: boolean;
};

export type BatchTask = {
  taskId: string;
  songId: string;
  variantIndex: number;
  seed: number;
  title: string;
  projectId?: string | null;
  generationId?: string | null;
  audioPath?: string | null;
  state: string;
  lastError?: string | null;
};

export type BatchPreview = {
  name: string;
  songCount: number;
  taskCount: number;
  requestedParallel: number;
  admittedParallel: number;
  effectiveParallel: number;
  parallelismPolicy: string;
  capacityReasonFr: string;
  onError: string;
  retryMaxAttempts: number;
  songs: BatchSongPreview[];
  tasks: BatchTask[];
  startToken: string;
  revision: number;
  canLaunch: boolean;
  launchBlockFr?: string | null;
};

export type BatchValidateResult = {
  ok: boolean;
  cancelled?: boolean;
  errors?: BatchError[];
  preview?: BatchPreview;
  admittedParallel?: number;
};

export type BatchSnapshot = {
  batchId: string;
  name: string;
  state: string;
  revision: number;
  pauseRequested?: boolean;
  cancelRequested?: boolean;
  capacityReasonFr?: string;
  requestedParallel?: number;
  admittedParallel?: number;
  effectiveParallel?: number;
  counts?: {
    ready: number;
    running: number;
    queued: number;
    failed: number;
    interrupted: number;
    cancelled: number;
    total: number;
  };
  tasks?: BatchTask[];
};
