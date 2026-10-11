import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { writeUserLibrary } from "../lib/userLibrary";
import { useAppStore } from "../store/appStore";
import { seedProfilesCaptureStore } from "./seedProfilesCaptureStore";
import {
  registerCaptureGenerations,
  registerCaptureLibraryProjects,
} from "./tauriInvokeMock";
import { writeSidebarCollapsedPref } from "../lib/sidebarCollapse";
import "../App.css";

const projectId = "capture-profile";
const generationId = "gen-001";
const audioPath = "capture://nuit-claire.wav";

let releaseWaveform: (() => void) | null = null;
const waveformGate = new Promise<{ peaks: number[]; duration: number }>((resolve) => {
  releaseWaveform = () => resolve({
    peaks: Array.from({ length: 320 }, (_, index) => {
      const phrase = Math.sin((index / 320) * Math.PI * 8);
      const pulse = Math.max(0.08, Math.abs(phrase) * (0.45 + 0.35 * Math.abs(Math.sin(index / 7))));
      return pulse;
    }),
    duration: 8,
  });
});

declare global {
  interface Window {
    __captureGenerationWaveform?: () => Promise<{ peaks: number[]; duration: number }>;
    __captureReleaseGenerationWaveform?: () => void;
  }
}

window.__captureGenerationWaveform = () => waveformGate;
window.__captureReleaseGenerationWaveform = () => releaseWaveform?.();

function captureWav(): ArrayBuffer {
  const sampleRate = 48_000;
  const seconds = 8;
  const channels = 2;
  const frames = sampleRate * seconds;
  const dataBytes = frames * channels * 2;
  const bytes = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(bytes);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let frame = 0; frame < frames; frame += 1) {
    const time = frame / sampleRate;
    const pulse = 0.12 + 0.62 * Math.pow(Math.max(0, Math.sin(time * Math.PI * 2 * 1.8)), 3);
    const left = pulse * (0.55 * Math.sin(time * Math.PI * 2 * 220) + 0.2 * Math.sin(time * Math.PI * 2 * 330));
    const right = pulse * (0.5 * Math.sin(time * Math.PI * 2 * 220) + 0.22 * Math.sin(time * Math.PI * 2 * 440));
    const offset = 44 + frame * channels * 2;
    view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, left)) * 32767), true);
    view.setInt16(offset + 2, Math.round(Math.max(-1, Math.min(1, right)) * 32767), true);
  }
  return bytes;
}

const nativeFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const requestUrl = input instanceof Request ? input.url : String(input);
  if (requestUrl === audioPath) {
    return Promise.resolve(new Response(captureWav(), {
      headers: { "content-type": "audio/wav" },
    }));
  }
  return nativeFetch(input, init);
}) as typeof window.fetch;

writeSidebarCollapsedPref(false);
seedProfilesCaptureStore();
registerCaptureLibraryProjects([
  {
    id: projectId,
    title: "Nuit claire",
    folderPath: "/capture/Nuit-claire",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-10-10T18:20:00.000Z",
    durationMs: 180_000,
    status: "generated",
    cot: "full",
    activeGenerationId: generationId,
  },
]);
registerCaptureGenerations([
  {
    id: generationId,
    createdAt: "2026-10-10T18:20:00.000Z",
    seed: 42,
    cot: "full",
    state: "generated",
    hasScore: false,
    canContinue: true,
    engineId: "yue2_3b",
    audioPath,
  },
]);
writeUserLibrary("profile-001", {
  version: 1,
  tracks: [{
    projectId,
    generationId,
    title: "Nuit claire",
    addedAt: "2026-10-10T18:20:00.000Z",
    playlistIds: ["playlist-favorites"],
  }],
  playlists: [{
    id: "playlist-favorites",
    title: "Favoris",
    createdAt: "2026-10-10T18:20:00.000Z",
  }],
});
useAppStore.setState({
  screen: "library",
  project: {
    schema: "songmaker.project",
    schemaVersion: 1,
    id: projectId,
    title: "Nuit claire",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-10-10T18:20:00.000Z",
    sampleRate: 48_000,
    channels: 2,
    bitDepth: 16,
    style: "",
    lyrics: "",
    cot: "full",
    activeGenerationId: generationId,
  },
  playbackSources: {
    mode: "generation",
    generationId,
    generationWav: audioPath,
    stems: [],
    label: "Nuit claire",
  },
  playerSelection: null,
});

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
