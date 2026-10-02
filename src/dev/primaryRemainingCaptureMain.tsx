import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { ClipTimeline } from "../components/ClipTimeline";
import { MidiInstrumentPanel } from "../components/MidiInstrumentPanel";
import { MixAssistPanel } from "../components/MixAssistPanel";
import { PianoRoll } from "../components/PianoRoll";
import { ProductionAssistPanel } from "../components/ProductionAssistPanel";
import { RecordTrackPanel } from "../components/RecordTrackPanel";
import { ScoreBranchPanel } from "../components/ScoreBranchPanel";
import { ScorePanel } from "../components/ScorePanel";
import { SheetSage2Panel } from "../components/SheetSage2Panel";
import { createEmptyScoreDocument, type ScoreDocument } from "../lib/score";
import type { MixDoc } from "../lib/types";
import { attachPrimaryButtonMetricsWindow } from "./primaryButtonMetrics";
import {
  buildCaptureDemoMix,
  buildCapturePlaybackSources,
} from "./captureDemoMix";
import { registerCaptureProject } from "./tauriInvokeMock";
import { seedCreateTabCaptureStore } from "./seedCreateTabCaptureStore";
import { useAppStore } from "../store/appStore";
import "../App.css";

seedCreateTabCaptureStore();
const seededProject = useAppStore.getState().project;
if (seededProject) {
  registerCaptureProject(seededProject);
}

export type RemainingCaptureScenario =
  | "record-start"
  | "record-resume"
  | "record-keep"
  | "mix-confirm"
  | "copilot-confirm"
  | "midi-play"
  | "midi-stop"
  | "score-import"
  | "score-quantize"
  | "score-branch"
  | "piano-quantize"
  | "sheetsage"
  | "clip-take";

