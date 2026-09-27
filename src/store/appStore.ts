import { create } from "zustand";
import { api } from "../lib/api";
import type { ScoreDocument } from "../lib/score";
import type {
  AppSettings,
  FormInput,
  GenerationSummary,
  HealthSnapshot,
  JobStatus,
  LibraryRow,
  MixDoc,
  PlaybackSources,
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
  scoreDocument: ScoreDocument | null;
  scoreOpen: boolean;
  error: string | null;
  audioPath: string | null;
  playbackSources: PlaybackSources | null;
  refreshHealth: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshJob: () => Promise<void>;
  refreshLibrary: (q?: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  setForm: (patch: Partial<FormInput>) => void;
  setMix: (mix: MixDoc | null) => void;
  setScoreDocument: (doc: ScoreDocument | null) => void;
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

function asScoreDocument(raw: unknown): ScoreDocument | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as ScoreDocument;
  if (!Array.isArray(doc.voices) || !Array.isArray(doc.tempoMap)) return null;
  return doc;
}

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
  scoreDocument: null,
  scoreOpen: false,
  error: null,
  audioPath: null,
  playbackSources: null,

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
    let scoreDocument: ScoreDocument | null = null;
    try {
      scoreDocument = asScoreDocument(await api.loadScore(id));
    } catch {
      scoreDocument = null;
    }
    let audioPath: string | null = null;
    let playbackSources: PlaybackSources | null = null;
    try {
      playbackSources = await api.playbackSources(id);
      audioPath = playbackSources.generationWav ?? null;
    } catch {
      try {
        audioPath = await api.renderPreview(id);
      } catch {
        audioPath = null;
      }
      playbackSources = null;
    }
    set({
      project,
      mix,
      generations,
      scoreAbc,
      scoreDocument,
      audioPath,
      playbackSources,
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
  setScoreDocument: (scoreDocument) => set({ scoreDocument }),
  setError: (error) => set({ error }),
  setScoreOpen: (scoreOpen) => set({ scoreOpen }),
}));
