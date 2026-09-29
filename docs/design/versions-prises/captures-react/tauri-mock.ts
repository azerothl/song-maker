import {
  generations,
  mixVersions,
  project,
  PROJECT_ID,
  scores,
  separations,
} from "./fixtures";

type InvokeArgs = Record<string, unknown> | undefined;

let projectState = { ...project, generationNames: { ...project.generationNames } };

function cloneProject(): typeof projectState {
  return {
    ...projectState,
    generationNames: { ...projectState.generationNames },
  };
}

export function isTauri(): boolean {
  return false;
}

export function convertFileSrc(path: string): string {
  return path;
}

export async function invoke<T>(cmd: string, args?: InvokeArgs): Promise<T> {
  const id = (args?.id as string) ?? PROJECT_ID;
  switch (cmd) {
    case "get_health":
      return {
        cudaAvailable: true,
        accelerationKind: "nvidiaCuda",
        gpuName: "NVIDIA (capture)",
        suggestedPack: "q4",
        modelsOk: true,
        binaryOk: true,
        serverHealthy: true,
        message: "Capture harness",
      } as T;
    case "get_job_status":
      return { state: "idle", label: "" } as T;
    case "get_settings":
      return {
        projectsDir: "/tmp",
        cacheDir: "/tmp",
        binaryTag: "mock",
        binaryArchive: "mock",
        binarySha256: "mock",
        modelPack: "q4",
        modelGguf: "mock",
        modelSha256: "mock",
        serverHost: "127.0.0.1",
        serverPort: 8080,
      } as T;
    case "list_projects":
      return [
        {
          id: PROJECT_ID,
          title: projectState.title,
          folderPath: `/tmp/${PROJECT_ID}`,
          createdAt: projectState.createdAt,
          updatedAt: projectState.updatedAt,
        },
      ] as T;
    case "open_project":
      return cloneProject() as T;
    case "load_mix":
      return null;
    case "list_generations":
      return generations as T;
    case "read_score_abc":
      return "" as T;
    case "load_score":
      return null as T;
    case "playback_sources":
      return { mode: "generation", generationWav: null, stems: [] } as T;
    case "render_preview":
      return null as T;
    case "load_separation_info":
      return null as T;
    case "list_separation_versions_cmd":
      return separations as T;
    case "list_scores":
      return scores as T;
    case "list_mix_versions":
      return mixVersions as T;
    case "save_project_form":
      return cloneProject() as T;
    case "use_generation": {
      const genId = args?.genId as string;
      projectState = {
        ...projectState,
        activeGenerationId: genId,
        updatedAt: new Date().toISOString(),
      };
      return cloneProject() as T;
    }
    case "rename_generation": {
      const genId = args?.genId as string;
      const name = String(args?.name ?? "").trim();
      const next = { ...projectState.generationNames };
      if (name) next[genId] = name;
      else delete next[genId];
      projectState = { ...projectState, generationNames: next };
      return cloneProject() as T;
    }
    case "save_mix_version":
    case "activate_separation_version":
      return cloneProject() as T;
    case "load_production_overlay_disk":
      return null as T;
    default:
      console.warn("[capture-mock] invoke non géré:", cmd, args);
      return null as T;
  }
}
