import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  AutomationPoint,
  AutomationTarget,
  LoudnessReport,
  SidechainRoute,
  TrackEffectSlot,
} from "@song-maker/mix-production";
import { bakeMixPcm, decodeMixStems } from "../lib/mixBridge";
import {
  defaultEffectParams,
  ensureProductionOverlay,
  getProductionOverlay,
  getProductionToolkit,
  newEffectId,
  patchProductionOverlay,
  productionIsActive,
  setSidechainRoutes,
  setTrackEffects,
  subscribeProduction,
  UI_EFFECT_KINDS,
  type UiEffectKind,
} from "../lib/productionState";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { t } from "../ui/i18n";

function isUiEffectKind(kind: string): kind is UiEffectKind {
  return (UI_EFFECT_KINDS as readonly string[]).includes(kind);
}

type Props = {
  mix: MixDoc | null;
  /** Stem paths for real mix loudness bake. Wire from SongScreen when ready. */
  sources?: PlaybackSources | null;
  /** Project tempo for delay sync (optional; delay falls back to free ms). */
  tempoBpm?: number | null;
};

type MeasureState = "idle" | "measuring" | "error";

const FX_LABEL: Record<
  UiEffectKind,
  | "phase3.mix.fx.limiter"
  | "phase3.mix.fx.compressor"
  | "phase3.mix.fx.gate"
  | "phase3.mix.fx.eq"
  | "phase3.mix.fx.parametricEq"
  | "phase3.mix.fx.filter"
  | "phase3.mix.fx.delay"
  | "phase3.mix.fx.reverb"
> = {
  limiter: "phase3.mix.fx.limiter",
  compressor: "phase3.mix.fx.compressor",
  gate: "phase3.mix.fx.gate",
  eq: "phase3.mix.fx.eq",
  parametricEq: "phase3.mix.fx.parametricEq",
  filter: "phase3.mix.fx.filter",
  delay: "phase3.mix.fx.delay",
  reverb: "phase3.mix.fx.reverb",
};

const FX_ADD_LABEL: Record<
  UiEffectKind,
  | "phase3.mix.add.limiter"
  | "phase3.mix.add.compressor"
  | "phase3.mix.add.gate"
  | "phase3.mix.add.eq"
  | "phase3.mix.add.parametricEq"
  | "phase3.mix.add.filter"
  | "phase3.mix.add.delay"
  | "phase3.mix.add.reverb"
> = {
  limiter: "phase3.mix.add.limiter",
  compressor: "phase3.mix.add.compressor",
  gate: "phase3.mix.add.gate",
  eq: "phase3.mix.add.eq",
  parametricEq: "phase3.mix.add.parametricEq",
  filter: "phase3.mix.add.filter",
  delay: "phase3.mix.add.delay",
  reverb: "phase3.mix.add.reverb",
};

const PARAM_EQ_TYPES = [
  "peak",
  "lowshelf",
  "highshelf",
  "lowpass",
  "highpass",
  "notch",
] as const;

const CURVE_LABEL: Record<
  (typeof PARAM_EQ_TYPES)[number],
  | "phase3.mix.param.curve.peak"
  | "phase3.mix.param.curve.lowshelf"
  | "phase3.mix.param.curve.highshelf"
  | "phase3.mix.param.curve.lowpass"
  | "phase3.mix.param.curve.highpass"
  | "phase3.mix.param.curve.notch"
> = {
  peak: "phase3.mix.param.curve.peak",
  lowshelf: "phase3.mix.param.curve.lowshelf",
  highshelf: "phase3.mix.param.curve.highshelf",
  lowpass: "phase3.mix.param.curve.lowpass",
  highpass: "phase3.mix.param.curve.highpass",
  notch: "phase3.mix.param.curve.notch",
};

const DELAY_DIV_OPTIONS = [
  "1/1",
  "1/2",
  "1/4",
  "1/8",
  "1/16",
  "1/2d",
  "1/4d",
  "1/8d",
  "1/4t",
  "1/8t",
] as const;

