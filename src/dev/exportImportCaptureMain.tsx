import { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ExportDialog } from "../components/ExportDialog";
import type { MixDoc, PlaybackSources, ProjectDoc } from "../lib/types";
import "../App.css";

const project: ProjectDoc = {
  schema: "project",
  schemaVersion: 1,
  id: "proj-import-only",
  title: "Import only",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  sampleRate: 48000,
  channels: 2,
  bitDepth: 24,
  style: "",
  lyrics: "",
  cot: "full",
  targetDurationSec: 180,
  activeGenerationId: null,
  activeSeparationId: null,
  activeMixId: "mix-import-only",
};

const importMix: MixDoc = {
  schema: "song-maker.mix",
  schemaVersion: 1,
  id: "mix-import-only",
  separationId: "none",
  sampleRate: 48000,
  masterGainDb: 0,
  peakCeilingDb: -1,
  tracks: [
    {
      id: "tr-user",
      role: "other",
      name: "Import",
      gainDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      locked: false,
      aiSeparated: false,
      clips: [
        {
          id: "clip-1",
          trackId: "tr-user",
          sourcePath: "user/import.wav",
          sourceSha256: "fixture",
          startMs: 0,
          offsetMs: 0,
          durationMs: 12_000,
          gainDb: 0,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    },
  ],
};

const emptyMix: MixDoc = {
  ...importMix,
  id: "mix-empty",
  tracks: [
    {
      ...importMix.tracks[0]!,
      clips: [],
    },
  ],
};

const sourcesWithStem: PlaybackSources = {
  mode: "stems",
  generationId: null,
  generationWav: null,
  label: "Import",
  stems: [
    {
      trackId: "tr-user",
      role: "other",
      name: "Import",
      path: "user/import.wav",
    },
  ],
};

function Harness() {
  const scene = (globalThis.location?.hash ?? "#with-audio").replace(/^#/, "");
  const withAudio = scene !== "empty";
  const mix = useMemo(() => (withAudio ? importMix : emptyMix), [withAudio]);
  const sources = useMemo(
    () => (withAudio ? sourcesWithStem : null),
    [withAudio],
  );

  return (
    <main className="main">
      <div className="panel">
        <ExportDialog
          project={project}
          mix={mix}
          sources={sources}
          busy={false}
          onBusy={() => {}}
          onError={() => {}}
          initialMode="mix"
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
