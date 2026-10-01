import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import * as abcjs from "abcjs";
import { ScorePanel } from "../components/ScorePanel";
import { PianoRoll } from "../components/PianoRoll";
import { AbcStaffView } from "../components/AbcStaffView";
import { buildStaffAbc } from "../lib/staffAbc";
import {
  buildPianoNotesIndex,
  filterNotesInPianoViewportIndexed,
} from "../lib/pianoRollViewport";
import type { ScoreDocument } from "@song-maker/score-engine";
import {
  buildLongReferenceScoreDocument,
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

export type StaffToPianoBenchResult = {
  stats: ReturnType<typeof referenceScoreStats>;
  staffToPianoMs: number;
  pianoNoteButtonsDom: number;
  pianoGridWidthPx: number;
  pianoRollFocusable: boolean;
  longTasksMs: number;
  longTaskCount: number;
};

const referenceDoc = buildReferenceScoreDocument();
const longReferenceDoc = buildLongReferenceScoreDocument();
const referenceStats = referenceScoreStats(referenceDoc);
const longReferenceStats = referenceScoreStats(longReferenceDoc);
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

async function measureScorePanelOpen(
  scoreDoc: ScoreDocument,
  title: string,
): Promise<BenchRunResult> {
  const phases: BenchPhaseResult[] = [];
  const stats = referenceScoreStats(scoreDoc);
  const staffBuilt = buildStaffAbc(scoreDoc, title);
  const openStart = performance.now();

  const container = document.getElementById("bench-score-panel-root");
  if (!container) {
    throw new Error("bench-score-panel-root missing");
  }
  container.replaceChildren();

  const root = createRoot(container);
  root.render(
    <ScorePanel
      projectId="bench"
      document={scoreDoc}
      cot="full"
      title={title}
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

  const abc = staffBuilt.ok && staffBuilt.abc ? staffBuilt.abc : "";
  const longTasks = (
    window as Window & { __benchLongTasks?: { duration: number }[] }
  ).__benchLongTasks ?? [];
  const longTasksMs = longTasks.reduce((s, t) => s + t.duration, 0);

  return {
    stats,
    abcChars: abc.length,
    abcLines: abc.split("\n").length,
    phases,
    longTasksMs,
    longTaskCount: longTasks.length,
  };
}

function BenchShell() {
  const [result, setResult] = useState<BenchRunResult | null>(null);
  const [longResult, setLongResult] = useState<BenchRunResult | null>(null);
  const [running, setRunning] = useState(false);

  async function runFullOpen() {
    setRunning(true);
    setResult(null);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    (
      window as Window & { __benchLongTasks?: { duration: number }[] }
    ).__benchLongTasks = [];
    const measured = await measureScorePanelOpen(
      referenceDoc,
      "Bench reference",
    );
    setResult(measured);
    setRunning(false);
  }

  async function runLongOpen() {
    setRunning(true);
    setLongResult(null);
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    (
      window as Window & { __benchLongTasks?: { duration: number }[] }
    ).__benchLongTasks = [];
    const measured = await measureScorePanelOpen(
      longReferenceDoc,
      "Bench long reference",
    );
    setLongResult(measured);
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
      <button
        type="button"
        id="bench-run-long"
        className="btn"
        disabled={running}
        onClick={() => void runLongOpen()}
      >
        Monter ScorePanel (longue, ~8×)
      </button>
      <pre data-bench-long-stats>{JSON.stringify(longReferenceStats, null, 2)}</pre>
      <div id="bench-score-panel-root" />
      <div id="bench-staff-piano-root" />
      {result && (
        <pre id="bench-result" data-testid="bench-result">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
      {longResult && (
        <pre id="bench-result-long" data-testid="bench-result-long">
          {JSON.stringify(longResult, null, 2)}
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
  container.style.width = "900px";
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
  for (let i = 0; i < 60; i++) {
    const grid = container.querySelector(".piano-grid") as HTMLElement | null;
    const notes = container.querySelectorAll(".piano-note").length;
    if (grid && grid.offsetWidth > 1000 && notes > 0) break;
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
  const layoutStart = performance.now();
  const grid = container.querySelector(".piano-grid") as HTMLElement | null;
  const gridWidthPx = grid?.offsetWidth ?? 0;
  const noteButtonsDom = container.querySelectorAll(".piano-note").length;
  pushPhase(phases, "PianoRoll mount (hidden tabpanel path)", start, {
    noteCount: referenceStats.noteCount,
    noteButtonsDom,
    gridWidthPx,
  });
  pushPhase(phases, "PianoRoll reflow grille", layoutStart, {
    gridWidthPx,
    noteButtonsDom,
  });
  root.unmount();
  container.remove();
  return phases;
}

async function measureStaffToPianoSwitch(
  scoreDoc: ScoreDocument,
  title: string,
): Promise<StaffToPianoBenchResult> {
  const stats = referenceScoreStats(scoreDoc);
  const container = document.getElementById("bench-staff-piano-root");
  if (!container) {
    throw new Error("bench-staff-piano-root missing");
  }
  container.replaceChildren();

  const root = createRoot(container);
  root.render(
    <ScorePanel
      projectId="bench"
      document={scoreDoc}
      cot="full"
      title={title}
      onDocumentChange={() => {}}
      onProjectRefresh={async () => {}}
      onError={() => {}}
      defaultOpen
    />,
  );

  for (let i = 0; i < 300; i++) {
    if (container.querySelector(".abc-staff-paper svg")) break;
    await new Promise((r) => setTimeout(r, 16));
  }

  const pianoTab = container.querySelector(
    "#score-view-piano",
  ) as HTMLButtonElement | null;
  if (!pianoTab) {
    throw new Error("score-view-piano tab missing");
  }

  const switchStart = performance.now();
  pianoTab.click();

  for (let i = 0; i < 300; i++) {
    const roll = container.querySelector(".piano-roll");
    const grid = container.querySelector(".piano-grid");
    if (roll && grid) break;
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  await new Promise((r) => requestAnimationFrame(() => r(undefined)));

  const staffToPianoMs = performance.now() - switchStart;
  const grid = container.querySelector(".piano-grid") as HTMLElement | null;
  const pianoGridWidthPx = grid?.offsetWidth ?? 0;
  const pianoNoteButtonsDom = container.querySelectorAll(".piano-note").length;
  const pianoRollFocusable = Boolean(
    container.querySelector(".piano-roll[tabindex='0']"),
  );

  const longTasks = (
    window as Window & { __benchLongTasks?: { duration: number }[] }
  ).__benchLongTasks ?? [];
  const longTasksMs = longTasks.reduce((s, t) => s + t.duration, 0);

  root.unmount();
  container.replaceChildren();

  return {
    stats,
    staffToPianoMs,
    pianoNoteButtonsDom,
    pianoGridWidthPx,
    pianoRollFocusable,
    longTasksMs,
    longTaskCount: longTasks.length,
  };
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

export type PianoFocusScrollProbe = {
  partition: string;
  focusedNoteId: string;
  activeNoteId: string | null;
  activeElementIsBody: boolean;
  focusKeptOnNote: boolean;
  activeBeforeScroll: boolean;
  noteStillMounted: boolean;
};

export type PianoRollFocusStealProbe = {
  focusOnRoll: boolean;
  activeElementTag: string;
};

export type PianoScrollCostProbe = {
  partition: string;
  noteCount: number;
  frames: number;
  totalScriptMs: number;
  meanScriptMs: number;
  maxScriptMs: number;
  visibleNoteCounts: number[];
  visibleDomChanges: number;
  indexedFilterTotalMs: number;
  indexedFilterMeanMs: number;
};

export type PianoFocusBlurReleaseProbe = {
  focusedNoteId: string;
  noteStillMountedAfterBlurScroll: boolean;
  hasProductionDataPianoAttrs: boolean;
};

async function waitPianoRollNotes(container: ParentNode): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if (container.querySelectorAll(".piano-note").length > 0) return;
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
  throw new Error("piano notes not mounted");
}

async function waitAnimationFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
  }
}

async function measurePianoScrollCost(
  scoreDoc: ScoreDocument,
  partition: string,
  frames = 240,
): Promise<PianoScrollCostProbe> {
  document
    .querySelectorAll("#bench-piano-focus-root, #bench-staff-piano-root")
    .forEach((el) => el.remove());
  const container = document.createElement("div");
  container.id = "bench-piano-focus-root";
  container.style.width = "900px";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    <PianoRoll document={scoreDoc} onChange={() => {}} onError={() => {}} />,
  );
  await waitPianoRollNotes(container);

  const scrollEl = container.querySelector(".piano-scroll") as HTMLElement | null;
  if (!scrollEl) {
    root.unmount();
    container.remove();
    throw new Error("piano scroll missing");
  }

  const maxLeft = Math.max(0, scrollEl.scrollWidth - scrollEl.clientWidth);
  /** Pas réaliste (~60 px) : le bench Alphonse mesurait le coût script, pas un seek plein-écran. */
  const stepPx = 60;
  const samples: number[] = [];
  const visibleNoteCounts: number[] = [];
  let left = 0;
  let visibleChanges = 0;
  let lastVisible = -1;

  for (let i = 0; i < frames; i++) {
    left = Math.min(maxLeft, left + stepPx);
    const t0 = performance.now();
    scrollEl.scrollLeft = left;
    scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        samples.push(performance.now() - t0);
        resolve();
      });
    });
    await waitAnimationFrames(1);
    const count = container.querySelectorAll(".piano-note").length;
    if (count !== lastVisible) {
      visibleChanges += 1;
      lastVisible = count;
    }
    visibleNoteCounts.push(count);
  }

  // Microbench filtre indexé (sans React) — même fenêtres que le scroll.
  const notes = scoreDoc.voices.flatMap((v) => v.notes);
  const index = buildPianoNotesIndex(notes, 0.04);
  let filterMs = 0;
  for (let i = 0; i < frames; i++) {
    const sl = Math.min(maxLeft, i * stepPx);
    const t1 = performance.now();
    filterNotesInPianoViewportIndexed(index, sl, scrollEl.clientWidth || 900);
    filterMs += performance.now() - t1;
  }

  const totalScriptMs = samples.reduce((a, b) => a + b, 0);
  const result: PianoScrollCostProbe = {
    partition,
    noteCount: notes.length,
    frames,
    totalScriptMs,
    meanScriptMs: totalScriptMs / frames,
    maxScriptMs: Math.max(...samples),
    visibleNoteCounts: [
      visibleNoteCounts[0] ?? 0,
      visibleNoteCounts[Math.floor(frames / 2)] ?? 0,
      visibleNoteCounts[frames - 1] ?? 0,
    ],
    visibleDomChanges: visibleChanges,
    indexedFilterTotalMs: filterMs,
    indexedFilterMeanMs: filterMs / frames,
  };

  root.unmount();
  container.remove();
  return result;
}

async function probePianoNoteFocusAfterScroll(
  scoreDoc: ScoreDocument,
  partition: string,
): Promise<PianoFocusScrollProbe> {
  document
    .querySelectorAll("#bench-piano-focus-root, #bench-staff-piano-root")
    .forEach((el) => el.remove());
  const container = document.createElement("div");
  container.id = "bench-piano-focus-root";
  container.style.width = "900px";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    <PianoRoll document={scoreDoc} onChange={() => {}} onError={() => {}} />,
  );
  await waitPianoRollNotes(container);

  const scrollEl = container.querySelector(".piano-scroll") as HTMLElement;
  const firstNote = container.querySelector(
    ".piano-note",
  ) as HTMLButtonElement | null;
  if (!scrollEl || !firstNote) {
    root.unmount();
    container.remove();
    throw new Error("piano roll scroll or note missing");
  }

  const focusedNoteId = firstNote.dataset.noteId ?? "";
  firstNote.focus();
  await waitAnimationFrames(8);
  scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
  await waitAnimationFrames(8);
  const activeBeforeScroll = document.activeElement === firstNote;
  scrollEl.scrollLeft = scrollEl.scrollWidth;
  scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
  for (let i = 0; i < 180; i++) {
    const active = document.activeElement as HTMLElement | null;
    if (active?.dataset?.noteId === focusedNoteId) break;
    await waitAnimationFrames(1);
  }

  const active = document.activeElement as HTMLElement | null;
  const activeNoteId =
    active instanceof HTMLButtonElement && active.classList.contains("piano-note")
      ? active.dataset.noteId ?? null
      : null;
  const noteStillMounted = Boolean(
    container.querySelector(`button.piano-note[data-note-id="${focusedNoteId}"]`),
  );
  const result: PianoFocusScrollProbe = {
    partition,
    focusedNoteId,
    activeNoteId,
    activeElementIsBody: active === document.body,
    focusKeptOnNote: activeNoteId === focusedNoteId,
    activeBeforeScroll,
    noteStillMounted,
  };

  root.unmount();
  container.remove();
  return result;
}

async function probePianoRollFocusNotStolenOnScroll(
  scoreDoc: ScoreDocument,
): Promise<PianoRollFocusStealProbe> {
  document
    .querySelectorAll("#bench-piano-focus-root, #bench-staff-piano-root")
    .forEach((el) => el.remove());
  const container = document.createElement("div");
  container.id = "bench-piano-focus-root";
  container.style.width = "900px";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    <PianoRoll document={scoreDoc} onChange={() => {}} onError={() => {}} />,
  );
  await waitPianoRollNotes(container);

  const scrollEl = container.querySelector(".piano-scroll") as HTMLElement;
  const roll = container.querySelector(".piano-roll") as HTMLElement | null;
  if (!scrollEl || !roll) {
    root.unmount();
    container.remove();
    throw new Error("piano roll missing");
  }

  roll.focus();
  await waitAnimationFrames(4);
  scrollEl.scrollLeft = 12_000;
  scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
  await waitAnimationFrames(30);

  const result: PianoRollFocusStealProbe = {
    focusOnRoll: document.activeElement === roll,
    activeElementTag: document.activeElement?.tagName ?? "",
  };

  root.unmount();
  container.remove();
  return result;
}