function parseScenario(hashRaw: string): RemainingCaptureScenario {
  const hash = hashRaw.replace(/^#/, "").toLowerCase();
  if (hash.includes("record-resume")) return "record-resume";
  if (hash.includes("record-keep")) return "record-keep";
  if (hash.includes("record-start") || hash.includes("record-demarrer")) {
    return "record-start";
  }
  if (hash.includes("mix-confirm")) return "mix-confirm";
  if (hash.includes("copilot") || hash.includes("production-assist")) {
    return "copilot-confirm";
  }
  if (hash.includes("midi-stop")) return "midi-stop";
  if (hash.includes("midi-play") || hash.includes("midi-armer")) {
    return "midi-play";
  }
  if (hash.includes("score-quantize")) return "score-quantize";
  if (hash.includes("score-import")) return "score-import";
  if (hash.includes("score-branch")) return "score-branch";
  if (hash.includes("piano")) return "piano-quantize";
  if (hash.includes("sheetsage") || hash.includes("sheet-sage")) {
    return "sheetsage";
  }
  if (hash.includes("clip-take") || hash.includes("prise")) return "clip-take";
  return "record-start";
}

function buildScoreFixture(): ScoreDocument {
  const doc = createEmptyScoreDocument({ id: "capture-score-remaining" });
  const voice = doc.voices[0];
  if (voice) {
    voice.notes = [
      {
        id: "n1",
        pitch: 60,
        startTick: 0,
        durationTick: 480,
        velocity: 90,
      },
    ];
  }
  return doc;
}

function buildTakeMix(): MixDoc {
  const mix = buildCaptureDemoMix(6);
  const track = mix.tracks[0];
  if (!track) return mix;
  const base = {
    sourcePath: "capture/demo.wav",
    sourceSha256: "0",
    offsetMs: 0,
    durationMs: 4000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    takeGroupId: "tg-capture",
  };
  track.clips = [
    {
      ...base,
      id: "clip-take-a",
      trackId: track.id,
      startMs: 0,
      takeIndex: 0,
      takeLabel: "Prise 1",
      takeActive: true,
    },
    {
      ...base,
      id: "clip-take-b",
      trackId: track.id,
      startMs: 0,
      takeIndex: 1,
      takeLabel: "Prise 2",
      takeActive: false,
    },
  ];
  return mix;
}

function useScenario() {
  const [scenario, setScenario] = useState(() =>
    parseScenario(globalThis.location?.hash ?? ""),
  );
  useEffect(() => {
    const sync = () =>
      setScenario(parseScenario(globalThis.location?.hash ?? ""));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return scenario;
}

function RemainingCaptureApp() {
  const scenario = useScenario();
  const projectId = useAppStore.getState().project?.id ?? "proj-capture-demo";
  const [mix, setMix] = useState(() => buildCaptureDemoMix(6));
  const [takeMix, setTakeMix] = useState(() => buildTakeMix());
  const [scoreDoc, setScoreDoc] = useState<ScoreDocument | null>(() =>
    buildScoreFixture(),
  );
  const [midiDoc, setMidiDoc] = useState(() => buildScoreFixture());
  const [pianoDoc, setPianoDoc] = useState(() => buildScoreFixture());
  const sources = useMemo(() => buildCapturePlaybackSources(mix), [mix]);

  useEffect(() => {
    const run = async () => {
      await new Promise((r) => setTimeout(r, 150));
      switch (scenario) {
        case "record-start":
          window.__captureSetRecordPhase?.("armed");
          break;
        case "record-resume":
          window.__captureSetRecordPhase?.("paused");
          break;
        case "record-keep":
          window.__captureSetRecordPhase?.("review", { withTakes: true });
          break;
        case "mix-confirm":
          window.__captureForceMixBalanceConfirm?.();
          break;
        case "copilot-confirm":
          window.__captureForceCopilotConfirm?.();
          break;
        case "midi-stop":
          window.__captureForceMidiRecording?.(true);
          break;
        case "score-quantize":
          window.__captureForceScorePendingImport?.();
          break;
        case "score-branch":
          window.__captureForceScoreBranchMerge?.();
          break;
        case "piano-quantize":
          window.__captureForcePianoQuantize?.();
          break;
        case "sheetsage":
          window.__captureForceSheetsageReady?.();
          break;
        case "clip-take": {
          const block = document.querySelector<HTMLElement>(".clip-block");
          block?.click();
          break;
        }
        default:
          break;
      }
    };
    void run();
  }, [scenario]);

  return (
    <div
      className="app-shell primary-remaining-capture-root"
      data-capture-scenario={scenario}
      data-capture-mock="primary-remaining"
    >
      <main className="main" style={{ padding: "1rem" }}>
        {(scenario === "record-start" ||
          scenario === "record-resume" ||
          scenario === "record-keep") && (
          <RecordTrackPanel
            projectId={projectId}
            open
            onClose={() => {}}
            onTrackAdded={() => {}}
            onError={() => {}}
          />
        )}

        {scenario === "mix-confirm" && (
          <MixAssistPanel
            mix={mix}
            sources={sources}
            listeningMix={mix}
            onCommitMix={setMix}
            onPreviewMix={() => {}}
          />
        )}

        {scenario === "copilot-confirm" && (
          <ProductionAssistPanel
            mix={mix}
            sources={sources}
            listeningMix={mix}
            onCommitMix={setMix}
            onPreviewMix={() => {}}
          />
        )}

        {(scenario === "midi-play" || scenario === "midi-stop") && (
          <div className="panel">
            <MidiInstrumentPanel
              document={midiDoc}
              onDocumentChange={setMidiDoc}
              latencyMs={20}
            />
          </div>
        )}

        {(scenario === "score-import" || scenario === "score-quantize") && (
          <ScorePanel
            projectId={projectId}
            document={scenario === "score-import" ? null : scoreDoc}
            cot="full"
            title="Capture partition"
            onDocumentChange={setScoreDoc}
            onProjectRefresh={async () => {}}
            onError={() => {}}
          />
        )}

        {scenario === "score-branch" && (
          <ScoreBranchPanel
            projectId={projectId}
            document={scoreDoc}
            onDocumentChange={setScoreDoc}
            onProjectRefresh={async () => {}}
            onError={() => {}}
          />
        )}

        {scenario === "piano-quantize" && (
          <PianoRoll document={pianoDoc} onChange={setPianoDoc} />
        )}

        {scenario === "sheetsage" && (
          <SheetSage2Panel
            projectId={projectId}
            form={{
              title: "Capture",
              style: "Piano",
              lyrics: "",
              cot: "melody",
              targetDurationSec: 120,
              preferFullLyrics: true,
              instrumentalMode: false,
            }}
            mix={mix}
            busy={false}
            onConfirmGenerate={async () => {}}
          />
        )}

        {scenario === "clip-take" && (
          <ClipTimeline
            mix={takeMix}
            onChange={setTakeMix}
            peaksByTrack={undefined}
            roleByTrack={Object.fromEntries(
              takeMix.tracks.map((tr) => [tr.id, tr.role]),
            )}
            sourceDurationMsByTrack={{}}
          />
        )}
      </main>
    </div>
  );
}

attachPrimaryButtonMetricsWindow();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RemainingCaptureApp />
  </React.StrictMode>,
);
