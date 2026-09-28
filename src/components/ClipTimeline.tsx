import { createClipEditor, type Clip as EngineClip } from "@song-maker/score-engine";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildRulerMarks,
  ensureMixArrangement,
  formatMusical,
  msToMusical,
  newMarkerId,
  removeMixMarker,
  removeTempoEvent,
  snapMs,
  upsertMixMarker,
  upsertTempoEvent,
  type GridMode,
  type MusicalSubdivision,
} from "../lib/musicalTime";
import { roleWaveColor, withAlpha } from "../lib/trackRoleColors";
import type {
  MixClip,
  MixDoc,
  MixMarker,
  MixMarkerKind,
  MixTrack,
  Meter,
} from "../lib/types";
import { t } from "../ui/i18n";

const TIME_SNAP_MS = 50;
const EDGE_PX = 6;
const FADE_HANDLE_PX = 8;
const MIN_DURATION_MS = 50;
const NUDGE_MS = 50;

const MARKER_KINDS: MixMarkerKind[] = [
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "interlude",
  "outro",
  "other",
];

type Props = {
  mix: MixDoc;
  onChange: (next: MixDoc) => void;
  peaksByTrack?: Record<string, Float32Array>;
  roleByTrack?: Record<string, string>;
  sourceDurationMsByTrack?: Record<string, number>;
  /** Project form tempo — used only when mix has no tempo map. */
  projectTempoBpm?: number | null;
  projectMeter?: Meter | null;
};

type DragKind = "move" | "trim-left" | "trim-right" | "fade-in" | "fade-out";

type DragState = {
  kind: DragKind;
  trackId: string;
  clipId: string;
  originX: number;
  originClip: MixClip;
  railWidth: number;
};

function toEngine(clip: MixClip): EngineClip {
  return { ...clip };
}

function fromEngine(clip: EngineClip): MixClip {
  return { ...clip };
}

function formatMs(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const rest = (s % 60).toFixed(1);
  return `${m}:${rest.padStart(4, "0")}`;
}

function estimateSourceMs(
  track: MixTrack,
  sourceDurationMsByTrack?: Record<string, number>,
): number {
  const provided = sourceDurationMsByTrack?.[track.id];
  if (provided && provided > 0) return provided;
  let max = 1;
  for (const c of track.clips) {
    max = Math.max(max, c.offsetMs + c.durationMs);
  }
  return max;
}

function slicePeaksForClip(
  peaks: Float32Array | undefined,
  clip: MixClip,
  sourceMs: number,
  buckets = 64,
): Float32Array | null {
  if (!peaks || peaks.length === 0 || sourceMs <= 0 || clip.durationMs <= 0) {
    return null;
  }
  const start = Math.min(
    peaks.length - 1,
    Math.max(0, Math.floor((clip.offsetMs / sourceMs) * peaks.length)),
  );
  const end = Math.min(
    peaks.length,
    Math.max(
      start + 1,
      Math.ceil(((clip.offsetMs + clip.durationMs) / sourceMs) * peaks.length),
    ),
  );
  const span = end - start;
  const out = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    const a = start + Math.floor((i / buckets) * span);
    const b = start + Math.floor(((i + 1) / buckets) * span);
    let max = 0;
    for (let j = a; j < Math.max(a + 1, b); j++) {
      max = Math.max(max, peaks[j] ?? 0);
    }
    out[i] = max;
  }
  return out;
}

function drawClipWave(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  color: string,
) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 40;
  const height = canvas.clientHeight || 36;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const mid = height / 2;
  const barW = width / peaks.length;
  ctx.fillStyle = withAlpha(color, 0.85);
  for (let i = 0; i < peaks.length; i++) {
    const amp = Math.max(1, peaks[i]! * mid * 0.9);
    ctx.fillRect(i * barW, mid - amp, Math.max(1, barW * 0.8), amp * 2);
  }
}

