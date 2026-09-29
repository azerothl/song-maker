import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as abcjs from "abcjs";
import { ScorePanel } from "../components/ScorePanel";
import { PianoRoll } from "../components/PianoRoll";
import { AbcStaffView } from "../components/AbcStaffView";
import { buildStaffAbc } from "../lib/staffAbc";
import {
  buildReferenceScoreDocument,
  referenceScoreStats,
} from "./referenceScoreDocument";
import "../App.css";

export type BenchPhaseResult = {
  phase: string;
  durationMs: number;
  detail?: Record<string, number | string | boolean>;
};

export type BenchRunResult = {
  stats: ReturnType<typeof referenceScoreStats>;
  abcChars: number;
  abcLines: number;
  phases: BenchPhaseResult[];
  longTasksMs: number;
  longTaskCount: number;
};

const referenceDoc = buildReferenceScoreDocument();
const referenceStats = referenceScoreStats(referenceDoc);
const staffAbc = buildStaffAbc(referenceDoc, "Bench reference");

function pushPhase(
  phases: BenchPhaseResult[],
  phase: string,
  start: number,
  detail?: BenchPhaseResult["detail"],
) {
  phases.push({
    phase,
    durationMs: performance.now() - start,
    detail,
  });
}

/** Mesure synchrone abcjs + reflow forcé (hors React). */
export function benchAbcStaffOnly(abc: string): BenchPhaseResult[] {
  const phases: BenchPhaseResult[] = [];
  const paper = document.createElement("div");
  paper.className = "abc-staff-paper";
  document.body.appendChild(paper);

  const renderStart = performance.now();
  const tunes = abcjs.renderAbc(paper, abc.trim(), {
    add_classes: true,
    responsive: "resize",
    scale: 1,
    paddingtop: 8,
    paddingbottom: 8,
    paddingleft: 8,
    paddingright: 8,
    viewportHorizontal: true,
  });
  pushPhase(phases, "abcjs.renderAbc (legacy responsive: resize)", renderStart, {
    chars: abc.length,
    tunes: tunes.length,
  });

  const layoutStart = performance.now();
  const nodeCount = paper.getElementsByTagName("*").length;
  const paperWidth = paper.offsetWidth;
  const paperHeight = paper.offsetHeight;
  pushPhase(phases, "reflow SVG (offsetWidth/Height)", layoutStart, {
    nodes: nodeCount,
    paperWidth,
    paperHeight,
  });

  paper.remove();
  return phases;
}

export function benchAbcStaffNoResize(abc: string): BenchPhaseResult[] {
  const phases: BenchPhaseResult[] = [];
  const paper = document.createElement("div");
  document.body.appendChild(paper);
  const renderStart = performance.now();
  abcjs.renderAbc(paper, abc.trim(), {
    add_classes: true,
    scale: 1,
    paddingtop: 8,
    paddingbottom: 8,
    paddingleft: 8,
    paddingright: 8,
    viewportHorizontal: true,
  });
  pushPhase(phases, "abcjs.renderAbc (responsive off)", renderStart);
  const layoutStart = performance.now();
  void paper.offsetWidth;
  pushPhase(phases, "reflow SVG (responsive off)", layoutStart, {
    nodes: paper.getElementsByTagName("*").length,
  });
  paper.remove();
  return phases;
}

function BenchShell() {
  const [result, setResult] = useState<BenchRunResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runFullOpen() {
    setRunning(true);
    setResult(null);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));

    const phases: BenchPhaseResult[] = [];
    const openStart = performance.now();

    const container = document.getElementById("bench-score-panel-root");
    if (!container) {
      setRunning(false);
      return;
    }
    container.replaceChildren();

    const root = createRoot(container);
    root.render(
      <ScorePanel
        projectId="bench"
        document={referenceDoc}
        cot="full"
        title="Bench reference"
        onDocumentChange={() => {}}
        onProjectRefresh={async () => {}}
        onError={() => {}}
        defaultOpen
      />,
    );

    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    pushPhase(phases, "ScorePanel mount (1 frame)", openStart);

    const staffWaitStart = performance.now();
    for (let i = 0; i < 300; i++) {
      const svg = container.querySelector(".abc-staff-paper svg");
      if (svg) break;
      await new Promise((r) => setTimeout(r, 16));
    }
    pushPhase(phases, "attente rendu portée (abcjs useEffect)", staffWaitStart, {
      hasSvg: Boolean(container.querySelector(".abc-staff-paper svg")),
    });

    const resizeStart = performance.now();
    for (let i = 0; i < 8; i++) {
      window.dispatchEvent(new Event("resize"));
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    }
    pushPhase(
      phases,
      "rafales resize après montage (post-ouverture)",
      resizeStart,
    );

    pushPhase(phases, "ouverture → portée visible (total)", openStart, {
      hasSvg: Boolean(container.querySelector(".abc-staff-paper svg")),
    });

    const abc =
      staffAbc.ok && staffAbc.abc
        ? staffAbc.abc
        : "";
    const longTasks = (
      window as Window & { __benchLongTasks?: { duration: number }[] }
    ).__benchLongTasks ?? [];
    const longTasksMs = longTasks.reduce((s, t) => s + t.duration, 0);

    setResult({
      stats: referenceStats,
      abcChars: abc.length,
      abcLines: abc.split("\n").length,
      phases,
      longTasksMs,
      longTaskCount: longTasks.length,
    });
    setRunning(false);
  }

  return (
    <div className="bench-score-tab" style={{ padding: 16 }}>
      <h1>Bench — ouverture onglet Partition</h1>
      <pre data-bench-stats>{JSON.stringify(referenceStats, null, 2)}</pre>
      <button
        type="button"
        id="bench-run-full"
        className="btn primary"
        disabled={running}
        onClick={() => void runFullOpen()}
      >
        Monter ScorePanel (référence)
      </button>
      <div id="bench-score-panel-root" />
      {result && (
        <pre id="bench-result" data-testid="bench-result">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function installLongTaskCollector() {
  const w = window as Window & { __benchLongTasks?: { duration: number }[] };
  w.__benchLongTasks = [];
  try {
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        w.__benchLongTasks!.push({ duration: entry.duration });
      }
    });
    obs.observe({ type: "longtask", buffered: true });
  } catch {
    // PerformanceObserver longtask indisponible (ex. certains WebViews).
  }
}