function sortPoints(points: AutomationPoint[]): AutomationPoint[] {
  return [...points].sort((a, b) => a.timeMs - b.timeMs);
}

function AutomationLaneEditor({
  points,
  target,
  onChange,
}: {
  points: AutomationPoint[];
  target: AutomationTarget;
  onChange: (next: AutomationPoint[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const maxMs = 5000;
  const minVal = target === "volume" ? -24 : -1;
  const maxVal = target === "volume" ? 12 : 1;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 280;
    const height = canvas.clientHeight || 96;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    const sorted = sortPoints(points);
    const xOf = (ms: number) => (ms / maxMs) * width;
    const yOf = (v: number) =>
      height - ((v - minVal) / (maxVal - minVal)) * height;

    if (sorted.length > 0) {
      ctx.strokeStyle = "rgba(105,217,232,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      sorted.forEach((p, i) => {
        const x = xOf(p.timeMs);
        const y = yOf(p.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    for (const p of sorted) {
      ctx.fillStyle = "#eff0fb";
      ctx.beginPath();
      ctx.arc(xOf(p.timeMs), yOf(p.value), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [points, minVal, maxVal]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  function valueAt(clientX: number, clientY: number): AutomationPoint {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const timeMs = Math.round(x * maxMs);
    const value = minVal + (1 - y) * (maxVal - minVal);
    return {
      timeMs,
      value: target === "volume" ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100,
    };
  }

  function nearestIndex(clientX: number, clientY: number): number {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let best = -1;
    let bestDist = 16;
    points.forEach((p, i) => {
      const px = rect.left + (p.timeMs / maxMs) * rect.width;
      const py =
        rect.top +
        (1 - (p.value - minVal) / (maxVal - minVal)) * rect.height;
      const d = Math.hypot(clientX - px, clientY - py);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const idx = nearestIndex(e.clientX, e.clientY);
    if (idx >= 0) {
      dragIndex.current = idx;
      return;
    }
    const next = sortPoints([...points, valueAt(e.clientX, e.clientY)]);
    onChange(next);
    dragIndex.current = next.findIndex(
      (p) =>
        p.timeMs === valueAt(e.clientX, e.clientY).timeMs &&
        p.value === valueAt(e.clientX, e.clientY).value,
    );
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (dragIndex.current == null) return;
    const next = [...points];
    next[dragIndex.current] = valueAt(e.clientX, e.clientY);
    onChange(sortPoints(next));
  }

  function onPointerUp() {
    dragIndex.current = null;
  }

  function onDoubleClick(e: ReactMouseEvent<HTMLCanvasElement>) {
    const idx = nearestIndex(e.clientX, e.clientY);
    if (idx < 0) return;
    onChange(points.filter((_, i) => i !== idx));
  }

  return (
    <canvas
      ref={canvasRef}
      className="phase3-auto-lane"
      height={96}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      aria-label={t("phase3.mix.automationLane")}
    />
  );
}

/**
 * Phase 3 production panel — writes automation / FX / sidechain into the
 * shared overlay used by Web Audio bake and offline export.
 */
export function Phase3MixPanel({
  mix,
  sources = null,
  tempoBpm = null,
}: Props) {
  const [trackId, setTrackId] = useState<string>("");
  const [autoTarget, setAutoTarget] = useState<AutomationTarget>("volume");
  const [timeMs, setTimeMs] = useState(500);
  const [points, setPoints] = useState<AutomationPoint[]>([]);
  const [sampled, setSampled] = useState<number | null>(null);
  const [loudness, setLoudness] = useState<LoudnessReport | null>(null);
  const [loudnessDurationSec, setLoudnessDurationSec] = useState<number | null>(
    null,
  );
  const [measureState, setMeasureState] = useState<MeasureState>("idle");
  const [measureError, setMeasureError] = useState<string | null>(null);
  const [active, setActive] = useState(productionIsActive());
  const [effects, setEffects] = useState<TrackEffectSlot[]>([]);
  const [routes, setRoutes] = useState<SidechainRoute[]>([]);
  const [scError, setScError] = useState<string | null>(null);
  const [grByEffect, setGrByEffect] = useState<Record<string, number>>({});
  const measureGen = useRef(0);

  const tracks = mix?.tracks ?? [];
  const activeTrack = trackId || tracks[0]?.id || "";

  const syncFromOverlay = useCallback(() => {
    setActive(productionIsActive());
    const o = getProductionOverlay();
    if (!o) {
      setPoints([]);
      setEffects([]);
      setRoutes([]);
      return;
    }
    if (autoTarget === "volume") {
      setPoints(o.volumePointsByTrack[activeTrack] ?? []);
    } else {
      setPoints(o.panPointsByTrack[activeTrack] ?? []);
    }
    setEffects(o.effectsByTrack[activeTrack] ?? []);
    setRoutes(o.sidechainRoutes);
  }, [activeTrack, autoTarget]);

  useEffect(() => {
    return subscribeProduction(() => syncFromOverlay());
  }, [syncFromOverlay]);

  useEffect(() => {
    if (!mix) return;
    ensureProductionOverlay(mix.id);
    syncFromOverlay();
  }, [mix?.id, activeTrack, autoTarget, mix, syncFromOverlay]);

  const persistPoints = (next: AutomationPoint[]) => {
    if (!mix || !activeTrack) return;
    setPoints(next);
    if (autoTarget === "volume") {
      patchProductionOverlay({
        mixId: mix.id,
        volumePointsByTrack: { [activeTrack]: next },
      });
    } else {
      patchProductionOverlay({
        mixId: mix.id,
        panPointsByTrack: { [activeTrack]: next },
      });
    }
  };

  const sampleAutomation = () => {
    if (!mix || !activeTrack) return;
    const toolkit = getProductionToolkit();
    setSampled(
      toolkit.automation.sampleAt(mix.id, activeTrack, autoTarget, timeMs),
    );
  };

  const measureLoudness = async () => {
    if (!mix) return;
    const gen = ++measureGen.current;
    setMeasureState("measuring");
    setMeasureError(null);
    try {
      if (!sources || sources.mode !== "stems" || sources.stems.length === 0) {
        throw new Error(t("phase3.mix.loudnessNeedStems"));
      }
      const { stems, sampleRate } = await decodeMixStems(sources, mix);
      if (gen !== measureGen.current) return;
      const baked = bakeMixPcm(mix, stems, getProductionToolkit(), {
        tempoBpm,
      });
      const sr = sampleRate || mix.sampleRate || 48000;
      const toolkit = getProductionToolkit();
      const report = toolkit.loudness.measurePcm(
        baked.pcm,
        sr,
        "ebu_r128",
      );
      if (gen !== measureGen.current) return;
      const gr: Record<string, number> = {};
      for (const fx of toolkit.effects.list(activeTrack)) {
        if (fx.kind !== "compressor") continue;
        const v = toolkit.effects.getGainReductionDb(activeTrack, fx.id);
        if (v != null) gr[fx.id] = v;
      }
      setGrByEffect(gr);
      setLoudness(report);
      setLoudnessDurationSec(baked.frameCount / sr);
      setMeasureState("idle");
    } catch (e) {
      if (gen !== measureGen.current) return;
      setLoudness(null);
      setLoudnessDurationSec(null);
      setMeasureState("error");
      setMeasureError(e instanceof Error ? e.message : String(e));
    }
  };

  const addEffect = (kind: UiEffectKind) => {
    if (!mix || !activeTrack) return;
    const params = defaultEffectParams(kind);
    if (
      kind === "delay" &&
      typeof tempoBpm === "number" &&
      tempoBpm > 0 &&
      (params.tempoBpm === 0 || params.tempoBpm == null)
    ) {
      params.tempoBpm = tempoBpm;
    }
    const slot: TrackEffectSlot = {
      id: newEffectId(kind),
      kind,
      enabled: true,
      params,
    };
    const next = [...effects, slot];
    setEffects(next);
    setTrackEffects(mix.id, activeTrack, next);
  };

  const updateEffect = (id: string, patch: Partial<TrackEffectSlot>) => {
    if (!mix || !activeTrack) return;
    const next = effects.map((e) => (e.id === id ? { ...e, ...patch } : e));
    setEffects(next);
    setTrackEffects(mix.id, activeTrack, next);
  };

  const updateEffectParam = (
    id: string,
    key: string,
    value: number | string | boolean,
  ) => {
    if (!mix || !activeTrack) return;
    const next = effects.map((e) =>
      e.id === id ? { ...e, params: { ...e.params, [key]: value } } : e,
    );
    setEffects(next);
    setTrackEffects(mix.id, activeTrack, next);
  };

  const removeEffect = (id: string) => {
    if (!mix || !activeTrack) return;
    const next = effects.filter((e) => e.id !== id);
    setEffects(next);
    setTrackEffects(mix.id, activeTrack, next);
  };

  const moveEffect = (id: string, dir: -1 | 1) => {
    if (!mix || !activeTrack) return;
    const idx = effects.findIndex((e) => e.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= effects.length) return;
    const next = [...effects];
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    setEffects(next);
    setTrackEffects(mix.id, activeTrack, next);
  };

  const validateRoute = (route: SidechainRoute): string | null => {
    if (route.sourceTrackId === route.destinationTrackId) {
      return t("phase3.mix.sidechainSameTrack");
    }
    const ids = new Set(tracks.map((tr) => tr.id));
    if (!ids.has(route.sourceTrackId) || !ids.has(route.destinationTrackId)) {
      return t("phase3.mix.sidechainMissingTrack");
    }
    return null;
  };

  const persistRoutes = (next: SidechainRoute[]) => {
    if (!mix) return;
    setScError(null);
    for (const r of next) {
      const err = validateRoute(r);
      if (err) {
        setScError(err);
        setRoutes(next);
        return;
      }
    }
    setRoutes(next);
    setSidechainRoutes(mix.id, next);
  };

  const addRoute = () => {
    if (!mix || tracks.length < 2) {
      setScError(t("phase3.mix.sidechainNeedTracks"));
      return;
    }
    const source = tracks.find((tr) => tr.role.toLowerCase() === "drums") ?? tracks[0]!;
    const dest =
      tracks.find((tr) => tr.id !== source.id && tr.role.toLowerCase() === "other") ??
      tracks.find((tr) => tr.id !== source.id)!;
    const route: SidechainRoute = {
      id: newEffectId("compressor").replace("compressor", "sc"),
      sourceTrackId: source.id,
      destinationTrackId: dest.id,
      thresholdDb: -24,
      ratio: 4,
      enabled: true,
    };
    persistRoutes([...routes, route]);
  };

  const honesty = useMemo(
    () => (active ? t("phase3.mix.wiredActive") : t("phase3.mix.wiredIdle")),
    [active],
  );

  return (
    <section className="phase3-panel phase3-mix" aria-label={t("phase3.mix.title")}>
      <p className={`hint ${active ? "ok" : ""}`}>{honesty}</p>

      {!mix ? (
        <p className="hint">{t("phase3.mix.needMix")}</p>
      ) : (
        <>
          <div className="phase3-fields">
            <label className="phase3-field">
              <span>{t("phase3.mix.track")}</span>
              <select
                value={activeTrack}
                onChange={(e) => setTrackId(e.target.value)}
              >
                {tracks.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="phase3-field">
              <span>{t("phase3.mix.autoTarget")}</span>
              <select
                value={autoTarget}
                onChange={(e) =>
                  setAutoTarget(e.target.value as AutomationTarget)
                }
              >
                <option value="volume">{t("phase3.mix.targetVolume")}</option>
                <option value="pan">{t("phase3.mix.targetPan")}</option>
              </select>
            </label>
            <label className="phase3-field">
              <span>{t("phase3.mix.timeMs")}</span>
              <input
                type="number"
                min={0}
                value={timeMs}
                onChange={(e) => setTimeMs(Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <div className="phase3-auto-block">
            <p className="phase3-subhead">{t("phase3.mix.automationLane")}</p>
            <p className="hint">{t("phase3.mix.automationHint")}</p>
            <AutomationLaneEditor
              points={points}
              target={autoTarget}
              onChange={persistPoints}
            />
            <div className="btn-row phase3-actions">
              <button type="button" className="btn" onClick={sampleAutomation}>
                {t("phase3.mix.sampleAutomation")}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => persistPoints([])}
              >
                {t("phase3.mix.clearAutomation")}
              </button>
            </div>
            {sampled != null && (
              <p className="phase3-result">
                {t("phase3.mix.sampled")}:{" "}
                <strong>
                  {sampled.toFixed(2)}
                  {autoTarget === "volume" ? " dB" : ""}
                </strong>
              </p>
            )}
          </div>

          <fieldset className="phase3-fx">
            <legend>{t("phase3.mix.fxLegend")}</legend>
            <p className="hint">{t("phase3.mix.fxHint")}</p>
            <div className="btn-row">
              {UI_EFFECT_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="btn"
                  onClick={() => addEffect(kind)}
                >
                  {t(FX_ADD_LABEL[kind])}
                </button>
              ))}
            </div>
            {effects.length === 0 ? (
              <p className="hint">{t("phase3.mix.fxEmpty")}</p>
            ) : (
              <ul className="phase3-fx-list">
                {effects.map((fx, index) => (
                  <li key={fx.id} className="phase3-fx-item">
                    <div className="phase3-fx-item-head">
                      <label className="phase3-check">
                        <input
                          type="checkbox"
                          checked={fx.enabled}
                          onChange={(e) =>
                            updateEffect(fx.id, { enabled: e.target.checked })
                          }
                        />
                        <span>
                          {isUiEffectKind(fx.kind)
                            ? t(FX_LABEL[fx.kind])
                            : fx.kind}
                        </span>
                      </label>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn"
                          disabled={index === 0}
                          onClick={() => moveEffect(fx.id, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={index === effects.length - 1}
                          onClick={() => moveEffect(fx.id, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => removeEffect(fx.id)}
                        >
                          {t("phase3.mix.fxRemove")}
                        </button>
                      </div>
                    </div>
                    <div className="phase3-fields">
                      {fx.kind === "limiter" && (
                        <label className="phase3-field">
                          <span>{t("phase3.mix.param.ceilingDb")}</span>
                          <input
                            type="number"
                            step={0.1}
                            value={Number(fx.params.ceilingDb ?? -1)}
                            onChange={(e) =>
                              updateEffectParam(
                                fx.id,
                                "ceilingDb",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                      )}
                      {fx.kind === "compressor" && (
                        <>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.thresholdDb")}</span>
                            <input
                              type="number"
                              step={0.5}
                              value={Number(fx.params.thresholdDb ?? -18)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "thresholdDb",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.ratio")}</span>
                            <input
                              type="number"
                              step={0.1}
                              min={1}
                              max={20}
                              value={Number(fx.params.ratio ?? 3)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "ratio",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.attackMs")}</span>
                            <input
                              type="number"
                              step={1}
                              min={0}
                              max={500}
                              value={Number(fx.params.attackMs ?? 10)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "attackMs",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.releaseMs")}</span>
                            <input
                              type="number"
                              step={1}
                              min={1}
                              max={2000}
                              value={Number(fx.params.releaseMs ?? 100)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "releaseMs",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.kneeDb")}</span>
                            <input
                              type="number"
                              step={0.5}
                              min={0}
                              max={24}
                              value={Number(fx.params.kneeDb ?? 0)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "kneeDb",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.makeupDb")}</span>
                            <input
                              type="number"
                              step={0.5}
                              value={Number(fx.params.makeupDb ?? 0)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "makeupDb",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          {grByEffect[fx.id] != null && (
                            <p className="hint">
                              {t("phase3.mix.param.gainReduction")}:{" "}
                              <strong>
                                −{grByEffect[fx.id]!.toFixed(1)} dB
                              </strong>
                            </p>
                          )}
                        </>
                      )}
                      {fx.kind === "gate" && (
                        <>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.thresholdDb")}</span>
                            <input
                              type="number"
                              step={0.5}
                              value={Number(fx.params.thresholdDb ?? -40)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "thresholdDb",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.ratio")}</span>
                            <input
                              type="number"
                              step={0.5}
                              min={1}
                              max={100}
                              value={Number(fx.params.ratio ?? 10)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "ratio",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.attackMs")}</span>
                            <input
                              type="number"
                              step={0.5}
                              min={0.1}
                              max={200}
                              value={Number(fx.params.attackMs ?? 5)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "attackMs",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.releaseMs")}</span>
                            <input
                              type="number"
                              step={1}
                              min={1}
                              max={2000}
                              value={Number(fx.params.releaseMs ?? 80)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "releaseMs",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.rangeDb")}</span>
                            <input
                              type="number"
                              step={1}
                              min={0}
                              max={90}
                              value={Number(fx.params.rangeDb ?? 60)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "rangeDb",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                        </>
                      )}
                      {fx.kind === "eq" && (
                        <label className="phase3-field">
                          <span>{t("phase3.mix.param.gainDb")}</span>
                          <input
                            type="number"
                            step={0.5}
                            value={Number(fx.params.gainDb ?? 0)}
                            onChange={(e) =>
                              updateEffectParam(
                                fx.id,
                                "gainDb",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                      )}
                      {fx.kind === "filter" && (
                        <>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.filterMode")}</span>
                            <select
                              value={String(fx.params.mode ?? "highpass")}
                              onChange={(e) =>
                                updateEffectParam(fx.id, "mode", e.target.value)
                              }
                            >
                              <option value="highpass">
                                {t("phase3.mix.param.filterHighpass")}
                              </option>
                              <option value="lowpass">
                                {t("phase3.mix.param.filterLowpass")}
                              </option>
                            </select>
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.frequencyHz")}</span>
                            <input
                              type="number"
                              step={1}
                              min={20}
                              max={20000}
                              value={Number(fx.params.frequencyHz ?? 80)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "frequencyHz",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.slopeDbPerOct")}</span>
                            <select
                              value={String(fx.params.slopeDbPerOct ?? 12)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "slopeDbPerOct",
                                  Number(e.target.value),
                                )
                              }
                            >
                              <option value={12}>12 dB/oct</option>
                              <option value={24}>24 dB/oct</option>
                            </select>
                          </label>
                        </>
                      )}
                      {fx.kind === "parametricEq" && (
                        <>
                          <p className="hint">{t("phase3.mix.param.eqBandsHint")}</p>
                          {[0, 1, 2, 3].map((bi) => (
                            <div key={bi} className="phase3-fields">
                              <label className="phase3-check">
                                <input
                                  type="checkbox"
                                  checked={fx.params[`band${bi}Enabled`] !== false}
                                  onChange={(e) =>
                                    updateEffectParam(
                                      fx.id,
                                      `band${bi}Enabled`,
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>
                                  {t("phase3.mix.param.band")} {bi + 1}
                                </span>
                              </label>
                              <label className="phase3-field">
                                <span>{t("phase3.mix.param.curveType")}</span>
                                <select
                                  value={String(
                                    fx.params[`band${bi}Type`] ?? "peak",
                                  )}
                                  onChange={(e) =>
                                    updateEffectParam(
                                      fx.id,
                                      `band${bi}Type`,
                                      e.target.value,
                                    )
                                  }
                                >
                                  {PARAM_EQ_TYPES.map((tp) => (
                                    <option key={tp} value={tp}>
                                      {t(CURVE_LABEL[tp])}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="phase3-field">
                                <span>{t("phase3.mix.param.frequencyHz")}</span>
                                <input
                                  type="number"
                                  step={1}
                                  min={20}
                                  max={20000}
                                  value={Number(
                                    fx.params[`band${bi}Freq`] ?? 1000,
                                  )}
                                  onChange={(e) =>
                                    updateEffectParam(
                                      fx.id,
                                      `band${bi}Freq`,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                              <label className="phase3-field">
                                <span>{t("phase3.mix.param.gainDb")}</span>
                                <input
                                  type="number"
                                  step={0.5}
                                  min={-24}
                                  max={24}
                                  value={Number(
                                    fx.params[`band${bi}Gain`] ?? 0,
                                  )}
                                  onChange={(e) =>
                                    updateEffectParam(
                                      fx.id,
                                      `band${bi}Gain`,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                              <label className="phase3-field">
                                <span>{t("phase3.mix.param.q")}</span>
                                <input
                                  type="number"
                                  step={0.05}
                                  min={0.1}
                                  max={18}
                                  value={Number(fx.params[`band${bi}Q`] ?? 0.7)}
                                  onChange={(e) =>
                                    updateEffectParam(
                                      fx.id,
                                      `band${bi}Q`,
                                      Number(e.target.value),
                                    )
                                  }
                                />
                              </label>
                            </div>
                          ))}
                        </>
                      )}
                      {fx.kind === "delay" && (
                        <>
                          <label className="phase3-check">
                            <input
                              type="checkbox"
                              checked={
                                fx.params.sync === true || fx.params.sync === 1
                              }
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "sync",
                                  e.target.checked,
                                )
                              }
                            />
                            <span>{t("phase3.mix.param.delaySync")}</span>
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.delayMs")}</span>
                            <input
                              type="number"
                              step={1}
                              min={1}
                              max={2000}
                              value={Number(fx.params.delayMs ?? 350)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "delayMs",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.division")}</span>
                            <select
                              value={String(fx.params.division ?? "1/4")}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "division",
                                  e.target.value,
                                )
                              }
                            >
                              {DELAY_DIV_OPTIONS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.tempoBpm")}</span>
                            <input
                              type="number"
                              step={1}
                              min={0}
                              max={300}
                              value={Number(
                                fx.params.tempoBpm ?? tempoBpm ?? 0,
                              )}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "tempoBpm",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.feedback")}</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={0.95}
                              value={Number(fx.params.feedback ?? 0.35)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "feedback",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.mix")}</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={1}
                              value={Number(fx.params.mix ?? 0.35)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "mix",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <p className="hint">{t("phase3.mix.param.delayHint")}</p>
                        </>
                      )}
                      {fx.kind === "reverb" && (
                        <>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.mix")}</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={1}
                              value={Number(fx.params.mix ?? 0.35)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "mix",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.roomSize")}</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={1}
                              value={Number(fx.params.roomSize ?? 0.55)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "roomSize",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.damping")}</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={1}
                              value={Number(fx.params.damping ?? 0.45)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "damping",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                          <label className="phase3-field">
                            <span>{t("phase3.mix.param.width")}</span>
                            <input
                              type="number"
                              step={0.05}
                              min={0}
                              max={1}
                              value={Number(fx.params.width ?? 1)}
                              onChange={(e) =>
                                updateEffectParam(
                                  fx.id,
                                  "width",
                                  Number(e.target.value),
                                )
                              }
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset className="phase3-fx">
            <legend>{t("phase3.mix.sidechainLegend")}</legend>
            <p className="hint">{t("phase3.mix.sidechainHint")}</p>
            <button type="button" className="btn" onClick={addRoute}>
              {t("phase3.mix.sidechainAdd")}
            </button>
            {routes.length === 0 ? (
              <p className="hint">{t("phase3.mix.sidechainEmpty")}</p>
            ) : (
              <ul className="phase3-fx-list">
                {routes.map((route) => (
                  <li key={route.id} className="phase3-fx-item">
                    <div className="phase3-fields">
                      <label className="phase3-field">
                        <span>{t("phase3.mix.sidechainSource")}</span>
                        <select
                          value={route.sourceTrackId}
                          onChange={(e) =>
                            persistRoutes(
                              routes.map((r) =>
                                r.id === route.id
                                  ? { ...r, sourceTrackId: e.target.value }
                                  : r,
                              ),
                            )
                          }
                        >
                          {tracks.map((tr) => (
                            <option key={tr.id} value={tr.id}>
                              {tr.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="phase3-field">
                        <span>{t("phase3.mix.sidechainDest")}</span>
                        <select
                          value={route.destinationTrackId}
                          onChange={(e) =>
                            persistRoutes(
                              routes.map((r) =>
                                r.id === route.id
                                  ? {
                                      ...r,
                                      destinationTrackId: e.target.value,
                                    }
                                  : r,
                              ),
                            )
                          }
                        >
                          {tracks.map((tr) => (
                            <option key={tr.id} value={tr.id}>
                              {tr.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="phase3-field">
                        <span>{t("phase3.mix.param.thresholdDb")}</span>
                        <input
                          type="number"
                          step={0.5}
                          value={route.thresholdDb}
                          onChange={(e) =>
                            persistRoutes(
                              routes.map((r) =>
                                r.id === route.id
                                  ? {
                                      ...r,
                                      thresholdDb: Number(e.target.value),
                                    }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="phase3-field">
                        <span>{t("phase3.mix.param.ratio")}</span>
                        <input
                          type="number"
                          step={0.1}
                          min={1}
                          value={route.ratio}
                          onChange={(e) =>
                            persistRoutes(
                              routes.map((r) =>
                                r.id === route.id
                                  ? { ...r, ratio: Number(e.target.value) }
                                  : r,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="phase3-fx-item-head">
                      <label className="phase3-check">
                        <input
                          type="checkbox"
                          checked={route.enabled}
                          onChange={(e) =>
                            persistRoutes(
                              routes.map((r) =>
                                r.id === route.id
                                  ? { ...r, enabled: e.target.checked }
                                  : r,
                              ),
                            )
                          }
                        />
                        <span>{t("phase3.mix.sidechainEnabled")}</span>
                      </label>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          persistRoutes(routes.filter((r) => r.id !== route.id))
                        }
                      >
                        {t("phase3.mix.fxRemove")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {scError && <p className="hint error">{scError}</p>}
          </fieldset>

          <div className="btn-row phase3-actions">
            <button
              type="button"
              className="btn primary"
              disabled={measureState === "measuring"}
              onClick={() => void measureLoudness()}
            >
              {measureState === "measuring"
                ? t("phase3.mix.loudnessMeasuring")
                : t("phase3.mix.runLimiterMeter")}
            </button>
          </div>
          {measureError && <p className="hint error">{measureError}</p>}
          {loudness && (
            <p className="phase3-result">
              {t("phase3.mix.loudness")}:{" "}
              {loudness.integratedLufs?.toFixed(1) ?? "—"} LUFS ·{" "}
              {t("phase3.mix.truePeak")}:{" "}
              {loudness.truePeakDbfs?.toFixed(1) ?? "—"} dBFS
              {loudnessDurationSec != null && (
                <>
                  {" "}
                  · {t("phase3.mix.loudnessDuration")}:{" "}
                  {loudnessDurationSec.toFixed(2)} s
                </>
              )}
              <br />
              <span className="hint">{t("phase3.mix.loudnessNote")}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
