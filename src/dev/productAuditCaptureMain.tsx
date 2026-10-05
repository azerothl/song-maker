import { useEffect, useState } from "react";
import "../App.css";
import { createRoot } from "react-dom/client";
import { AceStepAbPanel } from "../components/AceStepAbPanel";
import { CandidateCompare } from "../components/CandidateCompare";
import { BatchTaskRow } from "../components/BatchGenerationPanel";
import type { GenerationSummary } from "../lib/types";

// Real media clocks are needed to catch a restart caused by parent polling.
function tone(frequency: number): string {
  const rate = 8000;
  const samples = rate * 12;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i * frequency * Math.PI * 2 / rate) * 1000, true);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}
const generations: GenerationSummary[] = [
  { id: "gen-001", createdAt: "2026-10-05", seed: 1, cot: "full", state: "generated", hasScore: false, canContinue: false, engineId: "yue2_3b", audioPath: tone(220) },
  { id: "gen-002", createdAt: "2026-10-05", seed: 2, cot: "off", state: "generated", hasScore: false, canContinue: false, engineId: "ace_step_1_5", audioPath: tone(330) },
];
function Harness() {
  const [poll, setPoll] = useState(0);
  const [used, setUsed] = useState("");
  useEffect(() => { const id = setInterval(() => setPoll(value => value + 1), 100); return () => clearInterval(id); }, []);
  const refreshed = generations.map(generation => ({ ...generation }));
  return <main>
    <output id="poll">{poll}</output><output id="used">{used}</output>
    <AceStepAbPanel generations={refreshed} busy={false} onGenerateAceStep={async () => {}} />
    <CandidateCompare generations={refreshed} activeId="gen-001" busy={false} candidateCount={2} onCandidateCount={() => {}} onGenerateBatch={async () => {}} onUse={setUsed} />
    <ul id="batch" className="batch-tasks"><BatchTaskRow task={{ taskId: "take-2", songId: "song", variantIndex: 2, seed: 2, title: "Batch demo", projectId: "project", generationId: "gen-002", audioPath: generations[1].audioPath, state: "succeeded" }} onOpen={() => setUsed("opened")} /></ul>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
