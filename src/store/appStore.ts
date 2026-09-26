import { create } from "zustand";
import { api } from "../lib/api";
import type {
  AppSettings,
  FormInput,
  GenerationSummary,
  HealthSnapshot,
  JobStatus,
  LibraryRow,
  MixDoc,
  ProjectDoc,
  Screen,
} from "../lib/types";

type AppStore = {
  screen: Screen;
  setScreen: (s: Screen) => void;
  health: HealthSnapshot | null;
  settings: AppSettings | null;
  job: JobStatus | null;
  projects: LibraryRow[];
  project: ProjectDoc | null;
  form: FormInput;
  mix: MixDoc | null;
  generations: GenerationSummary[];
  scoreAbc: string | null;
  scoreOpen: boolean;
  error: string | null;
  audioPath: string | null;
  refreshHealth: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshJob: () => Promise<void>;
  refreshLibrary: (q?: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  setForm: (patch: Partial<FormInput>) => void;
  setMix: (mix: MixDoc | null) => void;
  setError: (e: string | null) => void;
  setScoreOpen: (v: boolean) => void;
};

const emptyForm = (): FormInput => ({
  title: "",
  style: "",
  lyrics: "",
  cot: "full",
  singingLanguage: null,
  tempoBpm: null,
  key: null,
  meter: null,
  seed: null,
});

export const useAppStore = create<AppStore>((set, get) => ({
  screen: "splash",
  setScreen: (screen) => set({ screen }),
  health: null,
  settings: null,
  job: null,
  projects: [],
  project: null,
  form: emptyForm(),
  mix: null,
  generations: [],
  scoreAbc: null,
  scoreOpen: false,
  error: null,
  audioPath: null,

  refreshHealth: async () => {
    try {
      const health = await api.getHealth();
      set({ health });
    } catch (e) {
      set({ error: String(e) });
    }
  },
  refreshSettings: async () => {
    const settings = await api.getSettings();
    set({ settings });
  },
  refreshJob: async () => {
    const job = await api.getJobStatus();
    set({ job });
  },
  refreshLibrary: async (q) => {
    const projects = await api.listProjects(q);
    set({ projects });
  },
  openProject: async (id) => {
    const project = await api.openProject(id);
    const mix = await api.loadMix(id);
    const generations = await api.listGenerations(id);
    let scoreAbc: string | null = null;
    if (project.activeGenerationId) {
      scoreAbc = await api.readScoreAbc(id, project.activeGenerationId);
    }
    let audioPath: string | null = null;
    try {
      audioPath = await api.renderPreview(id);
    } catch {
      audioPath = null;
    }
    set({
      project,
      mix,
      generations,
      scoreAbc,
      audioPath,
      form: {
        title: project.title,
        style: project.style,
        lyrics: project.lyrics,
        cot: project.cot,
        singingLanguage: project.singingLanguage ?? null,
        tempoBpm: project.tempoBpm ?? null,
        key: project.key ?? null,
        meter: project.meter ?? null,
        seed: null,
      },
      screen: "song",
      error: null,
    });
  },
  setForm: (patch) => set({ form: { ...get().form, ...patch } }),
  setMix: (mix) => set({ mix }),
  setError: (error) => set({ error }),
  setScoreOpen: (scoreOpen) => set({ scoreOpen }),
}));
