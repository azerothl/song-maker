import type {
  FormInput,
  PlaybackSources,
  ProjectDoc,
} from "../lib/types";
import { CAPTURE_PROJECT_ID } from "./seedCreateTabCaptureStore";

let project: ProjectDoc | null = null;

function ensureProject(): ProjectDoc {
  if (!project) {
    throw new Error("Capture mock : projet non initialisé.");
  }
  return project;
}

const emptyPlayback: PlaybackSources = {
  mode: "empty",
  generationWav: null,
  stems: [],
  label: "",
};

export function isTauri(): boolean {
  return false;
}

/** Stub navigateur : pas de conversion asset:// */
export function convertFileSrc(filePath: string): string {
  return filePath;
}

/** Stubs pour les imports transitifs (plugin-updater). */
export class Channel<T = unknown> {
  id: string;
  constructor(onMessage?: (message: T) => void) {
    this.id = "capture-channel";
    void onMessage;
  }
  static _new<T>(_callback: (message: T) => void): Channel<T> {
    return new Channel(_callback);
  }
}

export class Resource {
  async close(): Promise<void> {}
}

export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  switch (cmd) {
    case "open_project": {
      const id = String(args?.id ?? CAPTURE_PROJECT_ID);
      if (id !== CAPTURE_PROJECT_ID || !project) {
        throw new Error(`Projet inconnu : ${id}`);
      }
      return project as T;
    }
    case "save_project_form": {
      const id = String(args?.id ?? "");
      const form = args?.form as FormInput | undefined;
      const base = ensureProject();
      if (id !== base.id || !form) return base as T;
      project = {
        ...base,
        title: form.title,
        style: form.style,
        lyrics: form.lyrics,
        cot: form.cot,
        singingLanguage: form.singingLanguage,
        tempoBpm: form.tempoBpm,
        key: form.key,
        meter: form.meter,
        targetDurationSec: form.targetDurationSec,
        preferFullLyrics: form.preferFullLyrics,
        instrumentalMode: form.instrumentalMode,
        updatedAt: new Date().toISOString(),
      };
      return project as T;
    }
    case "load_mix":
      return null as T;
    case "list_generations":
      return [] as T;
    case "load_score":
      return null as T;
    case "playback_sources":
      return emptyPlayback as T;
    case "render_preview":
      return null as T;
    case "load_separation_info":
      return null as T;
    case "save_production_overlay":
    case "load_production_overlay":
      return null as T;
    case "load_production_overlay_disk":
      return null as T;
    default:
      console.warn(`[capture mock] invoke non géré : ${cmd}`);
      return null as T;
  }
}

/** Appelé par la page capture après construction du ProjectDoc. */
export function registerCaptureProject(doc: ProjectDoc): void {
  project = doc;
}
