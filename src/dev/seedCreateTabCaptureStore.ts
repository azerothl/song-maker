import { useAppStore } from "../store/appStore";
import type { FormInput, HealthSnapshot, ProjectDoc } from "../lib/types";

const CAPTURE_PROJECT_ID = "capture-create-tab";

function captureProject(): ProjectDoc {
  const now = "2026-09-29T12:00:00.000Z";
  return {
    schema: "song-maker/project",
    schemaVersion: 1,
    id: CAPTURE_PROJECT_ID,
    title: "Projet capture",
    createdAt: now,
    updatedAt: now,
    sampleRate: 44100,
    channels: 2,
    bitDepth: 16,
    style: "",
    lyrics: "",
    cot: "full",
    targetDurationSec: 180,
    preferFullLyrics: true,
    instrumentalMode: false,
    activeGenerationId: null,
    activeSeparationId: null,
    activeMixId: null,
    activeScoreId: null,
  };
}

function captureForm(): FormInput {
  return {
    title: "Projet capture",
    style: "",
    lyrics: "",
    cot: "full",
    singingLanguage: null,
    tempoBpm: null,
    key: null,
    meter: null,
    seed: null,
    targetDurationSec: 180,
    preferFullLyrics: true,
    instrumentalMode: false,
    continuationGenerationId: null,
  };
}

const captureHealth: HealthSnapshot = {
  cudaAvailable: true,
  accelerationKind: "nvidiaCuda",
  gpuName: "Capture (mock)",
  driverVersion: "560.00",
  vramMib: 12288,
  suggestedPack: "q4",
  suggestedPackReasonFr: "Capture navigateur.",
  modelsOk: true,
  binaryOk: true,
  serverHealthy: true,
  serverUrl: null,
  message: "Capture navigateur — backend mocké.",
};

/** État minimal pour afficher l’onglet Créer dans Chromium (sans Tauri). */
export function seedCreateTabCaptureStore(): void {
  useAppStore.setState({
    screen: "song",
    health: captureHealth,
    settings: null,
    job: { state: "idle", label: "" },
    projects: [],
    project: captureProject(),
    form: captureForm(),
    mix: null,
    generations: [],
    scoreAbc: null,
    scoreDocument: null,
    scoreOpen: false,
    error: null,
    audioPath: null,
    playbackSources: null,
  });
}

export { CAPTURE_PROJECT_ID };