async function probePianoFocusedNoteReleasedOnBlur(
  scoreDoc: ScoreDocument,
): Promise<PianoFocusBlurReleaseProbe> {
  document
    .querySelectorAll("#bench-piano-focus-root, #bench-staff-piano-root")
    .forEach((el) => el.remove());
  const container = document.createElement("div");
  container.id = "bench-piano-focus-root";
  container.style.width = "900px";
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(
    <PianoRoll document={scoreDoc} onChange={() => {}} onError={() => {}} />,
  );
  await waitPianoRollNotes(container);

  const scrollEl = container.querySelector(".piano-scroll") as HTMLElement;
  const grid = container.querySelector(".piano-grid") as HTMLElement | null;
  const firstNote = container.querySelector(
    ".piano-note",
  ) as HTMLButtonElement | null;
  const roll = container.querySelector(".piano-roll") as HTMLElement | null;
  if (!scrollEl || !firstNote || !roll || !grid) {
    root.unmount();
    container.remove();
    throw new Error("piano roll blur probe missing nodes");
  }

  const focusedNoteId = firstNote.dataset.noteId ?? "";
  firstNote.focus();
  await waitAnimationFrames(4);
  roll.focus();
  await waitAnimationFrames(4);
  scrollEl.scrollLeft = scrollEl.scrollWidth;
  scrollEl.dispatchEvent(new Event("scroll", { bubbles: true }));
  await waitAnimationFrames(60);

  const hasProductionDataPianoAttrs = Array.from(grid.attributes).some((attr) =>
    attr.name.startsWith("data-piano-"),
  );
  const result: PianoFocusBlurReleaseProbe = {
    focusedNoteId,
    noteStillMountedAfterBlurScroll: Boolean(
      container.querySelector(`button.piano-note[data-note-id="${focusedNoteId}"]`),
    ),
    hasProductionDataPianoAttrs,
  };

  root.unmount();
  container.remove();
  return result;
}

const api = {
  referenceDoc,
  longReferenceDoc,
  referenceStats,
  longReferenceStats,
  staffAbcText: staffAbc.ok ? staffAbc.abc : "",
  measureScorePanelOpen,
  measureStaffToPianoSwitch,
  probePianoNoteFocusAfterScroll,
  probePianoRollFocusNotStolenOnScroll,
  measurePianoScrollCost,
  probePianoFocusedNoteReleasedOnBlur,
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