function hitZone(
  localX: number,
  width: number,
  clip: MixClip,
): DragKind | "body" {
  if (width <= 0) return "body";
  if (localX <= EDGE_PX) return "trim-left";
  if (localX >= width - EDGE_PX) return "trim-right";
  const fadeInPx =
    clip.durationMs > 0 ? (clip.fadeInMs / clip.durationMs) * width : 0;
  const fadeOutPx =
    clip.durationMs > 0 ? (clip.fadeOutMs / clip.durationMs) * width : 0;
  if (Math.abs(localX - fadeInPx) <= FADE_HANDLE_PX) return "fade-in";
  if (Math.abs(localX - (width - fadeOutPx)) <= FADE_HANDLE_PX) return "fade-out";
  return "body";
}

function ClipWaveCanvas({
  peaks,
  color,
}: {
  peaks: Float32Array | null;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const ro = new ResizeObserver(() => drawClipWave(canvas, peaks, color));
    ro.observe(canvas);
    drawClipWave(canvas, peaks, color);
    return () => ro.disconnect();
  }, [peaks, color]);
  if (!peaks) return null;
  return <canvas ref={ref} className="clip-block-wave" aria-hidden="true" />;
}

function markerKindLabel(kind: MixMarkerKind): string {
  switch (kind) {
    case "intro":
      return t("clips.marker.kind.intro");
    case "verse":
      return t("clips.marker.kind.verse");
    case "prechorus":
      return t("clips.marker.kind.prechorus");
    case "chorus":
      return t("clips.marker.kind.chorus");
    case "bridge":
      return t("clips.marker.kind.bridge");
    case "interlude":
      return t("clips.marker.kind.interlude");
    case "outro":
      return t("clips.marker.kind.outro");
    case "other":
      return t("clips.marker.kind.other");
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function ClipTimeline({
  mix: rawMix,
  onChange,
  peaksByTrack,
  roleByTrack,
  sourceDurationMsByTrack,
  projectTempoBpm,
  projectMeter,
}: Props) {
  const mix = useMemo(
    () => ensureMixArrangement(rawMix, projectTempoBpm, projectMeter),
    [rawMix, projectTempoBpm, projectMeter],
  );
  const editor = useMemo(() => createClipEditor(), []);
  const [selected, setSelected] = useState<{
    trackId: string;
    clipId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridMode, setGridMode] = useState<GridMode>("musical");
  const [subdivision, setSubdivision] = useState<MusicalSubdivision>(4);
  const [zoom, setZoom] = useState(1);
  const [cutAtMs, setCutAtMs] = useState<number | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [newMarkerKind, setNewMarkerKind] = useState<MixMarkerKind>("verse");
  const [newMarkerName, setNewMarkerName] = useState("");
  const [shiftClipsWithMarker, setShiftClipsWithMarker] = useState(true);
  const [tempoBpmDraft, setTempoBpmDraft] = useState(
    mix.tempoMap?.[0]?.quarterBpm ?? 120,
  );
  const [tempoAtDraft, setTempoAtDraft] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  const railScrollRef = useRef<HTMLDivElement | null>(null);

  const tempoMap = mix.tempoMap ?? [];
  const meterMap = mix.timeSignatures ?? [];
  const markers = mix.markers ?? [];

  useEffect(() => {
    setTempoBpmDraft(mix.tempoMap?.[0]?.quarterBpm ?? 120);
  }, [mix.tempoMap]);

  // Persist defaults once so markers/tempo survive reopen (clips unchanged).
  useEffect(() => {
    if (
      !rawMix.tempoMap?.length ||
      !rawMix.timeSignatures?.length ||
      rawMix.markers === undefined
    ) {
      if (
        mix.tempoMap !== rawMix.tempoMap ||
        mix.timeSignatures !== rawMix.timeSignatures ||
        mix.markers !== rawMix.markers
      ) {
        onChange(mix);
      }
    }
    // Only on first mount / when raw lacks arrangement fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMix.id]);

  const selectedClip = useMemo(() => {
    if (!selected) return null;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    return track?.clips.find((c) => c.id === selected.clipId) ?? null;
  }, [mix, selected]);

  const selectedMarker = useMemo(
    () => markers.find((m) => m.id === selectedMarkerId) ?? null,
    [markers, selectedMarkerId],
  );

  const timelineMs = useMemo(() => {
    let max = 1;
    for (const tr of mix.tracks) {
      for (const c of tr.clips) {
        max = Math.max(max, c.startMs + c.durationMs);
      }
    }
    for (const m of markers) {
      max = Math.max(max, m.startMs + 1000);
    }
    for (const e of tempoMap) {
      max = Math.max(max, e.startMs + 1000);
    }
    return Math.max(max, 30_000);
  }, [mix, markers, tempoMap]);

  const snap = useCallback(
    (ms: number) =>
      snapMs(ms, {
        enabled: snapEnabled,
        mode: gridMode,
        tempoMap,
        meterMap,
        subdivision,
        timeSnapMs: TIME_SNAP_MS,
      }),
    [snapEnabled, gridMode, tempoMap, meterMap, subdivision],
  );

  const nudgeStep = useMemo(() => {
    if (!snapEnabled) return NUDGE_MS;
    if (gridMode === "time") return TIME_SNAP_MS;
    // One subdivision at current tempo (bar 1).
    const beatMs = 60_000 / (tempoMap[0]?.quarterBpm ?? 120);
    return Math.max(1, Math.round(beatMs / subdivision));
  }, [snapEnabled, gridMode, tempoMap, subdivision]);

  const rulerMarks = useMemo(
    () => buildRulerMarks(timelineMs, gridMode, tempoMap, meterMap, subdivision),
    [timelineMs, gridMode, tempoMap, meterMap, subdivision],
  );

  const patchMix = useCallback(
    (next: MixDoc) => {
      onChange(next);
    },
    [onChange],
  );

  const patchTrackClips = useCallback(
    (trackId: string, clips: MixClip[]) => {
      patchMix({
        ...mix,
        tracks: mix.tracks.map((tr) =>
          tr.id === trackId ? { ...tr, clips } : tr,
        ),
      });
    },
    [mix, patchMix],
  );

  const applyEdits = useCallback(
    (
      track: MixTrack,
      requests: Parameters<ReturnType<typeof createClipEditor>["apply"]>[1][],
    ) => {
      setError(null);
      try {
        let engineClips = track.clips.map(toEngine);
        for (const request of requests) {
          engineClips = editor.apply(engineClips, request);
        }
        const next = engineClips.map(fromEngine);
        patchTrackClips(track.id, next);
        const lastReq = requests[requests.length - 1];
        if (
          lastReq &&
          (lastReq.kind === "duplicate" || lastReq.kind === "cut")
        ) {
          const last = next[next.length - 1];
          if (last && last.id !== lastReq.clipId) {
            setSelected({ trackId: track.id, clipId: last.id });
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [editor, patchTrackClips],
  );

  const applyEdit = useCallback(
    (
      track: MixTrack,
      request: Parameters<ReturnType<typeof createClipEditor>["apply"]>[1],
    ) => {
      applyEdits(track, [request]);
    },
    [applyEdits],
  );

  function updateSelectedNumeric(
    field: "startMs" | "offsetMs" | "durationMs" | "fadeInMs" | "fadeOutMs",
    value: number,
  ) {
    if (!selected || !selectedClip) return;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    if (!track) return;
    setError(null);
    try {
      if (field === "startMs") {
        applyEdit(track, {
          kind: "move",
          clipId: selected.clipId,
          startMs: snap(value),
        });
      } else if (field === "fadeInMs" || field === "fadeOutMs") {
        applyEdit(track, {
          kind: "fade",
          clipId: selected.clipId,
          fadeInMs: field === "fadeInMs" ? value : selectedClip.fadeInMs,
          fadeOutMs: field === "fadeOutMs" ? value : selectedClip.fadeOutMs,
        });
      } else {
        applyEdit(track, {
          kind: "trim",
          clipId: selected.clipId,
          offsetMs: field === "offsetMs" ? value : selectedClip.offsetMs,
          durationMs: field === "durationMs" ? value : selectedClip.durationMs,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const dragCtxRef = useRef({
    mix,
    snap,
    timelineMs,
    applyEdit,
    applyEdits,
  });
  dragCtxRef.current = { mix, snap, timelineMs, applyEdit, applyEdits };

  useEffect(() => {
    function applyDrag(ds: DragState, clientX: number) {
      const ctx = dragCtxRef.current;
      const track = ctx.mix.tracks.find((tr) => tr.id === ds.trackId);
      if (!track) return;
      const deltaMs =
        ds.railWidth <= 0
          ? 0
          : ((clientX - ds.originX) / ds.railWidth) * ctx.timelineMs;
      const clip = ds.originClip;
      const snapFn = ctx.snap;

      switch (ds.kind) {
        case "move": {
          const startMs = snapFn(clip.startMs + deltaMs);
          ctx.applyEdit(track, { kind: "move", clipId: clip.id, startMs });
          break;
        }
        case "trim-left": {
          const rawDelta = snapFn(clip.startMs + deltaMs) - clip.startMs;
          let startMs = clip.startMs + rawDelta;
          let offsetMs = clip.offsetMs + rawDelta;
          let durationMs = clip.durationMs - rawDelta;
          if (durationMs < MIN_DURATION_MS) {
            const fix = MIN_DURATION_MS - durationMs;
            durationMs = MIN_DURATION_MS;
            startMs -= fix;
            offsetMs -= fix;
          }
          if (offsetMs < 0) {
            startMs -= offsetMs;
            durationMs += offsetMs;
            offsetMs = 0;
          }
          if (startMs < 0) {
            offsetMs -= startMs;
            durationMs += startMs;
            startMs = 0;
          }
          ctx.applyEdits(track, [
            {
              kind: "move",
              clipId: clip.id,
              startMs: Math.max(0, Math.round(startMs)),
            },
            {
              kind: "trim",
              clipId: clip.id,
              offsetMs: Math.max(0, Math.round(offsetMs)),
              durationMs: Math.max(MIN_DURATION_MS, Math.round(durationMs)),
            },
          ]);
          break;
        }
        case "trim-right": {
          const durationMs = Math.max(
            MIN_DURATION_MS,
            snapFn(clip.startMs + clip.durationMs + deltaMs) - clip.startMs,
          );
          ctx.applyEdit(track, {
            kind: "trim",
            clipId: clip.id,
            offsetMs: clip.offsetMs,
            durationMs,
          });
          break;
        }
        case "fade-in": {
          const fadeInMs = snapFn(
            Math.min(
              clip.durationMs - clip.fadeOutMs,
              Math.max(0, clip.fadeInMs + deltaMs),
            ),
          );
          ctx.applyEdit(track, {
            kind: "fade",
            clipId: clip.id,
            fadeInMs,
            fadeOutMs: clip.fadeOutMs,
          });
          break;
        }
        case "fade-out": {
          const fadeOutMs = snapFn(
            Math.min(
              clip.durationMs - clip.fadeInMs,
              Math.max(0, clip.fadeOutMs - deltaMs),
            ),
          );
          ctx.applyEdit(track, {
            kind: "fade",
            clipId: clip.id,
            fadeInMs: clip.fadeInMs,
            fadeOutMs,
          });
          break;
        }
        default: {
          const _exhaustive: never = ds.kind;
          void _exhaustive;
        }
      }
    }

    function onMove(e: PointerEvent) {
      const ds = dragRef.current;
      if (!ds) return;
      applyDrag(ds, e.clientX);
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function onClipPointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    track: MixTrack,
    clip: MixClip,
  ) {
    const rail = e.currentTarget.parentElement;
    if (!rail) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const width = rect.width;
    const zone = hitZone(localX, width, clip);
    const atMs = clip.startMs + (localX / Math.max(1, width)) * clip.durationMs;

    setSelected({ trackId: track.id, clipId: clip.id });
    setCutAtMs(atMs);
    setSelectedMarkerId(null);

    if (e.altKey) {
      e.preventDefault();
      applyEdit(track, {
        kind: "cut",
        clipId: clip.id,
        atMs: Math.round(atMs),
      });
      return;
    }

    const kind: DragKind = zone === "body" ? "move" : zone;
    dragRef.current = {
      kind,
      trackId: track.id,
      clipId: clip.id,
      originX: e.clientX,
      originClip: { ...clip },
      railWidth: rail.clientWidth,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onTimelineKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!selected || !selectedClip) return;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    if (!track) return;
    const step = nudgeStep;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -step : step;
      applyEdit(track, {
        kind: "move",
        clipId: selected.clipId,
        startMs: snap(Math.max(0, selectedClip.startMs + delta)),
      });
    }
  }

  function cutSelected() {
    if (!selected || !selectedClip) return;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    if (!track) return;
    const mid =
      selectedClip.startMs + Math.floor(selectedClip.durationMs / 2);
    let atMs = cutAtMs ?? mid;
    if (
      atMs <= selectedClip.startMs ||
      atMs >= selectedClip.startMs + selectedClip.durationMs
    ) {
      atMs = mid;
    }
    applyEdit(track, {
      kind: "cut",
      clipId: selected.clipId,
      atMs: Math.round(atMs),
    });
  }

  function addMarkerAt(ms: number) {
    const startMs = snap(ms);
    const kind = newMarkerKind;
    const name =
      newMarkerName.trim() || markerKindLabel(kind);
    const marker: MixMarker = {
      id: newMarkerId(),
      name,
      kind,
      startMs,
    };
    patchMix(upsertMixMarker(mix, marker));
    setSelectedMarkerId(marker.id);
    setNewMarkerName("");
  }

  function jumpToMarker(marker: MixMarker) {
    setSelectedMarkerId(marker.id);
    const scroller = railScrollRef.current;
    if (!scroller) return;
    const ratio = marker.startMs / timelineMs;
    const target =
      ratio * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  function updateSelectedMarker(patch: Partial<MixMarker>) {
    if (!selectedMarker) return;
    const next: MixMarker = { ...selectedMarker, ...patch };
    patchMix(
      upsertMixMarker(mix, next, {
        shiftClips: shiftClipsWithMarker && patch.startMs != null,
        previousStartMs: selectedMarker.startMs,
      }),
    );
  }

  function commitTempoChange() {
    const bpm = Math.max(1, Math.min(400, Math.round(tempoBpmDraft)));
    const startMs = snap(Math.max(0, tempoAtDraft));
    // Tempo map is display/snap only — never rewrite clip ms or source offsets.
    patchMix(upsertTempoEvent(mix, { startMs, quarterBpm: bpm }));
  }

  const railWidthPct = `${Math.max(100, zoom * 100)}%`;
  const stepForInputs =
    gridMode === "musical" && snapEnabled ? nudgeStep : snapEnabled ? TIME_SNAP_MS : 100;

  return (
    <div
      className="clip-timeline"
      tabIndex={0}
      onKeyDown={onTimelineKeyDown}
    >
      <div className="clip-timeline-header">
        <h3>{t("clips.title")}</h3>
        <span className="hint">{t("clips.hint")}</span>
        <div className="clip-timeline-tools">
          <label className="clip-tool-check">
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(e) => setSnapEnabled(e.target.checked)}
            />
            <span>
              {gridMode === "musical"
                ? t("clips.snapMusical")
                : t("clips.snap", { ms: TIME_SNAP_MS })}
            </span>
          </label>
          <label className="clip-tool-select">
            <span>{t("clips.gridMode")}</span>
            <select
              value={gridMode}
              onChange={(e) => setGridMode(e.target.value as GridMode)}
            >
              <option value="musical">{t("clips.gridMusical")}</option>
              <option value="time">{t("clips.gridTime")}</option>
            </select>
          </label>
          {gridMode === "musical" && (
            <label className="clip-tool-select">
              <span>{t("clips.subdivision")}</span>
              <select
                value={subdivision}
                onChange={(e) =>
                  setSubdivision(Number(e.target.value) as MusicalSubdivision)
                }
              >
                <option value={1}>{t("clips.sub.quarter")}</option>
                <option value={2}>{t("clips.sub.eighth")}</option>
                <option value={4}>{t("clips.sub.sixteenth")}</option>
                <option value={8}>{t("clips.sub.thirtysecond")}</option>
              </select>
            </label>
          )}
          <label className="clip-tool-zoom">
            <span>{t("clips.zoom")}</span>
            <input
              type="range"
              min={1}
              max={4}
              step={0.25}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="clip-arrangement-bar">
        <div className="clip-tempo-editor">
          <strong>{t("clips.tempoMap")}</strong>
          <label>
            <span>{t("clips.tempoBpm")}</span>
            <input
              type="number"
              min={40}
              max={400}
              value={tempoBpmDraft}
              onChange={(e) => setTempoBpmDraft(Number(e.target.value))}
            />
          </label>
          <label>
            <span>{t("clips.tempoAt")}</span>
            <input
              type="number"
              min={0}
              step={stepForInputs}
              value={tempoAtDraft}
              onChange={(e) => setTempoAtDraft(Number(e.target.value))}
            />
          </label>
          <button type="button" className="btn" onClick={commitTempoChange}>
            {t("clips.tempoAdd")}
          </button>
          <ul className="clip-tempo-list">
            {tempoMap.map((ev) => (
              <li key={`${ev.startMs}-${ev.quarterBpm}`}>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => {
                    setTempoAtDraft(ev.startMs);
                    setTempoBpmDraft(ev.quarterBpm);
                  }}
                >
                  {formatMs(ev.startMs)} · {ev.quarterBpm} BPM
                </button>
                {ev.startMs > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      patchMix(removeTempoEvent(mix, ev.startMs))
                    }
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">{t("clips.tempoHint")}</p>
        </div>

        <div className="clip-marker-editor">
          <strong>{t("clips.markers")}</strong>
          <label>
            <span>{t("clips.markerKind")}</span>
            <select
              value={newMarkerKind}
              onChange={(e) =>
                setNewMarkerKind(e.target.value as MixMarkerKind)
              }
            >
              {MARKER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {markerKindLabel(k)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("clips.markerName")}</span>
            <input
              type="text"
              value={newMarkerName}
              placeholder={markerKindLabel(newMarkerKind)}
              onChange={(e) => setNewMarkerName(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => addMarkerAt(selectedClip?.startMs ?? 0)}
          >
            {t("clips.markerAdd")}
          </button>
          <label className="clip-tool-check">
            <input
              type="checkbox"
              checked={shiftClipsWithMarker}
              onChange={(e) => setShiftClipsWithMarker(e.target.checked)}
            />
            <span>{t("clips.markerShiftClips")}</span>
          </label>
          {markers.length > 0 && (
            <ul className="clip-marker-nav">
              {markers.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className={
                      selectedMarkerId === m.id ? "btn active" : "btn"
                    }
                    onClick={() => jumpToMarker(m)}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedMarker && (
            <div className="clip-marker-selected">
              <label>
                <span>{t("clips.markerName")}</span>
                <input
                  type="text"
                  value={selectedMarker.name}
                  onChange={(e) =>
                    updateSelectedMarker({ name: e.target.value })
                  }
                />
              </label>
              <label>
                <span>{t("clips.markerStart")}</span>
                <input
                  type="number"
                  min={0}
                  step={stepForInputs}
                  value={selectedMarker.startMs}
                  onChange={(e) =>
                    updateSelectedMarker({
                      startMs: snap(Number(e.target.value)),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  patchMix(removeMixMarker(mix, selectedMarker.id));
                  setSelectedMarkerId(null);
                }}
              >
                {t("clips.markerDelete")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="clip-lanes-scroll" ref={railScrollRef}>
        <div className="clip-lanes" style={{ width: railWidthPct }}>
          <div className="clip-ruler" aria-hidden="true">
            <span className="clip-lane-label" />
            <div className="clip-ruler-marks-abs">
              {rulerMarks.map((mark, i) => (
                <span
                  key={`${mark.ms}-${i}`}
                  className={
                    mark.major ? "clip-ruler-tick major" : "clip-ruler-tick"
                  }
                  style={{ left: `${(mark.ms / timelineMs) * 100}%` }}
                  title={
                    gridMode === "musical"
                      ? formatMusical(
                          msToMusical(mark.ms, tempoMap, meterMap, subdivision),
                        )
                      : formatMs(mark.ms)
                  }
                >
                  {mark.label}
                </span>
              ))}
            </div>
          </div>
          <div className="clip-marker-lane">
            <span className="clip-lane-label">{t("clips.markers")}</span>
            <div className="clip-lane-rail clip-marker-rail">
              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={
                    selectedMarkerId === m.id
                      ? "clip-marker-flag active"
                      : "clip-marker-flag"
                  }
                  style={{ left: `${(m.startMs / timelineMs) * 100}%` }}
                  title={`${m.name} · ${formatMs(m.startMs)}`}
                  onClick={() => jumpToMarker(m)}
                >
                  <span className="clip-marker-flag-label">{m.name}</span>
                </button>
              ))}
              {tempoMap
                .filter((e) => e.startMs > 0)
                .map((e) => (
                  <span
                    key={`tempo-${e.startMs}`}
                    className="clip-tempo-flag"
                    style={{ left: `${(e.startMs / timelineMs) * 100}%` }}
                    title={`${e.quarterBpm} BPM`}
                  >
                    {e.quarterBpm}
                  </span>
                ))}
            </div>
          </div>
          {mix.tracks.map((tr) => {
            const role =
              roleByTrack?.[tr.id] ?? tr.role?.toLowerCase() ?? "other";
            const color = roleWaveColor(role);
            const sourceMs = estimateSourceMs(tr, sourceDurationMsByTrack);
            return (
              <div
                key={tr.id}
                className="clip-lane"
                data-role={role}
                style={{ "--track-wave": color } as CSSProperties}
              >
                <span className="clip-lane-label">{tr.name}</span>
                <div className="clip-lane-rail">
                  {tr.clips.map((clip) => {
                    const left = (clip.startMs / timelineMs) * 100;
                    const width = Math.max(
                      0.8,
                      (clip.durationMs / timelineMs) * 100,
                    );
                    const active =
                      selected?.trackId === tr.id &&
                      selected.clipId === clip.id;
                    const peaks = slicePeaksForClip(
                      peaksByTrack?.[tr.id],
                      clip,
                      sourceMs,
                    );
                    const musical = msToMusical(
                      clip.startMs,
                      tempoMap,
                      meterMap,
                      subdivision,
                    );
                    return (
                      <div
                        key={clip.id}
                        role="button"
                        tabIndex={0}
                        className={
                          active ? "clip-block active" : "clip-block"
                        }
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: withAlpha(color, 0.28),
                        }}
                        title={`${tr.name} · ${formatMs(clip.startMs)} (${formatMusical(musical)}) → ${formatMs(clip.startMs + clip.durationMs)}`}
                        aria-label={`${tr.name}, ${formatMs(clip.startMs)}, ${formatMs(clip.durationMs)}`}
                        onPointerDown={(e) => onClipPointerDown(e, tr, clip)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected({ trackId: tr.id, clipId: clip.id });
                          }
                        }}
                      >
                        <ClipWaveCanvas peaks={peaks} color={color} />
                        <span className="clip-block-label">
                          {gridMode === "musical"
                            ? formatMusical(musical)
                            : formatMs(clip.startMs)}
                        </span>
                        <span
                          className="clip-fade-in"
                          style={{
                            width: `${
                              clip.durationMs > 0
                                ? (clip.fadeInMs / clip.durationMs) * 100
                                : 0
                            }%`,
                          }}
                        />
                        <span
                          className="clip-fade-out"
                          style={{
                            width: `${
                              clip.durationMs > 0
                                ? (clip.fadeOutMs / clip.durationMs) * 100
                                : 0
                            }%`,
                          }}
                        />
                        <span className="clip-handle clip-handle-left" />
                        <span className="clip-handle clip-handle-right" />
                        <span
                          className="clip-fade-handle clip-fade-handle-in"
                          style={{
                            left: `${
                              clip.durationMs > 0
                                ? (clip.fadeInMs / clip.durationMs) * 100
                                : 0
                            }%`,
                          }}
                        />
                        <span
                          className="clip-fade-handle clip-fade-handle-out"
                          style={{
                            right: `${
                              clip.durationMs > 0
                                ? (clip.fadeOutMs / clip.durationMs) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && selectedClip && (
        <div className="clip-inspector">
          <p className="clip-inspector-title">
            {t("clips.selected", { id: selectedClip.id.slice(0, 8) })}
            {" · "}
            {formatMusical(
              msToMusical(
                selectedClip.startMs,
                tempoMap,
                meterMap,
                subdivision,
              ),
            )}
          </p>
          {cutAtMs != null &&
            cutAtMs > selectedClip.startMs &&
            cutAtMs < selectedClip.startMs + selectedClip.durationMs && (
              <p className="hint">
                {t("clips.cutAt", { ms: Math.round(cutAtMs) })}
              </p>
            )}
          <div className="clip-fields">
            <label className="clip-field">
              <span>{t("clips.start")}</span>
              <input
                type="number"
                min={0}
                step={stepForInputs}
                value={selectedClip.startMs}
                onChange={(e) =>
                  updateSelectedNumeric("startMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.offset")}</span>
              <input
                type="number"
                min={0}
                step={stepForInputs}
                value={selectedClip.offsetMs}
                onChange={(e) =>
                  updateSelectedNumeric("offsetMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.duration")}</span>
              <input
                type="number"
                min={100}
                step={stepForInputs}
                value={selectedClip.durationMs}
                onChange={(e) =>
                  updateSelectedNumeric("durationMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.fadeIn")}</span>
              <input
                type="number"
                min={0}
                step={snapEnabled ? TIME_SNAP_MS : 50}
                value={selectedClip.fadeInMs}
                onChange={(e) =>
                  updateSelectedNumeric("fadeInMs", Number(e.target.value))
                }
              />
            </label>
            <label className="clip-field">
              <span>{t("clips.fadeOut")}</span>
              <input
                type="number"
                min={0}
                step={snapEnabled ? TIME_SNAP_MS : 50}
                value={selectedClip.fadeOutMs}
                onChange={(e) =>
                  updateSelectedNumeric("fadeOutMs", Number(e.target.value))
                }
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const track = mix.tracks.find(
                  (tr) => tr.id === selected.trackId,
                );
                if (!track) return;
                applyEdit(track, {
                  kind: "duplicate",
                  clipId: selected.clipId,
                  startMs: snap(
                    selectedClip.startMs + selectedClip.durationMs,
                  ),
                });
              }}
            >
              {t("clips.duplicate")}
            </button>
            <button type="button" className="btn" onClick={cutSelected}>
              {t("clips.cut")}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => addMarkerAt(selectedClip.startMs)}
            >
              {t("clips.markerAtClip")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="hint error">{error}</p>}
    </div>
  );
}
