import { createRoot } from "react-dom/client";
import { ExportDialog } from "../components/ExportDialog";
import type { MixDoc, PlaybackSources, ProjectDoc } from "../lib/types";
import "../App.css";

const project: ProjectDoc = {
  schema: "project",
  schemaVersion: 1,
  id: "proj-zindex",
  title: "Z-index fixture",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  sampleRate: 48000,
  channels: 2,
  bitDepth: 24,
  style: "",
  lyrics: "",
  cot: "full",
  targetDurationSec: 180,
  activeGenerationId: "gen-zindex",
  activeMixId: "mix-zindex",
};

const mix: MixDoc = {
  schema: "song-maker.mix",
  schemaVersion: 1,
  id: "mix-zindex",
  separationId: "sep-zindex",
  sampleRate: 48000,
  masterGainDb: 0,
  peakCeilingDb: -1,
  tracks: [
    {
      id: "tr-1",
      role: "vocals",
      name: "Voix",
      gainDb: 0,
      pan: 0,
      mute: false,
      solo: false,
      locked: false,
      aiSeparated: true,
      clips: [
        {
          id: "clip-1",
          trackId: "tr-1",
          sourcePath: "vocals.wav",
          sourceSha256: "x",
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

const sources: PlaybackSources = {
  mode: "stems",
  generationWav: "gen.wav",
  label: "fixture",
  stems: [
    { trackId: "tr-1", role: "vocals", name: "Voix", path: "vocals.wav" },
  ],
};

createRoot(document.getElementById("root")!).render(
  <div className="fixture-shell">
    <div className="production-mix-sticky-master">
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
    <div
      className="blocking-ruler clip-ruler"
      data-testid="blocking-ruler"
      aria-hidden="true"
    />
  </div>,
);
