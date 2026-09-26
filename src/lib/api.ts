import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  FormInput,
  GenerationSummary,
  HealthSnapshot,
  JobStatus,
  LibraryRow,
  MixDoc,
  ProjectDoc,
} from "./types";

export const api = {
  getHealth: () => invoke<HealthSnapshot>("get_health"),
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    invoke<AppSettings>("update_settings", { settings }),
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
  startGeneration: (id: string, form: FormInput) =>
    invoke<ProjectDoc>("start_generation", { id, form }),
  startSeparation: (id: string) => invoke<MixDoc>("start_separation", { id }),
  loadMix: (id: string) => invoke<MixDoc | null>("load_mix", { id }),
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
      }[];
    },
  ) => invoke<MixDoc>("update_mix", { id, update }),
  saveMixVersion: (id: string) => invoke<MixDoc>("save_mix_version", { id }),
  renderPreview: (id: string) => invoke<string>("render_preview", { id }),
  exportAudio: (id: string, format: "wav" | "flac") =>
    invoke<string>("export_audio", {
      id,
      req: { format, destination: null },
    }),
  listGenerations: (id: string) =>
    invoke<GenerationSummary[]>("list_generations", { id }),
  readScoreAbc: (id: string, genId: string) =>
    invoke<string | null>("read_score_abc", { id, genId }),
  useGeneration: (id: string, genId: string) =>
    invoke<ProjectDoc>("use_generation", { id, genId }),
  undoMix: (id: string) => invoke<MixDoc | null>("undo_mix", { id }),
  redoMix: (id: string) => invoke<MixDoc | null>("redo_mix", { id }),
};
