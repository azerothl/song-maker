import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AutomationPoint } from "@song-maker/mix-production";
import { ensureProductionOverlay, getProductionOverlay, getProductionToolkit, setAutomationLanePoints, subscribeProduction } from "../../lib/productionState";
import { isTrackAutomationVisible, setTrackAutomationVisible, subscribeTrackAutomationVisible } from "../../lib/productionTrackAutomationVisible";
import { subscribePlaybackPosition } from "../../lib/playbackPosition";
import { profileLocale, t } from "../../ui/i18n";

const clamp = (v: number, lo: number, hi: number) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

/** Shares the overlay used by playback, export and the advanced editor. */
export function ProductionTrackAutomation({ mixId, trackId, trackName, durationMs, currentMs, locked=false, nudgeMs=50, onCollapse }: {
  mixId: string; trackId: string; trackName: string; durationMs: number; currentMs: number;
  locked?: boolean; nudgeMs?: number; onCollapse?: () => void;
}) {
  const visible = useSyncExternalStore(subscribeTrackAutomationVisible, () => isTrackAutomationVisible(trackId), () => false);
  const overlay = useSyncExternalStore(subscribeProduction, getProductionOverlay, () => null);
  const [target, setTarget] = useState<"volume" | "pan">("volume");
  const [restore, setRestore] = useState<{ target: "volume" | "pan"; points: AutomationPoint[] } | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [sampled, setSampled] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLElement>(null);
  const playheadLine = useRef<SVGLineElement>(null);
  const focusTime = useRef<number | null>(null);
  const dragTime = useRef<number | null>(null);
  const dragBefore = useRef<{target:"volume"|"pan";points:AutomationPoint[]}|null>(null);
  useEffect(() => { if (visible) ensureProductionOverlay(mixId); }, [visible, mixId]);
  useEffect(() => {
    if (focusTime.current == null) return;
    const button = Array.from(root.current?.querySelectorAll<HTMLButtonElement>(".production-auto-point")??[]).find(el=>Number(el.dataset.timeMs)===focusTime.current);
    if (button) { button.focus(); focusTime.current=null; }
  }, [overlay, target, visible]);
  useEffect(() => {
    const cancel = (event:KeyboardEvent) => {
      if (event.key!=="Escape" || !dragBefore.current) return;
      event.preventDefault();event.stopImmediatePropagation();
      setAutomationLanePoints(mixId,trackId,dragBefore.current.target,dragBefore.current.points);
      dragBefore.current=null;dragTime.current=null;
    };
    window.addEventListener("keydown",cancel,true);
    return ()=>window.removeEventListener("keydown",cancel,true);
  }, [mixId,trackId]);
  const maxMs = Math.max(1, durationMs);
  useEffect(() => {
    if (!visible) return;
    const apply = (ms: number) => {
      const x = Math.min(100, Math.max(0, (ms / maxMs) * 100));
      if (playheadLine.current) {
        playheadLine.current.setAttribute("x1", String(x));
        playheadLine.current.setAttribute("x2", String(x));
      }
    };
    apply(currentMs);
    return subscribePlaybackPosition((seconds) => apply(seconds * 1000));
  }, [visible, currentMs, maxMs]);
  if (!visible) return null;
  const lo = target === "volume" ? -24 : -1;
  const hi = target === "volume" ? 12 : 1;
  const step = target === "volume" ? 0.1 : 0.01;
  const points = overlay?.mixId === mixId
    ? (target === "volume" ? overlay.volumePointsByTrack[trackId] : overlay.panPointsByTrack[trackId]) ?? [] : [];
  const targetLabel = t(target === "volume" ? "phase3.mix.targetVolume" : "phase3.mix.targetPan");
  const nf = new Intl.NumberFormat(profileLocale(), { maximumFractionDigits: 2 });
  const label = (point: AutomationPoint, index=0) => t("production.auto.point", {
    index:index+1,time: nf.format(point.timeMs), value: nf.format(point.value), unit: target === "volume" ? t("production.unit.db") : "",
  });
  const persist = (next: AutomationPoint[], focusIndex?: number) => {
    setRestore(null);
    setSampled(null);
    const sorted = [...next].sort((a,b) => a.timeMs-b.timeMs);
    if (focusIndex != null && sorted[focusIndex]) {
      setAnnouncement(label(sorted[focusIndex], focusIndex));
    } else if (!sorted.length) {
      setAnnouncement(t("production.auto.empty"));
    } else {
      setAnnouncement(t("production.auto.points",{count:nf.format(sorted.length)}));
    }
    setAutomationLanePoints(mixId, trackId, target, sorted);
  };
  const add = (timeMs: number, value = getProductionToolkit().automation.sampleAt(mixId,trackId,target,timeMs)) => {
    const time = clamp(Math.round(timeMs), 0, maxMs);
    focusTime.current=time;
    persist([...points.filter(p => p.timeMs !== time), { timeMs: time, value: clamp(value,lo,hi) }]);
  };
  const update = (index: number, patch: Partial<AutomationPoint>, focus=false) => {
    const point = { ...points[index], ...patch };
    point.timeMs = clamp(Math.round(point.timeMs),index>0?points[index-1].timeMs+1:0,index<points.length-1?points[index+1].timeMs-1:maxMs);
    point.value = clamp(point.value,lo,hi);
    if(focus)focusTime.current=point.timeMs;
    const next = points.filter((p,i) => i !== index && p.timeMs !== point.timeMs).concat(point);
    const sortedIndex = [...next].sort((a,b)=>a.timeMs-b.timeMs).findIndex(p=>p.timeMs===point.timeMs);
    persist(next, focus ? Math.max(0, sortedIndex) : undefined);
  };
  const remove = (index:number) => {
    const next=points.filter((_,i)=>i!==index);
    focusTime.current=next[Math.min(index,next.length-1)]?.timeMs ?? null;
    persist(next);
    if(!next.length) root.current?.querySelector<HTMLButtonElement>(".production-auto-add-playback")?.focus();
  };
  return <section ref={root} id={`production-auto-${encodeURIComponent(trackId)}`} className="production-track-automation" role="group" aria-label={t("production.auto.track", { track: trackName })}>
    {locked && <p className="hint">{t("production.auto.locked")}</p>}
    <fieldset disabled={locked} className="production-auto-controls">
    <svg className="production-auto-curve" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" onDoubleClick={e=>{
        if(locked)return;
        const rect=e.currentTarget.getBoundingClientRect();
        const index=points.findIndex(p=>Math.hypot(rect.left+p.timeMs/maxMs*rect.width-e.clientX,rect.top+(hi-p.value)/(hi-lo)*rect.height-e.clientY)<=12);
        if(index>=0)persist(points.filter((_,i)=>i!==index));
      }} onPointerDown={e => {
        if(locked)return;
        dragBefore.current={target,points:points.map(p=>({...p}))};
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
        const value = clamp(hi-(e.clientY-rect.top)/rect.height*(hi-lo),lo,hi);
        const fresh = getProductionOverlay();
        const latest = (target === "volume" ? fresh?.volumePointsByTrack[trackId] : fresh?.panPointsByTrack[trackId]) ?? [];
        const index=latest.findIndex(p=>p.timeMs===dragTime.current);
        if(index<0)return;
        const time = clamp(Math.round((e.clientX-rect.left)/rect.width*maxMs),index>0?latest[index-1].timeMs+1:0,index<latest.length-1?latest[index+1].timeMs-1:maxMs);
        persist(latest.filter(p => p.timeMs !== dragTime.current && p.timeMs !== time).concat({timeMs:time,value}));
        dragTime.current = time;
      }} onPointerUp={() => { dragTime.current = null;dragBefore.current=null; }} onPointerCancel={() => {
        if(dragBefore.current)setAutomationLanePoints(mixId,trackId,dragBefore.current.target,dragBefore.current.points);
        dragTime.current = null;dragBefore.current=null;
      }}>
      <line x1="0" x2="100" y1={hi/(hi-lo)*100} y2={hi/(hi-lo)*100} className="production-auto-zero" />
      <line ref={playheadLine} x1={clamp(currentMs/maxMs*100,0,100)} x2={clamp(currentMs/maxMs*100,0,100)} y1="0" y2="100" className="production-auto-playback-line" />
      <polyline points={points.map(p => `${p.timeMs/maxMs*100},${(hi-p.value)/(hi-lo)*100}`).join(" ")} />
      {points.map((p,i) => <ellipse key={i} cx={p.timeMs/maxMs*100} cy={(hi-p.value)/(hi-lo)*100} rx="0.7" ry="4" />)}
    </svg>
    <div className="production-auto-toolbar">
      <button type="button" className="btn" aria-expanded="true" aria-controls={`production-auto-${encodeURIComponent(trackId)}`} onClick={()=>{
        setTrackAutomationVisible(trackId,false);onCollapse?.();
      }}>{t("production.auto.collapse",{track:trackName})}</button>
      <label>{t("production.auto.target")} <select aria-label={t("production.auto.targetNamed",{track:trackName})} value={target} onChange={e => {setTarget(e.target.value as "volume" | "pan");setSampled(null);}}>
        <option value="volume">{t("phase3.mix.targetVolume")}</option><option value="pan">{t("phase3.mix.targetPan")}</option>
      </select></label>
      <button type="button" className="btn production-auto-add-playback" onClick={() => add(currentMs)}>{t("production.auto.addPlayback")}</button>
      <button type="button" className="btn" disabled={!points.length} onClick={() => {
        setRestore({ target, points: points.map(p => ({ ...p })) });
        setAutomationLanePoints(mixId,trackId,target,[]);
        setSampled(null);setAnnouncement(t("production.auto.empty"));
      }}>{t("phase3.mix.clearAutomation")}</button>
      {restore && <button type="button" className="btn" onClick={() => {
        setAutomationLanePoints(mixId,trackId,restore.target,restore.points); setRestore(null);
      }}>{t("production.auto.restore")}</button>}
    </div>
    <p className="hint">{t("production.auto.laneNamed", { target: targetLabel })}</p>
    {!points.length && <p className="hint" data-testid="production-auto-empty">{t("production.auto.empty")}</p>}
    <ol className="production-auto-points">
      {points.map((p,i) => <li key={i}>
        <button type="button" className="btn production-auto-point" role="slider" data-time-ms={p.timeMs} aria-valuemin={0} aria-valuemax={maxMs} aria-valuenow={p.timeMs} aria-valuetext={label(p,i)} aria-label={label(p,i)} onKeyDown={e => {
          if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Delete","Backspace","Home","End"].includes(e.key)) return;
          e.preventDefault();
          e.stopPropagation();
          if(e.key==="Home" || e.key==="End"){
            const buttons=root.current?.querySelectorAll<HTMLButtonElement>(".production-auto-point");
            buttons?.[e.key==="Home"?0:buttons.length-1]?.focus();return;
          }
          if (e.key === "Delete" || e.key === "Backspace") remove(i);
          else update(i,e.key === "ArrowLeft" || e.key === "ArrowRight"
            ? {timeMs:clamp(p.timeMs+(e.key === "ArrowLeft" ? -nudgeMs:nudgeMs)*(e.shiftKey?10:1),
                i > 0 ? points[i-1].timeMs+1 : 0, i < points.length-1 ? points[i+1].timeMs-1 : maxMs)}
            : {value:Math.round((p.value+(e.key === "ArrowDown" ? -1:1)*(hi-lo)*(e.shiftKey?0.01:0.05))/step)*step},true);
        }}>{label(p,i)}</button>
        <label>{t("production.auto.time")} <input type="number" min={0} max={maxMs} step={1} value={p.timeMs} onChange={e => update(i,{timeMs:Number(e.target.value)})} /></label>
        <label>{targetLabel} <input type="number" min={lo} max={hi} step={step} value={p.value} onChange={e => update(i,{value:Number(e.target.value)})} /></label>
        <button type="button" className="btn" aria-label={t("production.auto.delete",{point:label(p,i)})} onClick={() => remove(i)}>{t("production.auto.remove")}</button>
      </li>)}
    </ol>
    <label>{t("production.auto.time")} <input type="number" min={0} max={maxMs} step={1} value={positionMs} onChange={e => {setPositionMs(clamp(Math.round(Number(e.target.value)),0,maxMs));setSampled(null);}} /></label>
    <button type="button" className="btn" onClick={() => add(positionMs)}>{t("production.auto.addPosition")}</button>
    <button type="button" className="btn" onClick={()=>setSampled(getProductionToolkit().automation.sampleAt(mixId,trackId,target,positionMs))}>{t("phase3.mix.sampleAutomation")}</button>
    {sampled!=null && <p role="status">{t("phase3.mix.sampled")}: {nf.format(sampled)} {target === "volume" ? t("production.unit.db") : ""}</p>}
    <p role="status" aria-live="polite">{announcement || t("production.auto.points",{count:nf.format(points.length)})}</p>
    </fieldset>
  </section>;
}
