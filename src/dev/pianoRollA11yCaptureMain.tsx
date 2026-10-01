import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PianoRoll } from "../components/PianoRoll";
import { createEmptyScoreDocument, type ScoreDocument } from "../lib/score";
import "../App.css";

function buildFixture(): ScoreDocument {
  const doc = createEmptyScoreDocument({ id: "piano-a11y-246" });
  const voice = doc.voices[0];
  if (!voice) throw new Error("voice missing");
  voice.name = "Mélodie";
  voice.role = "melody";
  voice.abcVoice = "Ins";
  voice.notes = [
    { id: "n1", startTick: 0, durationTick: 480, pitch: 60, velocity: 90 },
    { id: "n2", startTick: 480, durationTick: 240, pitch: 64, velocity: 80 },
    { id: "n3", startTick: 960, durationTick: 480, pitch: 67, velocity: 95 },
    { id: "n4", startTick: 1440, durationTick: 960, pitch: 72, velocity: 70 },
  ];
  return doc;
}

function CaptureApp() {
  const [doc, setDoc] = useState(buildFixture);
  return (
    <main className="piano-a11y-capture" data-capture-root>
      <h1>Piano roll a11y (#246)</h1>
      <PianoRoll document={doc} onChange={setDoc} />
    </main>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<CaptureApp />);
}
