import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AutomationPoint } from "@song-maker/mix-production";
import { ensureProductionOverlay, getProductionOverlay, setAutomationLanePoints, subscribeProduction } from "../../lib/productionState";
import { isTrackAutomationVisible, subscribeTrackAutomationVisible } from "../../lib/productionTrackAutomationVisible";
import { profileLocale, t } from "../../ui/i18n";

const clamp = (v: number, lo: number, hi: number) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/** Shares the overlay used by playback, export and the advanced editor. */
export function ProductionTrackAutomation({ mixId, trackId, trackName, durationMs, currentMs }: {
  mixId: string; trackId: string; trackName: string; durationMs: number; currentMs: number;
}) {
  const visible = useSyncExternalStore(subscribeTrackAutomationVisible, () => isTrackAutomationVisible(trackId), () => false);
  const overlay = useSyncExternalStore(subscribeProduction, getProductionOverlay, () => null);
  const [target, setTarget] = useState<"volume" | "pan">("volume");
  const [restore, setRestore] = useState<{ target: "volume" | "pan"; points: AutomationPoint[] } | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const dragTime = useRef<number | null>(null);
  useEffect(() => { if (visible) ensureProductionOverlay(mixId); }, [visible, mixId]);
  if (!visible) return null;
  const maxMs = Math.max(1, durationMs);
  const lo = target === "volume" ? -24 : -1;
  const hi = target === "volume" ? 12 : 1;
  const step = target === "volume" ? 0.5 : 0.01;
  const points = overlay?.mixId === mixId
    ? (target === "volume" ? overlay.volumePointsByTrack[trackId] : overlay.panPointsByTrack[trackId]) ?? [] : [];
  const targetLabel = t(target === "volume" ? "phase3.mix.targetVolume" : "phase3.mix.targetPan");
  const nf = new Intl.NumberFormat(profileLocale(), { maximumFractionDigits: 2 });
  const label = (point: AutomationPoint) => t("production.auto.point", {
    time: nf.format(point.timeMs), value: nf.format(point.value), unit: target === "volume" ? "dB" : "",
  });
  const persist = (next: AutomationPoint[]) => {
    setRestore(null);
    setAutomationLanePoints(mixId, trackId, target, [...next].sort((a,b) => a.timeMs-b.timeMs));
  };
  const add = (timeMs: number, value = 0) => {
    const time = clamp(Math.round(timeMs), 0, maxMs);
    persist([...points.filter(p => p.timeMs !== time), { timeMs: time, value: clamp(value,lo,hi) }]);
  };
  const update = (index: number, patch: Partial<AutomationPoint>) => {
    const point = { ...points[index], ...patch };
    point.timeMs = clamp(Math.round(point.timeMs),0,maxMs);
    point.value = clamp(point.value,lo,hi);
    persist(points.filter((p,i) => i !== index && p.timeMs !== point.timeMs).concat(point));
  };
  return <section className="production-track-automation" aria-label={t("production.auto.track", { track: trackName })}>
    <div className="production-auto-toolbar">
      <label>{t("production.auto.target")} <select value={target} onChange={e => setTarget(e.target.value as "volume" | "pan")}>
        <option value="volume">{t("phase3.mix.targetVolume")}</option><option value="pan">{t("phase3.mix.targetPan")}</option>
      </select></label>
      <button type="button" className="btn" onClick={() => add(currentMs)}>{t("production.auto.addPlayback")}</button>
      <button type="button" className="btn" disabled={!points.length} onClick={() => {
        setRestore({ target, points: points.map(p => ({ ...p })) });
        setAutomationLanePoints(mixId,trackId,target,[]);
      }}>{t("phase3.mix.clearAutomation")}</button>
      {restore && <button type="button" className="btn" onClick={() => {
        setAutomationLanePoints(mixId,trackId,restore.target,restore.points); setRestore(null);
      }}>{t("production.auto.restore")}</button>}
    </div>
    <p className="hint">{t("production.auto.laneNamed", { target: targetLabel })}</p>
    <svg className="production-auto-curve" viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
      aria-label={t("production.auto.laneNamed", { target: targetLabel })} onPointerDown={e => {
        const rect=e.currentTarget.getBoundingClientRect();
        const nearby = points.find(p => Math.hypot(rect.left+p.timeMs/maxMs*rect.width-e.clientX,
          rect.top+(hi-p.value)/(hi-lo)*rect.height-e.clientY) <= 12);
        e.currentTarget.setPointerCapture(e.pointerId);
        if (nearby) dragTime.current = nearby.timeMs;
        else {
          const time = clamp(Math.round((e.clientX-rect.left)/rect.width*maxMs),0,maxMs);
          add(time,hi-(e.clientY-rect.top)/rect.height*(hi-lo));
          dragTime.current = time;
        }
      }} onPointerMove={e => {
        if (dragTime.current == null) return;
        const rect=e.currentTarget.getBoundingClientRect();
        const time = clamp(Math.round((e.clientX-rect.left)/rect.width*maxMs),0,maxMs);
        const value = clamp(hi-(e.clientY-rect.top)/rect.height*(hi-lo),lo,hi);
        const fresh = getProductionOverlay();
        const latest = (target === "volume" ? fresh?.volumePointsByTrack[trackId] : fresh?.panPointsByTrack[trackId]) ?? [];
        persist(latest.filter(p => p.timeMs !== dragTime.current && p.timeMs !== time).concat({timeMs:time,value}));
        dragTime.current = time;
      }} onPointerUp={() => { dragTime.current = null; }} onPointerCancel={() => { dragTime.current = null; }}>
      <line x1="0" x2="100" y1={hi/(hi-lo)*100} y2={hi/(hi-lo)*100} className="production-auto-zero" />
      <polyline points={points.map(p => `${p.timeMs/maxMs*100},${(hi-p.value)/(hi-lo)*100}`).join(" ")} />
      {points.map((p,i) => <ellipse key={i} cx={p.timeMs/maxMs*100} cy={(hi-p.value)/(hi-lo)*100} rx="0.7" ry="4" />)}
    </svg>
    {!points.length && <p className="hint">{t("production.auto.empty")}</p>}
    <ol className="production-auto-points">
      {points.map((p,i) => <li key={i}>
        <button type="button" className="btn production-auto-point" aria-label={label(p)} onKeyDown={e => {
          if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Delete","Backspace"].includes(e.key)) return;
          e.preventDefault();
          if (e.key === "Delete" || e.key === "Backspace") persist(points.filter((_,index)=>index!==i));
          else update(i,e.key === "ArrowLeft" || e.key === "ArrowRight"
            ? {timeMs:clamp(p.timeMs+(e.key === "ArrowLeft" ? -50:50)*(e.shiftKey?10:1),
                i > 0 ? points[i-1].timeMs+1 : 0, i < points.length-1 ? points[i+1].timeMs-1 : maxMs)}
            : {value:p.value+(e.key === "ArrowDown" ? -step:step)*(e.shiftKey?10:1)});
        }}>{label(p)}</button>
        <label>{t("production.auto.time")} <input type="number" min={0} max={maxMs} step={50} value={p.timeMs} onChange={e => update(i,{timeMs:Number(e.target.value)})} /></label>
        <label>{targetLabel} <input type="number" min={lo} max={hi} step={step} value={p.value} onChange={e => update(i,{value:Number(e.target.value)})} /></label>
        <button type="button" className="btn" aria-label={t("production.auto.delete",{point:label(p)})} onClick={() => persist(points.filter((_,index)=>index!==i))}>{t("production.auto.remove")}</button>
      </li>)}
    </ol>
    <label>{t("production.auto.time")} <input type="number" min={0} max={maxMs} value={positionMs} onChange={e => setPositionMs(clamp(Number(e.target.value),0,maxMs))} /></label>
    <button type="button" className="btn" onClick={() => add(positionMs)}>{t("production.auto.addPosition")}</button>
  </section>;
}
