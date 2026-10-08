import { registerCaptureProject } from "./tauriInvokeMock";
import { useAppStore } from "../store/appStore";
import type { HealthSnapshot, LibraryRow, ProjectDoc } from "../lib/types";

export const SIDEBAR_CAPTURE_PROJECT_ID = "capture-sidebar-library";

function sidebarCaptureProject(): ProjectDoc {
  const now = "2026-09-29T12:00:00.000Z";
  return {
    schema: "song-maker/project",
    schemaVersion: 1,
    id: SIDEBAR_CAPTURE_PROJECT_ID,
    title: "Morceau bibliothèque",
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

function libraryRow(): LibraryRow {
  const now = "2026-09-29T12:00:00.000Z";
  return {
    id: SIDEBAR_CAPTURE_PROJECT_ID,
    title: "Morceau bibliothèque",
    folderPath: "/tmp/capture",
    createdAt: now,
    updatedAt: now,
    durationMs: 180_000,
    status: "empty",
    cot: "full",
    activeGenerationId: null,
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
  localYue2Enabled: true,
  modelsOk: true,
  binaryOk: true,
  serverHealthy: true,
  serverUrl: null,
  generationModelId: "yue2",
  generationModel: "YuE2 Q4",
  generationModelAvailable: true,
  generationModelLoaded: false,
  message: "Capture navigateur — backend mocké.",
};

/** État minimal Bibliothèque + projet ouvrable pour le harness sidebar (#165). */
export function seedSidebarCaptureStore(): void {
  const doc = sidebarCaptureProject();
  registerCaptureProject(doc);
  useAppStore.setState({
    health: captureHealth,
    projects: [libraryRow()],
    project: null,
    screen: "library",
    error: null,
    job: null,
  });
}
