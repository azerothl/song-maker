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
import { roleWaveColor, withAlpha } from "../lib/trackRoleColors";
import type { MixClip, MixDoc, MixTrack } from "../lib/types";
import { t } from "../ui/i18n";

const SNAP_MS = 50;
const EDGE_PX = 6;
const FADE_HANDLE_PX = 8;
const MIN_DURATION_MS = 50;
const NUDGE_MS = 50;

type Props = {
  mix: MixDoc;
  onChange: (next: MixDoc) => void;
  /** Full-stem peaks keyed by track id (from playback). */
  peaksByTrack?: Record<string, Float32Array>;
  /** Optional role per track id for stem-colored clip waves. */
  roleByTrack?: Record<string, string>;
  /** Optional source duration (ms) per track for peak slicing. */
  sourceDurationMsByTrack?: Record<string, number>;
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

function snapValue(ms: number, enabled: boolean): number {
  if (!enabled) return Math.max(0, Math.round(ms));
  return Math.max(0, Math.round(ms / SNAP_MS) * SNAP_MS);
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

export function ClipTimeline({
  mix,
  onChange,
  peaksByTrack,
  roleByTrack,
  sourceDurationMsByTrack,
}: Props) {
  const editor = useMemo(() => createClipEditor(), []);
  const [selected, setSelected] = useState<{
    trackId: string;
    clipId: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [cutAtMs, setCutAtMs] = useState<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const railScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedClip = useMemo(() => {
    if (!selected) return null;
    const track = mix.tracks.find((tr) => tr.id === selected.trackId);
    return track?.clips.find((c) => c.id === selected.clipId) ?? null;
  }, [mix, selected]);

  const timelineMs = useMemo(() => {
    let max = 1;
    for (const tr of mix.tracks) {
      for (const c of tr.clips) {
        max = Math.max(max, c.startMs + c.durationMs);
      }
    }
    return Math.max(max, 30_000);
  }, [mix]);

  const patchTrackClips = useCallback(
    (trackId: string, clips: MixClip[]) => {
      onChange({
        ...mix,
        tracks: mix.tracks.map((tr) =>
          tr.id === trackId ? { ...tr, clips } : tr,
        ),
      });
    },
    [mix, onChange],
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
          startMs: value,
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
    snapEnabled,
    timelineMs,
    applyEdit,
    applyEdits,
  });
  dragCtxRef.current = { mix, snapEnabled, timelineMs, applyEdit, applyEdits };

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
      const snap = ctx.snapEnabled;

      switch (ds.kind) {
        case "move": {
          const startMs = snapValue(clip.startMs + deltaMs, snap);
          ctx.applyEdit(track, { kind: "move", clipId: clip.id, startMs });
          break;
        }
        case "trim-left": {
          const rawDelta = snapValue(deltaMs, snap);
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
            snapValue(clip.durationMs + deltaMs, snap),
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
          const fadeInMs = snapValue(
            Math.min(
              clip.durationMs - clip.fadeOutMs,
              Math.max(0, clip.fadeInMs + deltaMs),
            ),
            snap,
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
          const fadeOutMs = snapValue(
            Math.min(
              clip.durationMs - clip.fadeInMs,
              Math.max(0, clip.fadeOutMs - deltaMs),
            ),
            snap,
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
    const step = snapEnabled ? SNAP_MS : NUDGE_MS;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -step : step;
      applyEdit(track, {
        kind: "move",
        clipId: selected.clipId,
        startMs: Math.max(0, selectedClip.startMs + delta),
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

  const railWidthPct = `${Math.max(100, zoom * 100)}%`;

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
            <span>{t("clips.snap", { ms: SNAP_MS })}</span>
          </label>
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

      <div className="clip-lanes-scroll" ref={railScrollRef}>
        <div className="clip-lanes" style={{ width: railWidthPct }}>
          <div className="clip-ruler" aria-hidden="true">
            <span className="clip-lane-label" />
            <div className="clip-ruler-marks">
              <span>0:00</span>
              <span>{formatMs(timelineMs / 2)}</span>
              <span>{formatMs(timelineMs)}</span>
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
                        title={`${tr.name} · ${formatMs(clip.startMs)} → ${formatMs(clip.startMs + clip.durationMs)}`}
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
                          {formatMs(clip.startMs)}
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
                step={snapEnabled ? SNAP_MS : 100}
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
                step={snapEnabled ? SNAP_MS : 100}
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
                step={snapEnabled ? SNAP_MS : 100}
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
                step={snapEnabled ? SNAP_MS : 50}
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
                step={snapEnabled ? SNAP_MS : 50}
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
                  startMs: selectedClip.startMs + selectedClip.durationMs,
                });
              }}
            >
              {t("clips.duplicate")}
            </button>
            <button type="button" className="btn" onClick={cutSelected}>
              {t("clips.cut")}
            </button>
          </div>
        </div>
      )}

      {error && <p className="hint error">{error}</p>}
    </div>
  );
}