installLongTaskCollector();

async function benchAbcStaffViewOnly(): Promise<BenchPhaseResult[]> {
  const phases: BenchPhaseResult[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const abc = staffAbc.ok ? staffAbc.abc : "";
  const start = performance.now();
  const root = createRoot(container);
  root.render(
    <AbcStaffView abc={abc} playbackReady={false} warnings={[]} />,
  );
  for (let i = 0; i < 300; i++) {
    if (container.querySelector(".abc-staff-paper svg")) break;
    await new Promise((r) => setTimeout(r, 16));
  }
  pushPhase(phases, "AbcStaffView seul → SVG", start);
  root.unmount();
  container.remove();
  return phases;
}

async function benchPianoRollMount(): Promise<BenchPhaseResult[]> {
  const phases: BenchPhaseResult[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const start = performance.now();
  root.render(
    <PianoRoll
      document={referenceDoc}
      onChange={() => {}}
      onError={() => {}}
    />,
  );
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  pushPhase(phases, "PianoRoll mount (hidden tabpanel path)", start, {
    noteButtons: referenceStats.noteCount,
    gridWidthPx: referenceStats.pianoRollWidthPx,
  });
  root.unmount();
  container.remove();
  return phases;
}

function benchViewportResizeLayout(
  abc: string,
  useResponsiveResize: boolean,
  passes = 8,
): BenchPhaseResult {
  const paper = document.createElement("div");
  paper.id = `bench-paper-${useResponsiveResize ? "resize" : "off"}`;
  paper.style.width = "800px";
  document.body.appendChild(paper);

  abcjs.renderAbc(paper, abc.trim(), {
    add_classes: true,
    ...(useResponsiveResize ? { responsive: "resize" as const } : {}),
    scale: 1,
    viewportHorizontal: true,
    paddingtop: 8,
    paddingbottom: 8,
    paddingleft: 8,
    paddingright: 8,
  });

  const start = performance.now();
  for (let i = 0; i < passes; i++) {
    window.innerWidth; // ensure layout context
    window.dispatchEvent(new Event("resize"));
    void paper.offsetWidth;
    void paper.querySelector("svg")?.getBoundingClientRect();
  }
  const durationMs = performance.now() - start;
  paper.remove();
  return {
    phase: useResponsiveResize
      ? "layout après resize (viewportHorizontal + responsive: resize)"
      : "layout après resize (viewportHorizontal, responsive off)",
    durationMs,
    detail: { passes },
  };
}

function benchAbcResizeStorm(abc: string, passes = 5): BenchPhaseResult[] {
  const phases: BenchPhaseResult[] = [];
  const paper = document.createElement("div");
  paper.style.width = "800px";
  document.body.appendChild(paper);
  abcjs.renderAbc(paper, abc.trim(), {
    add_classes: true,
    responsive: "resize",
    scale: 1,
    viewportHorizontal: true,
  });
  const stormStart = performance.now();
  for (let i = 0; i < passes; i++) {
    paper.style.width = `${720 + i * 40}px`;
    window.dispatchEvent(new Event("resize"));
    void paper.offsetWidth;
  }
  pushPhase(phases, `resize storm (${passes}×, responsive: resize)`, stormStart);
  paper.remove();
  return phases;
}

const api = {
  referenceDoc,
  referenceStats,
  staffAbcText: staffAbc.ok ? staffAbc.abc : "",
  benchAbcStaffOnly,
  benchAbcStaffNoResize,
  benchPianoRollMount,
  benchAbcResizeStorm,
  async runMicrobenches(): Promise<{
    stats: ReturnType<typeof referenceScoreStats>;
    abcChars: number;
    withResize: BenchPhaseResult[];
    withoutResize: BenchPhaseResult[];
    abcStaffViewOnly: BenchPhaseResult[];
    pianoRoll: BenchPhaseResult[];
    resizeStorm: BenchPhaseResult[];
    viewportResizeLegacy: BenchPhaseResult;
    viewportResizeFixed: BenchPhaseResult;
  }> {
    const abc = staffAbc.ok ? staffAbc.abc : "";
    return {
      stats: referenceStats,
      abcChars: abc.length,
      withResize: benchAbcStaffOnly(abc),
      withoutResize: benchAbcStaffNoResize(abc),
      abcStaffViewOnly: await benchAbcStaffViewOnly(),
      pianoRoll: await benchPianoRollMount(),
      resizeStorm: benchAbcResizeStorm(abc),
      viewportResizeLegacy: benchViewportResizeLayout(abc, true),
      viewportResizeFixed: benchViewportResizeLayout(abc, false),
    };
  },
};

declare global {
  interface Window {
    __scoreTabBench?: typeof api;
  }
}

window.__scoreTabBench = api;

const boot = document.getElementById("bench-root");
if (boot) {
  createRoot(boot).render(<BenchShell />);
}

export { PianoRoll, AbcStaffView, referenceDoc };
