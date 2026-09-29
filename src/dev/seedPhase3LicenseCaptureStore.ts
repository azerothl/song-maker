import { useAppStore } from "../store/appStore";
import type { AppSettings, Phase3Status } from "../lib/types";

export const PHASE3_CAPTURE_SETTINGS: AppSettings = {
  projectsDir: "/tmp/song-maker-projects",
  cacheDir: "/tmp/song-maker-cache",
  binaryTag: "capture",
  binaryArchive: "capture.zip",
  binarySha256: "",
  modelPack: "q4",
  modelGguf: "yue2-3b-q4_0.gguf",
  modelSha256: "",
  serverHost: "127.0.0.1",
  serverPort: 8765,
  localYue2Enabled: true,
  yue2LicenseAccepted: true,
  ccByNcAccepted: true,
  stemSeparator: "htdemucs",
  acceptedSeparatorLicenses: {},
};

export const PHASE3_CAPTURE_STATUS: Phase3Status = {
  stemSeparator: "htdemucs",
  htdemucsAvailable: true,
  bsRoformerAvailable: false,
  melBandRoformerAvailable: false,
  htdemucs6sRuntimeAvailable: false,
  acceptedSeparatorLicenses: {},
  ccByNcAccepted: true,
  separatorTimeStats: {},
  guitarPianoAvailable: false,
  honestyFr: "HTDemucs : quatre stems. Guitare et piano non exposés par audio.cpp.",
  bsRoformerPath: "",
  melBandRoformerPath: "",
};

export function seedPhase3LicenseCaptureStore(): void {
  useAppStore.setState({
    settings: PHASE3_CAPTURE_SETTINGS,
    health: {
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
      message: "Capture navigateur.",
    },
  });
}
