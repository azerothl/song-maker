import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ClipTimeline } from "../components/ClipTimeline";
import type { MixDoc } from "../lib/types";
import "../App.css";

declare global {
  interface Window {
    __arrangementMix?: MixDoc;
    __setArrangementMix?: (next: MixDoc) => void;
  }
}

const fixtureMix: MixDoc = {
  schema: "song-maker.mix",
  schemaVersion: 1,
  id: "arrangement-fixture",
  separationId: "sep-fixture",
  sampleRate: 44100,
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
      aiSeparated: false,
      clips: [
        {
          id: "clip-1",
          trackId: "tr-1",
          sourcePath: "vocals.wav",
          sourceSha256: "fixture",
          startMs: 0,
          durationMs: 12_000,
          offsetMs: 0,
          gainDb: 0,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    },
  ],
  tempoMap: [{ startMs: 0, quarterBpm: 120 }],
  timeSignatures: [{ startMs: 0, numerator: 4, denominator: 4 }],
  markers: [
    {
      id: "mk-verse",
      name: "Couplet",
      kind: "verse",
      startMs: 8_000,
    },
  ],
};

function Harness() {
  const [mix, setMix] = useState<MixDoc>(fixtureMix);

  useEffect(() => {
    window.__arrangementMix = mix;
    window.__setArrangementMix = setMix;
  }, [mix]);

  return (
    <main className="main">
      <div className="panel">
        <ClipTimeline
          mix={mix}
          onChange={setMix}
          clipViewPrefs={{
            snapEnabled: false,
            gridMode: "time",
            subdivision: 4,
            zoom: 1,
          }}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
