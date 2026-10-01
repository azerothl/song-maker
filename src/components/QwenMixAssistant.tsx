import { useRef, useState, useSyncExternalStore } from "react";
import { measurePlanarStemLevel } from "@song-maker/mix-production";
import { COMMERCIAL_COPY_FORBIDDEN } from "@song-maker/stem-providers";
import { decodeMixStems } from "../lib/mixBridge";
import { fingerprintProductionState } from "../lib/productionAssistant";
import { getProductionOverlay, subscribeProduction } from "../lib/productionState";
import { applyQwenAdjustments, proposeQwenMix, type QwenMixResponse } from "../lib/qwenMixAssistant";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { profileLocale, t } from "../ui/i18n";

export function QwenMixAssistant({mix,sources,onCommitMix}: {
  mix: MixDoc; sources: PlaybackSources | null; onCommitMix: (mix:MixDoc)=>void;
}) {
  const overlay=useSyncExternalStore(subscribeProduction,getProductionOverlay,()=>null);
  const [objective,setObjective]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [proposal,setProposal]=useState<{result:QwenMixResponse;fingerprint:string}|null>(null);
  const [confirm,setConfirm]=useState(false);
  const [undo,setUndo]=useState<MixDoc|null>(null);
  const current=useRef(mix); current.current=mix;
  const fingerprint=fingerprintProductionState(mix,overlay);
  const stale=proposal != null && proposal.fingerprint !== fingerprint;
  const hasStems=sources?.mode === "stems" && sources.stems.length > 0;
  const run=async () => {
    if (!sources || !hasStems || busy) return;
    setBusy(true);setError(null);setProposal(null);setConfirm(false);
    const startedMix=mix;
    const startedFingerprint=fingerprint;
    try {
      const {stems}=await decodeMixStems(sources,startedMix);
      const tracks=startedMix.tracks.map(track => {
        const stem=stems.find(stem=>stem.trackId===track.id);
        const level=measurePlanarStemLevel(track.id,track.role,stem?.left??new Float32Array(0),stem?.right??new Float32Array(0));
        return {id:track.id,name:track.name,role:track.role,gainDb:track.gainDb,pan:track.pan,rmsDb:level.rmsDb,peakDb:level.peakDb};
      });
      const result=await proposeQwenMix(tracks,objective,profileLocale());
      applyQwenAdjustments(startedMix,result.adjustments);
      if(current.current.id===startedMix.id) setProposal({result,fingerprint:startedFingerprint});
    } catch (e) {
      const code=String(e instanceof Error?e.message:e);
      const key=code.includes("MODEL_MISSING") ? "qwen.mix.modelMissing"
        : code.includes("SERVICE_UNAVAILABLE") ? "qwen.mix.serviceMissing"
        : code.includes("INVALID_RESPONSE") ? "qwen.mix.invalid" : "qwen.mix.failed";
      setError(t(key));
    } finally {setBusy(false);}
  };
  const nf=new Intl.NumberFormat(profileLocale(),{maximumFractionDigits:2});
  return <section className="qwen-mix-assistant" aria-label={t("qwen.mix.title")}>
    <p className="hint">{t("qwen.mix.local")}</p>
    <label>{t("qwen.mix.objective")}<textarea maxLength={1000} value={objective} onChange={e=>setObjective(e.target.value)} /></label>
    <button type="button" className="btn" disabled={busy||!hasStems} onClick={()=>void run()}>{t(busy?"qwen.mix.busy":"qwen.mix.analyze")}</button>
    {!hasStems && <p className="hint">{t("qwen.mix.needStems")}</p>}
    <div role="status" aria-live="polite">{error && <p className="hint error">{error}</p>}</div>
    {proposal && <>
      <p className="hint">{t("qwen.mix.measured",{model:proposal.result.model,time:nf.format(proposal.result.elapsedMs/1000)})}</p>
      <p>{COMMERCIAL_COPY_FORBIDDEN.test(proposal.result.explanation)?t("qwen.mix.rationale"):proposal.result.explanation}</p>
      <ul>{proposal.result.adjustments.map(adjustment=>{
        const track=mix.tracks.find(track=>track.id===adjustment.trackId);
        return <li key={adjustment.trackId}>{track?.name}: {nf.format(track?.gainDb??0)} → {nf.format(adjustment.gainDb)} dB · {t("phase3.mix.targetPan")} {nf.format(adjustment.pan)}</li>;
      })}</ul>
      {stale && <p className="hint error">{t("qwen.mix.stale")}</p>}
      {!proposal.result.adjustments.length && <p>{t("qwen.mix.empty")}</p>}
      <button type="button" className="btn" disabled={stale||!proposal.result.adjustments.length} onClick={()=>setConfirm(true)}>{t("qwen.mix.apply")}</button>
      {confirm && <fieldset><legend>{t("qwen.mix.confirm")}</legend>
        <button type="button" className="btn" disabled={stale} onClick={()=>{
          if(stale)return;setUndo(mix);onCommitMix(applyQwenAdjustments(mix,proposal.result.adjustments));setProposal(null);setConfirm(false);
        }}>{t("qwen.mix.confirmApply")}</button>
        <button type="button" className="btn" onClick={()=>setConfirm(false)}>{t("qwen.mix.cancel")}</button>
      </fieldset>}
    </>}
    {undo && <button type="button" className="btn" onClick={()=>{
      if(undo.id===mix.id)onCommitMix({...mix,tracks:mix.tracks.map(track=>{
        const old=undo.tracks.find(old=>old.id===track.id);return old?{...track,gainDb:old.gainDb,pan:old.pan}:track;
      })});setUndo(null);
    }}>{t("qwen.mix.undo")}</button>}
  </section>;
}
