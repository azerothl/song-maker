import { createClipEditor, type Clip as EngineClip } from "@song-maker/score-engine";
import {
  qualityHintForProcess,
  resolveClipStretchRatio,
} from "@song-maker/mix-production";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
import { setProductionClipSelection } from "../lib/productionClipSelection";
import { createdClipId } from "../lib/createdClipSelection";
import { rulerDisplayMarks } from "../lib/rulerDisplayMarks";
import { roleWaveColor, withAlpha } from "../lib/trackRoleColors";
import { listTakesInGroup, selectActiveTake } from "../lib/takes";
import type {
  MixClip,
  MixDoc,
  MixMarker,
  MixMarkerKind,
  MixTrack,
  Meter,
} from "../lib/types";
import { t, profileLocale } from "../ui/i18n";
import type { ProductionClipViewPrefs } from "../lib/productionClipViewPrefs";
import { DEFAULT_PRODUCTION_CLIP_VIEW_PREFS } from "../lib/productionClipViewPrefs";
import { AnchoredPopin } from "./AnchoredPopin";
import {
  CLIP_EDIT_TOOLS,
  clipEditToolFromKey,
  type ClipEditTool,
} from "./ClipEditToolbar";

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
  /** Project form tempo — fallback when mix has no tempo map; also #95 follow-tempo. */
  projectTempoBpm?: number | null;
  projectMeter?: Meter | null;
  clipViewPrefs?: ProductionClipViewPrefs;
  onClipViewPrefsChange?: (patch: Partial<ProductionClipViewPrefs>) => void;
  hideHeaderTools?: boolean;
  /** Actions in the clips header (#225 — Réglages du mix). */
  headerActions?: ReactNode;
  /**
   * #299 — hide stacked chrome (palette / hints / « Clips » title / grid row)
   * when the parent owns the maquette toolbar + context bar.
   */
  hideChrome?: boolean;
  /** Controlled edit tool (#299 — V/C/F/M). */
  editTool?: ClipEditTool;
  onEditToolChange?: (tool: ClipEditTool) => void;
  currentTimeMs?: number;
  onSeek?: (seconds: number) => void;
  renderTracks?: (renderLane: (track: MixTrack) => ReactNode, durationMs: number) => ReactNode;
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
  const rest = new Intl.NumberFormat(profileLocale(), {
    minimumIntegerDigits: 2, minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(s % 60);
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
  clipViewPrefs: clipViewPrefsProp,
  onClipViewPrefsChange,
  hideHeaderTools = false,
  headerActions,
  hideChrome = false,
  editTool: editToolProp,
  onEditToolChange,
  currentTimeMs = 0,
  onSeek,
  renderTracks,
}: Props) {
  const mix = useMemo(
    () => ensureMixArrangement(rawMix, projectTempoBpm, projectMeter),
    [rawMix, projectTempoBpm, projectMeter],
  );
  const editor = useMemo(() => createClipEditor(), []);
  const [editToolState, setEditToolState] = useState<ClipEditTool>("select");
  const editTool = editToolProp ?? editToolState;
  const setEditTool = (tool: ClipEditTool) => {
    onEditToolChange?.(tool);
    if (editToolProp === undefined) setEditToolState(tool);
  };
  const [arrangementOpen, setArrangementOpen] = useState<"tempo" | "markers" | null>(null);
  const tempoAnchor = useRef<HTMLElement | null>(null);
  const markerAnchor = useRef<HTMLElement | null>(null);
  const markerOpenButton = useRef<HTMLButtonElement | null>(null);
  const tempoOpenButton = useRef<HTMLButtonElement | null>(null);
  const stretchAnchor = useRef<HTMLButtonElement | null>(null);
  const stretchTitleId = useId();
  const [stretchOpen, setStretchOpen] = useState(false);
  const arrangementId = useId();
  const [arrangementStatus,setArrangementStatus]=useState("");
  const suppressArrangementClick = useRef(false);
  const arrangementDragCleanup = useRef<(() => void) | null>(null);
  useEffect(()=>()=>arrangementDragCleanup.current?.(),[]);
  const [selected, setSelected] = useState<{
    trackId: string;
    clipId: string;
  } | null>(null);
  useEffect(() => {
    if (!selected) setStretchOpen(false);
  }, [selected]);
  const [error, setError] = useState<string | null>(null);
  const [localClipView, setLocalClipView] = useState<ProductionClipViewPrefs>(
    () => DEFAULT_PRODUCTION_CLIP_VIEW_PREFS,
  );
  const clipView = clipViewPrefsProp ?? localClipView;
  const patchClipView = useCallback(
    (patch: Partial<ProductionClipViewPrefs>) => {
      if (clipViewPrefsProp && onClipViewPrefsChange) {
        onClipViewPrefsChange(patch);
        return;
      }
      setLocalClipView((prev) => ({ ...prev, ...patch }));
    },
    [clipViewPrefsProp, onClipViewPrefsChange],
  );
  const snapEnabled = clipView.snapEnabled;
  const gridMode = clipView.gridMode;
  const subdivision = clipView.subdivision;
  const zoom = clipView.zoom;
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
  const rulerRailRef = useRef<HTMLDivElement | null>(null);
  const [rulerWidth,setRulerWidth] = useState(0);
  useEffect(()=>{
    const rail=rulerRailRef.current;
    if(!rail)return;
    const measure=()=>setRulerWidth(rail.getBoundingClientRect().width);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(rail);
    return ()=>observer.disconnect();
  },[]);
  const topScrollRef = useRef<HTMLDivElement | null>(null);

  const tempoMap = mix.tempoMap ?? [];
  const meterMap = mix.timeSignatures ?? [];
  const markers = mix.markers ?? [];

  useEffect(() => {
    setTempoBpmDraft(mix.tempoMap?.[0]?.quarterBpm ?? 120);
    setTempoAtDraft(0);
    // Switching projects resets the draft; editing the same tempo map does not.
  }, [mix.id]);

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

  useEffect(() => {
    setProductionClipSelection(selected);
  }, [selected]);

  function patchSelectedClip(patch: Partial<MixClip>) {
    if (!selected || !selectedClip) return;
    const nextTracks = mix.tracks.map((tr) => {
      if (tr.id !== selected.trackId) return tr;
      return {
        ...tr,
        clips: tr.clips.map((c) =>
          c.id === selected.clipId ? { ...c, ...patch } : c,
        ),
      };
    });
    onChange({ ...mix, tracks: nextTracks });
  }

  function activateTake(trackId: string, takeGroupId: string, clipId: string) {
    const nextTracks = mix.tracks.map((tr) => {
      if (tr.id !== trackId) return tr;
      return {
        ...tr,
        clips: selectActiveTake(tr.clips, takeGroupId, clipId),
      };
    });
    onChange({ ...mix, tracks: nextTracks });
  }

  const selectedTakeGroup = selectedClip?.takeGroupId ?? null;
  const takesInGroup =
    selected && selectedTakeGroup
      ? listTakesInGroup(
          mix.tracks.find((tr) => tr.id === selected.trackId)?.clips ?? [],
          selectedTakeGroup,
        )
      : [];

  const arrangementTempoBpm =
    mix.tempoMap?.[0]?.quarterBpm ?? projectTempoBpm ?? null;

  const stretchPreview = selectedClip
    ? resolveClipStretchRatio({
        ...(selectedClip.processingEnabled !== undefined
          ? { processingEnabled: selectedClip.processingEnabled }
          : {}),
        ...(selectedClip.followProjectTempo !== undefined
          ? { followProjectTempo: selectedClip.followProjectTempo }
          : {}),
        ...(selectedClip.sourceTempoBpm !== undefined
          ? { sourceTempoBpm: selectedClip.sourceTempoBpm }
          : {}),
        ...(arrangementTempoBpm !== undefined
          ? { projectTempoBpm: arrangementTempoBpm }
          : {}),
        ...(selectedClip.timeStretchRatio !== undefined
          ? { timeStretchRatio: selectedClip.timeStretchRatio }
          : {}),
      })
    : 1;
  const qualityHint = selectedClip
    ? qualityHintForProcess(
        stretchPreview,
        selectedClip.pitchSemitones ?? 0,
        "other",
      )
    : "ok";

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
      max = Math.max(max, m.startMs);
    }
    for (const e of tempoMap) {
      max = Math.max(max, e.startMs);
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
          const id = createdClipId(track.clips,next,lastReq);
          if (id) {
            setSelected({ trackId: track.id, clipId: id });
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

    if (e.altKey || editTool === "cut") {
      e.preventDefault();
      applyEdit(track, {
        kind: "cut",
        clipId: clip.id,
        atMs: Math.min(clip.startMs + clip.durationMs - 1, Math.max(clip.startMs + 1, Math.round(snap(atMs)))),
      });
      return;
    }

    if (editTool === "marker") {
      e.preventDefault();
      addMarkerAt(atMs);
      return;
    }

    const kind: DragKind = editTool === "fade" && zone === "body"
      ? (localX < width / 2 ? "fade-in" : "fade-out")
      : zone === "body" ? "move" : zone;
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

  function scrollRegionByKey(
    region: HTMLElement,
    key: string,
  ): boolean {
    const step = Math.max(48, Math.floor(region.clientHeight * 0.85));
    const max = Math.max(0, region.scrollHeight - region.clientHeight);
    if (key === "ArrowDown") {
      region.scrollTop = Math.min(max, region.scrollTop + 40);
      return true;
    }
    if (key === "ArrowUp") {
      region.scrollTop = Math.max(0, region.scrollTop - 40);
      return true;
    }
    if (key === "PageDown") {
      region.scrollTop = Math.min(max, region.scrollTop + step);
      return true;
    }
    if (key === "PageUp") {
      region.scrollTop = Math.max(0, region.scrollTop - step);
      return true;
    }
    if (key === "Home") {
      region.scrollTop = 0;
      return true;
    }
    if (key === "End") {
      region.scrollTop = max;
      return true;
    }
    return false;
  }

  function onTimelineKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if(e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const inField =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable;

    if (inField) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const fromKey = clipEditToolFromKey(e.key);
      if (fromKey) {
        e.preventDefault();
        setEditTool(fromKey);
        return;
      }
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        cutSelected();
        return;
      }
    }

    const scrollKeys = new Set([
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]);
    if (scrollKeys.has(e.key)) {
      const lanes = railScrollRef.current;
      const top = topScrollRef.current;
      const common = renderTracks ? target.closest<HTMLElement>(".production-workspace-common") : null;
      if (target.closest('[data-testid="clip-timeline-lanes"]') && lanes && lanes.scrollHeight>lanes.clientHeight) {
        e.preventDefault();
        scrollRegionByKey(lanes,e.key);
        return;
      }
      if(common) {
        e.preventDefault();
        scrollRegionByKey(common,e.key);
        return;
      }
      if (target.closest('[data-testid="clip-timeline-lanes"]') && lanes) {
        e.preventDefault();
        scrollRegionByKey(lanes, e.key);
        return;
      }
      if (
        (target.closest('[data-testid="production-clips-scroll"]') ||
          target.closest(".clip-inspector")) &&
        top
      ) {
        e.preventDefault();
        scrollRegionByKey(top, e.key);
        return;
      }
    }

    if (!selected || !selectedClip) return;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    if (!track) return;
    if (target.closest(".clip-marker-flag, .clip-tempo-flag, .clip-arrangement-popins, .clip-edit-toolbar")) return;
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
    let atMs = onSeek ? currentTimeMs : cutAtMs ?? mid;
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
    const startMs = Math.min(timelineMs,Math.max(0,snap(ms)));
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
    setArrangementStatus(t("production.status.markerAdded",{name,time:formatMs(startMs)}));
    requestAnimationFrame(()=>railScrollRef.current?.querySelector<HTMLButtonElement>(`[data-marker-id="${marker.id}"]`)?.focus());
  }

  function jumpToMarker(marker: MixMarker) {
    setSelectedMarkerId(marker.id);
    onSeek?.(marker.startMs / 1000);
    const scroller = railScrollRef.current;
    if (!scroller) return;
    const ratio = marker.startMs / timelineMs;
    const target =
      ratio * scroller.scrollWidth - scroller.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  function updateSelectedMarker(patch: Partial<MixMarker>) {
    if (!selectedMarker) return;
    const position=patch.startMs==null?selectedMarker.startMs:Math.min(timelineMs,Math.max(0,Math.round(Number.isFinite(patch.startMs)?patch.startMs:0)));
    const next: MixMarker = { ...selectedMarker, ...patch, startMs:position };
    patchMix(
      upsertMixMarker(mix, next, {
        shiftClips: shiftClipsWithMarker && patch.startMs != null,
        previousStartMs: selectedMarker.startMs,
      }),
    );
    setArrangementStatus(t(patch.startMs!=null&&position!==patch.startMs?"production.status.markerBounded":"production.status.markerUpdated",{name:next.name,time:formatMs(next.startMs)}));
  }

  function deleteMarker(marker: MixMarker) {
    patchMix(removeMixMarker(mix,marker.id));
    setSelectedMarkerId(null);
    setArrangementOpen(null);
    setArrangementStatus(t("production.status.markerDeleted",{name:marker.name}));
    requestAnimationFrame(()=>markerOpenButton.current?.focus());
  }

  function commitTempoChange() {
    const bpm = Math.max(1, Math.min(400, Math.round(Number.isFinite(tempoBpmDraft)?tempoBpmDraft:120)));
    const startMs = Math.min(timelineMs,snap(Math.max(0, Number.isFinite(tempoAtDraft)?tempoAtDraft:0)));
    // Tempo map is display/snap only — never rewrite clip ms or source offsets.
    patchMix(upsertTempoEvent(mix, { startMs, quarterBpm: bpm }));
    setTempoBpmDraft(bpm);setTempoAtDraft(startMs);
    setArrangementStatus(t("production.status.tempoSet",{bpm,time:formatMs(startMs)}));
  }

  function startArrangementDrag(event: ReactPointerEvent<HTMLButtonElement>, item: MixMarker | { startMs:number; quarterBpm:number }) {
    if(event.button!==0 || (!("id" in item)&&item.startMs===0))return;
    const rail=event.currentTarget.closest(".clip-lane-rail");
    if(!rail)return;
    const width=rail.getBoundingClientRect().width;
    if(width<=0)return;
    const origin=event.clientX;
    let moved=false;
    let latest=item.startMs;
    arrangementDragCleanup.current?.();
    const cleanup=()=>{
      window.removeEventListener("pointermove",move);
      window.removeEventListener("pointerup",finish);
      window.removeEventListener("pointercancel",cancel);
      window.removeEventListener("keydown",key,true);
      arrangementDragCleanup.current=null;
    };
    const move=(e:PointerEvent)=>{
      if(e.pointerId!==event.pointerId)return;
      if(!moved&&Math.abs(e.clientX-origin)<4)return;
      moved=true;suppressArrangementClick.current=true;
      const lower="id" in item?0:1;
      latest=Math.min(timelineMs,Math.max(lower,snap(item.startMs+(e.clientX-origin)/width*timelineMs)));
      if("id" in item)patchMix(upsertMixMarker(mix,{...item,startMs:latest},{shiftClips:shiftClipsWithMarker,previousStartMs:item.startMs}));
      else patchMix(upsertTempoEvent(removeTempoEvent(mix,item.startMs),{...item,startMs:latest}));
    };
    const finish=(e:PointerEvent)=>{
      if(e.pointerId!==event.pointerId)return;
      cleanup();
      if(!moved)return;
      setArrangementStatus("id" in item?t("production.status.markerUpdated",{name:item.name,time:formatMs(latest)}):t("production.status.tempoSet",{bpm:item.quarterBpm,time:formatMs(latest)}));
      // The browser's synthetic click follows pointerup before this timeout.
      window.setTimeout(()=>{suppressArrangementClick.current=false;},0);
      requestAnimationFrame(()=>railScrollRef.current?.querySelector<HTMLButtonElement>("id" in item?`[data-marker-id="${item.id}"]`:`[data-tempo-ms="${latest}"]`)?.focus());
    };
    const cancel=()=>{cleanup();if(moved)patchMix(mix);suppressArrangementClick.current=true;window.setTimeout(()=>{suppressArrangementClick.current=false;},0);};
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();cancel();}};
    arrangementDragCleanup.current=cleanup;
    window.addEventListener("pointermove",move);
    window.addEventListener("pointerup",finish);
    window.addEventListener("pointercancel",cancel);
    window.addEventListener("keydown",key,true);
  }

  const railWidthPct = `${Math.max(100, zoom * 100)}%`;
  const stepForInputs =
    gridMode === "musical" && snapEnabled ? nudgeStep : snapEnabled ? TIME_SNAP_MS : 100;

  const renderLane = (tr: MixTrack) => {

            const role =
              roleByTrack?.[tr.id] ?? tr.role?.toLowerCase() ?? "other";
            const color = roleWaveColor(role);
            const sourceMs = estimateSourceMs(tr, sourceDurationMsByTrack);
            return (
              <div
                key={tr.id}
                className={renderTracks ? "clip-lane common-track-lane" : "clip-lane"}
                data-role={role}
                style={{ "--track-wave": color } as CSSProperties}
              >
                {!renderTracks && <span className="clip-lane-label">{tr.name}</span>}
                <div className="clip-lane-rail">
                  <span aria-hidden="true" className="production-playback-line" style={{left:`${Math.min(100,Math.max(0,currentTimeMs/timelineMs*100))}%`}} />
                  {tr.clips.map((clip) => {
                    const left = (clip.startMs / timelineMs) * 100;
                    const width = Math.max(
                      0.8,
                      (clip.durationMs / timelineMs) * 100,
                    );
                    const active =
                      selected?.trackId === tr.id &&
                      selected.clipId === clip.id;
                    const takeMuted = clip.takeActive === false;
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
                        aria-pressed={active}
                        tabIndex={0}
                        className={[
                          "clip-block",
                          active ? "active" : "",
                          takeMuted ? "take-muted" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          background: withAlpha(color, takeMuted ? 0.12 : 0.28),
                        }}
                        title={`${tr.name} · ${formatMs(clip.startMs)} (${formatMusical(musical)}) → ${formatMs(clip.startMs + clip.durationMs)}${
                          clip.takeLabel ? ` · ${clip.takeLabel}` : ""
                        }`}
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
  };
  return (
    <div className="clip-timeline" onKeyDown={onTimelineKeyDown}>
      <div
        ref={topScrollRef}
        className="clip-timeline-scroll production-subview-scroll clip-timeline-scroll-chrome"
        role="region"
        aria-label={t("production.common.clips")}
        tabIndex={0}
        data-testid="production-clips-scroll"
      >
      {!hideChrome && (
        <>
      <div className="clip-edit-toolbar" role="toolbar" aria-label={t("production.edit.title")}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const tools = CLIP_EDIT_TOOLS;
          const index = tools.indexOf(editTool);
          const next = event.key === "Home" ? 0 : event.key === "End" ? tools.length - 1
            : (index + (event.key === "ArrowLeft" ? tools.length - 1 : 1)) % tools.length;
          setEditTool(tools[next]);
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        }}>
        {CLIP_EDIT_TOOLS.map((tool) => {
          const shortcut =
            tool === "select" ? "V" : tool === "cut" ? "C" : tool === "fade" ? "F" : "M";
          return (
          <button key={tool} type="button" className="btn" aria-pressed={editTool === tool}
            tabIndex={editTool === tool ? 0 : -1} aria-keyshortcuts={shortcut}
            onClick={() => setEditTool(tool)}>
            <span className="clip-edit-tool-check" aria-hidden="true">{editTool === tool ? "✓" : ""}</span>
            <span>{t(`production.edit.${tool}`)}</span>
          </button>
          );
        })}
      </div>
      <p className="hint" role="status">{t(`production.edit.${editTool}.hint`)}</p>
      <div className="clip-timeline-header">
        <h3>{t("clips.title")}</h3>
        <span className="hint">{t("clips.hint")}</span>
        {headerActions ? (
          <div className="clip-timeline-header-actions">{headerActions}</div>
        ) : null}
        <div className="clip-timeline-tools">
          {!hideHeaderTools && (
            <>
          <label className="clip-tool-check">
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={(e) => patchClipView({ snapEnabled: e.target.checked })}
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
              onChange={(e) =>
                patchClipView({ gridMode: e.target.value as GridMode })
              }
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
                  patchClipView({
                    subdivision: Number(e.target.value) as MusicalSubdivision,
                  })
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
              onChange={(e) => patchClipView({ zoom: Number(e.target.value) })}
            />
          </label>
            </>
          )}
        </div>
      </div>
        </>
      )}

      <div className="clip-arrangement-popins">
        <AnchoredPopin open={arrangementOpen === "tempo"} onClose={() => setArrangementOpen(null)}
          anchorRef={tempoAnchor} labelId={`${arrangementId}-tempo`}>
        <div className="clip-tempo-editor">
          <strong id={`${arrangementId}-tempo`}>{t("clips.tempoMap")}</strong>
          <label>
            <span>{t("clips.tempoBpm")}</span>
            <input
              type="number"
              min={1}
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
                    aria-label={t("production.tempo.deleteNamed",{bpm:ev.quarterBpm,time:formatMs(ev.startMs)})}
                    onClick={() => {
                      patchMix(removeTempoEvent(mix,ev.startMs));
                      setArrangementStatus(t("production.status.tempoDeleted",{time:formatMs(ev.startMs)}));
                    }}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">{t("clips.tempoHint")}</p>
          <button type="button" className="btn" onClick={() => setArrangementOpen(null)}>{t("production.arrangement.close")}</button>
        </div>
        </AnchoredPopin>

        <AnchoredPopin open={arrangementOpen === "markers"} onClose={() => setArrangementOpen(null)}
          anchorRef={markerAnchor} labelId={`${arrangementId}-markers`}>
        <div className="clip-marker-editor">
          <strong id={`${arrangementId}-markers`}>{t("clips.markers")}</strong>
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
            onClick={() => addMarkerAt(onSeek ? currentTimeMs : selectedClip?.startMs ?? 0)}
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
                  max={timelineMs}
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
                  deleteMarker(selectedMarker);
                }}
              >
                {t("clips.markerDelete")}
              </button>
            </div>
          )}
          <button type="button" className="btn" onClick={() => setArrangementOpen(null)}>{t("production.arrangement.close")}</button>
        </div>
        </AnchoredPopin>
      </div>

      {selected && selectedClip && (
        <div
          className="clip-selection-bar"
          data-testid="clip-selection-bar"
          role="toolbar"
          aria-label={t("clips.selected", { id: selectedClip.id.slice(0, 8) })}
        >
          <button
            ref={stretchAnchor}
            type="button"
            className="btn"
            aria-haspopup="dialog"
            aria-expanded={stretchOpen}
            data-testid="clip-stretch-open"
            onClick={() => setStretchOpen((v) => !v)}
          >
            {t("clips.stretch.open")}
          </button>
          {takesInGroup.length > 1 && selectedTakeGroup && selected && (
            <div
              className="clip-takes clip-takes-bar"
              role="group"
              aria-label={t("clips.takes")}
            >
              <span className="clip-takes-label">{t("clips.takes")}</span>
              {takesInGroup.map((take) => (
                <button
                  key={take.id}
                  type="button"
                  className={
                    take.takeActive !== false ? "btn primary" : "btn"
                  }
                  aria-pressed={take.takeActive !== false}
                  onClick={() =>
                    activateTake(selected.trackId, selectedTakeGroup, take.id)
                  }
                >
                  <span className="clip-edit-tool-check" aria-hidden="true">
                    {take.takeActive !== false ? "✓" : ""}
                  </span>
                  {take.takeLabel ??
                    t("record.takeLabel", {
                      n: String((take.takeIndex ?? 0) + 1),
                    })}
                </button>
              ))}
            </div>
          )}
          <AnchoredPopin
            open={stretchOpen}
            onClose={() => setStretchOpen(false)}
            anchorRef={stretchAnchor}
            labelId={stretchTitleId}
            className="clip-stretch-popin"
          >
            <header className="anchored-popin-header">
              <h3 id={stretchTitleId}>{t("clips.stretch.title")}</h3>
              <button
                type="button"
                className="btn"
                onClick={() => setStretchOpen(false)}
              >
                {t("production.track.close")}
              </button>
            </header>
            <p className="hint">
              {t("clips.selected", { id: selectedClip.id.slice(0, 8) })}
            </p>
            <div className="clip-stretch" data-testid="clip-stretch-panel">
              <label className="record-monitor">
                <input
                  type="checkbox"
                  checked={selectedClip.processingEnabled !== false}
                  onChange={(e) =>
                    patchSelectedClip({ processingEnabled: e.target.checked })
                  }
                />
                <span>{t("clips.stretch.enabled")}</span>
              </label>
              <label className="record-monitor">
                <input
                  type="checkbox"
                  checked={!!selectedClip.followProjectTempo}
                  onChange={(e) =>
                    patchSelectedClip({ followProjectTempo: e.target.checked })
                  }
                />
                <span>{t("clips.stretch.followTempo")}</span>
              </label>
              <div className="clip-fields">
                <label className="clip-field">
                  <span>{t("clips.stretch.sourceBpm")}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={selectedClip.sourceTempoBpm ?? ""}
                    placeholder={
                      arrangementTempoBpm != null
                        ? String(arrangementTempoBpm)
                        : ""
                    }
                    onChange={(e) =>
                      patchSelectedClip({
                        sourceTempoBpm: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="clip-field">
                  <span>{t("clips.stretch.ratio")}</span>
                  <input
                    type="number"
                    min={0.25}
                    max={4}
                    step={0.01}
                    disabled={!!selectedClip.followProjectTempo}
                    value={selectedClip.timeStretchRatio ?? 1}
                    onChange={(e) =>
                      patchSelectedClip({
                        timeStretchRatio: Number(e.target.value) || 1,
                      })
                    }
                  />
                </label>
                <label className="clip-field">
                  <span>{t("clips.stretch.pitch")}</span>
                  <input
                    type="number"
                    min={-12}
                    max={12}
                    step={1}
                    value={selectedClip.pitchSemitones ?? 0}
                    onChange={(e) =>
                      patchSelectedClip({
                        pitchSemitones: Number(e.target.value) || 0,
                      })
                    }
                  />
                </label>
              </div>
              <p className="hint">
                {t("clips.stretch.effective", {
                  ratio: stretchPreview.toFixed(3),
                })}
              </p>
              {qualityHint !== "ok" && qualityHint !== "voice_ok" && (
                <p className="hint warn">
                  {t(`clips.stretch.quality.${qualityHint}`)}
                </p>
              )}
              <p className="hint">{t("clips.stretch.ab")}</p>
            </div>
          </AnchoredPopin>
        </div>
      )}

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

      <div
        className="clip-lanes-scroll clip-timeline-lanes-pane production-subview-scroll"
        ref={railScrollRef}
        data-testid="clip-timeline-lanes"
        role="region"
        aria-label={t("production.common.timelineNamed")}
        tabIndex={0}
        onKeyDown={onTimelineKeyDown}
      >
        <div className="clip-lanes" style={{ width: railWidthPct }}>
          <div className="clip-ruler" role="slider" tabIndex={onSeek ? 0 : -1}
            aria-disabled={!onSeek || undefined}
            aria-label={t("production.rulerNamed")}
            aria-valuemin={0} aria-valuemax={timelineMs}
            aria-valuenow={Math.min(timelineMs,Math.max(0,Math.round(currentTimeMs)))}
            aria-valuetext={t("production.ruler.value", {time:new Intl.NumberFormat(profileLocale()).format(Math.min(timelineMs, Math.max(0, Math.round(currentTimeMs)))),bar:msToMusical(Math.min(timelineMs,Math.max(0,currentTimeMs)),tempoMap,meterMap,subdivision).bar})}
            onPointerDown={event => {
              const rail=event.currentTarget.querySelector(".clip-ruler-marks-abs");
              if (!rail || !onSeek) return;
              event.currentTarget.focus();
              const rect=rail.getBoundingClientRect();
              if (rect.width <= 0) return;
              onSeek(Math.min(timelineMs,Math.max(0,snap((event.clientX-rect.left)/rect.width*timelineMs)))/1000);
            }}
            onKeyDown={event => {
              if (!onSeek || !["ArrowLeft","ArrowRight","PageUp","PageDown","Home","End"].includes(event.key)) return;
              event.preventDefault();event.stopPropagation();
              const step=event.shiftKey?50:nudgeStep;
              const next=event.key === "Home" ? 0 : event.key === "End" ? timelineMs
                : currentTimeMs + (event.key === "ArrowLeft" || event.key === "PageUp" ? -1:1)
                  * step * (event.key.startsWith("Page")?4:1);
              onSeek(Math.min(timelineMs,Math.max(0,next))/1000);
            }}>
            <span className="clip-lane-label" />
            <div ref={rulerRailRef} className="clip-ruler-marks-abs" aria-hidden="true">
              <span className="production-playback-line" style={{left:`${Math.min(100,Math.max(0,currentTimeMs/timelineMs*100))}%`}} />
              {rulerDisplayMarks(rulerMarks,timelineMs,rulerWidth).map((mark, i) => (
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
          <div className="clip-marker-lane clip-tempo-lane" role="group" aria-label={t("clips.tempoMap")}>
            <span className="clip-lane-label">{t("clips.tempoMap")}</span>
              <button type="button" className="btn clip-tempo-add" ref={tempoOpenButton}
                aria-label={t("production.tempo.addNamed")} aria-haspopup="dialog" aria-expanded={arrangementOpen === "tempo"}
                onClick={event=>{tempoAnchor.current=event.currentTarget;setTempoAtDraft(Math.min(timelineMs,Math.max(0,currentTimeMs)));setArrangementOpen("tempo");}}>+</button>
            <div className="clip-lane-rail clip-marker-rail">
              {tempoMap.map(ev => (
                <button type="button" key={ev.startMs} className="clip-tempo-flag"
                  data-tempo-ms={ev.startMs}
                  style={{ left: `${(ev.startMs / timelineMs) * 100}%`, transform: ev.startMs === 0 ? "none" : undefined }}
                  aria-pressed={arrangementOpen === "tempo" && tempoAtDraft === ev.startMs}
                  aria-label={t("production.tempo.flagNamed", { bpm: ev.quarterBpm, time: formatMs(ev.startMs) })}
                  onPointerDown={event=>startArrangementDrag(event,ev)}
                  onKeyDown={event=>{
                    if(!["ArrowLeft","ArrowRight","Delete","Backspace"].includes(event.key))return;
                    event.preventDefault();event.stopPropagation();
                    if(ev.startMs===0)return;
                    if(event.key==="Delete"||event.key==="Backspace"){
                      patchMix(removeTempoEvent(mix,ev.startMs));
                      setArrangementStatus(t("production.status.tempoDeleted",{time:formatMs(ev.startMs)}));
                      requestAnimationFrame(()=>tempoOpenButton.current?.focus());return;
                    }
                    const proposed=ev.startMs+(event.key==="ArrowLeft"?-1:1)*(event.shiftKey?50:nudgeStep);
                    const startMs=Math.min(timelineMs,Math.max(1,event.shiftKey?Math.round(proposed):snap(proposed)));
                    patchMix(upsertTempoEvent(removeTempoEvent(mix,ev.startMs),{...ev,startMs}));
                    setArrangementStatus(t("production.status.tempoSet",{bpm:ev.quarterBpm,time:formatMs(startMs)}));
                    requestAnimationFrame(()=>railScrollRef.current?.querySelector<HTMLButtonElement>(`[data-tempo-ms="${startMs}"]`)?.focus());
                  }}
                  onClick={event => {
                    if(suppressArrangementClick.current)return;
                    tempoAnchor.current = event.currentTarget;
                    setTempoAtDraft(ev.startMs); setTempoBpmDraft(ev.quarterBpm); setArrangementOpen("tempo");
                  }}><span aria-hidden="true">♩ </span>{ev.quarterBpm}</button>
              ))}
            </div>
          </div>
          <div className="clip-marker-lane" role="group" aria-label={t("clips.markers")}>
            <span className="clip-lane-label">{t("clips.markers")}</span>
              <button type="button" className="btn clip-marker-add" ref={markerOpenButton}
                aria-label={t("production.marker.addNamed")} aria-haspopup="dialog" aria-expanded={arrangementOpen === "markers"}
                onClick={event=>{markerAnchor.current=event.currentTarget;setArrangementOpen("markers");}}>+</button>
            <div
              className="clip-lane-rail clip-marker-rail"
              onClick={(event) => {
                if (editTool !== "marker") return;
                if ((event.target as HTMLElement).closest(".clip-marker-flag")) return;
                const rail = event.currentTarget;
                const rect = rail.getBoundingClientRect();
                const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
                addMarkerAt(ratio * timelineMs);
              }}
            >
              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={
                    selectedMarkerId === m.id
                      ? "clip-marker-flag active"
                      : "clip-marker-flag"
                  }
                  data-marker-id={m.id}
                  style={{ left: `${(m.startMs / timelineMs) * 100}%`, transform: m.startMs === 0 ? "none" : m.startMs>=timelineMs ? "translateX(-100%)" : undefined }}
                  title={`${m.name} · ${formatMs(m.startMs)}`}
                  aria-label={t("production.marker.flagNamed",{name:m.name,time:formatMs(m.startMs)})}
                  aria-pressed={selectedMarkerId === m.id}
                  onPointerDown={event=>startArrangementDrag(event,m)}
                  onKeyDown={event => {
                    if (["Delete","Backspace"].includes(event.key)) {
                      event.preventDefault();event.stopPropagation();deleteMarker(m);return;
                    }
                    if (!["ArrowLeft", "ArrowRight","Home","End"].includes(event.key)) return;
                    event.preventDefault(); event.stopPropagation();
                    const proposed=event.key==="Home"?0:event.key==="End"?timelineMs:m.startMs+(event.key==="ArrowLeft"?-1:1)*(event.shiftKey?50:nudgeStep);
                    const startMs = Math.min(timelineMs,Math.max(0,event.shiftKey||event.key==="Home"||event.key==="End"?Math.round(proposed):snap(proposed)));
                    patchMix(upsertMixMarker(mix, { ...m, startMs }, {
                      shiftClips: shiftClipsWithMarker, previousStartMs: m.startMs,
                    }));
                    setArrangementStatus(t("production.status.markerUpdated",{name:m.name,time:formatMs(startMs)}));
                  }}
                  onClick={event => {
                    if(suppressArrangementClick.current)return;
                    jumpToMarker(m); markerAnchor.current = event.currentTarget; setArrangementOpen("markers");
                  }}
                >
                  <span className="clip-marker-flag-label">{m.name}</span>
                </button>
              ))}
            </div>
          </div>
          {renderTracks ? renderTracks(renderLane,timelineMs) : mix.tracks.map(renderLane)}
        </div>
      </div>
      <div data-testid="arrangement-status" role="status" aria-live="polite" className={arrangementStatus?"hint production-arrangement-status":"sr-only"}>{arrangementStatus}</div>
    </div>
  );
}
