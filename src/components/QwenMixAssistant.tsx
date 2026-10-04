import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { measurePlanarStemLevel } from "@song-maker/mix-production";
import { COMMERCIAL_COPY_FORBIDDEN } from "@song-maker/stem-providers";
import { api } from "../lib/api";
import { decodeMixStems } from "../lib/mixBridge";
import { fingerprintProductionState } from "../lib/productionAssistant";
import { getProductionOverlay, subscribeProduction } from "../lib/productionState";
import { applyQwenAdjustments, proposeQwenMix, type QwenMixResponse } from "../lib/qwenMixAssistant";
import { useAppStore } from "../store/appStore";
import type { MixDoc, PlaybackSources } from "../lib/types";
import { profileLocale, t } from "../ui/i18n";
import qwenLicense from "../../docs/model-licenses/Qwen3.5-2B-LICENSE.txt?raw";

const PROVIDER_DEFAULTS: Record<string, string> = {
  ollama: "http://127.0.0.1:11434",
  rbitnet: "http://127.0.0.1:8080",
  openai_compat: "http://127.0.0.1:8080",
  llama_cpp: "http://127.0.0.1:8080",
  external: "http://127.0.0.1:8080",
};

const RBITNET_DEFAULT_MODEL = "qwen2.5-1.5b-instruct-q4_k_m";

type RbitnetStatus = Awaited<ReturnType<typeof api.rbitnetStatus>>;

export function QwenMixAssistant({mix,sources,onCommitMix}: {
  mix: MixDoc; sources: PlaybackSources | null; onCommitMix: (mix:MixDoc)=>void;
}) {
  const overlay=useSyncExternalStore(subscribeProduction,getProductionOverlay,()=>null);
  const settings=useAppStore(s=>s.settings);
  const refreshSettings=useAppStore(s=>s.refreshSettings);
  const [objective,setObjective]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [diagnostic,setDiagnostic]=useState<string|null>(null);
  const [proposal,setProposal]=useState<{result:QwenMixResponse;fingerprint:string;totalElapsedMs:number}|null>(null);
  const [confirm,setConfirm]=useState(false);
  const [undo,setUndo]=useState<MixDoc|null>(null);
  const [provider,setProvider]=useState(settings?.mixLlmProvider??"ollama");
  const [baseUrl,setBaseUrl]=useState(settings?.mixLlmBaseUrl??PROVIDER_DEFAULTS.ollama);
  const [modelId,setModelId]=useState(settings?.mixLlmModelId??"qwen3.5:2b");
  const [allowRemote,setAllowRemote]=useState(Boolean(settings?.mixLlmAllowRemote));
  const [serverBusy,setServerBusy]=useState(false);
  const [serverMsg,setServerMsg]=useState<string|null>(null);
  const [rbitnet,setRbitnet]=useState<RbitnetStatus|null>(null);
  const [sidecarBusy,setSidecarBusy]=useState(false);
  const current=useRef(mix); current.current=mix;
  const fingerprint=fingerprintProductionState(mix,overlay);
  const stale=proposal != null && proposal.fingerprint !== fingerprint;
  const hasStems=sources?.mode === "stems" && sources.stems.length > 0;

  useEffect(()=>{
    if(!settings) return;
    setProvider(settings.mixLlmProvider??"ollama");
    setBaseUrl(settings.mixLlmBaseUrl??PROVIDER_DEFAULTS.ollama);
    setModelId(settings.mixLlmModelId??"qwen3.5:2b");
    setAllowRemote(Boolean(settings.mixLlmAllowRemote));
  },[settings]);

  useEffect(()=>{
    if(provider !== "rbitnet") { setRbitnet(null); return; }
    let cancelled=false;
    void api.rbitnetStatus().then(status=>{ if(!cancelled) setRbitnet(status); }).catch(()=>{ if(!cancelled) setRbitnet(null); });
    return ()=>{ cancelled=true; };
  },[provider,serverMsg,sidecarBusy]);

  const onProviderChange=(next:string)=>{
    setProvider(next);
    setBaseUrl(PROVIDER_DEFAULTS[next]??PROVIDER_DEFAULTS.openai_compat);
    if(next === "rbitnet") setModelId(RBITNET_DEFAULT_MODEL);
    if(next === "ollama") setModelId("qwen3.5:2b");
    if(next === "llama_cpp") setModelId("qwen2.5-1.5b-instruct");
    if(next === "external") setModelId("qwen3.5:2b");
    setServerMsg(null);
  };

  const saveServer=async()=>{
    if(!settings||serverBusy) return;
    setServerBusy(true);setServerMsg(null);
    try {
      await api.updateSettings({
        ...settings,
        mixLlmProvider:provider,
        mixLlmBaseUrl:baseUrl.trim()||PROVIDER_DEFAULTS[provider]||PROVIDER_DEFAULTS.ollama,
        mixLlmModelId:modelId.trim()||(provider==="rbitnet"?RBITNET_DEFAULT_MODEL:"qwen3.5:2b"),
        mixLlmAllowRemote:allowRemote,
      });
      await refreshSettings();
      setServerMsg(t("qwen.mix.serverSaved"));
    } catch {
      setServerMsg(t("qwen.mix.serverSaveFailed"));
    } finally {setServerBusy(false);}
  };

  const refreshRbitnet=async()=>{
    try { setRbitnet(await api.rbitnetStatus()); }
    catch { setRbitnet(null); }
  };

  const installBinary=async()=>{
    if(sidecarBusy) return;
    setSidecarBusy(true);setServerMsg(null);
    try {
      await api.installRbitnetBinary();
      await refreshRbitnet();
      setServerMsg(t("qwen.mix.rbitnet.binaryInstalled"));
    } catch {
      setServerMsg(t("qwen.mix.rbitnet.binaryFailed"));
    } finally {setSidecarBusy(false);}
  };

  const installModel=async()=>{
    if(sidecarBusy) return;
    setSidecarBusy(true);setServerMsg(null);
    try {
      await api.installRbitnetModel(modelId.trim()||RBITNET_DEFAULT_MODEL);
      await refreshRbitnet();
      setServerMsg(t("qwen.mix.rbitnet.modelInstalled"));
    } catch {
      setServerMsg(t("qwen.mix.rbitnet.modelFailed"));
    } finally {setSidecarBusy(false);}
  };

  const startSidecar=async()=>{
    if(sidecarBusy) return;
    setSidecarBusy(true);setServerMsg(null);
    try {
      const result=await api.ensureRbitnetSidecar(modelId.trim()||RBITNET_DEFAULT_MODEL);
      setBaseUrl(result.baseUrl);
      setModelId(result.modelId);
      await refreshSettings();
      await refreshRbitnet();
      setServerMsg(t("qwen.mix.rbitnet.ready"));
    } catch (e) {
      const code=String(e instanceof Error?e.message:e);
      setServerMsg(code.includes("MODEL_MISSING")?t("qwen.mix.rbitnet.needWeights"):t("qwen.mix.rbitnet.startFailed"));
    } finally {setSidecarBusy(false);}
  };

  const run=async () => {
    if (!sources || !hasStems || busy) return;
    setBusy(true);setError(null);setDiagnostic(null);setProposal(null);setConfirm(false);
    const startedMix=mix;
    const startedFingerprint=fingerprint;
    const startedAt=performance.now();
    try {
      const {stems}=await decodeMixStems(sources,startedMix);
      const tracks=startedMix.tracks.map(track => {
        const stem=stems.find(stem=>stem.trackId===track.id);
        const level=measurePlanarStemLevel(track.id,track.role,stem?.left??new Float32Array(0),stem?.right??new Float32Array(0));
        return {id:track.id,name:track.name,role:track.role,gainDb:track.gainDb,pan:track.pan,rmsDb:level.rmsDb,peakDb:level.peakDb};
      });
      const result=await proposeQwenMix(tracks,objective,profileLocale());
      applyQwenAdjustments(startedMix,result.adjustments);
      if(current.current.id===startedMix.id) setProposal({result,fingerprint:startedFingerprint,totalElapsedMs:performance.now()-startedAt});
    } catch (e) {
      const code=String(e instanceof Error?e.message:e);
      const key=code.includes("MODEL_MISSING") ? "qwen.mix.modelMissing"
        : code.includes("REMOTE_BLOCKED") ? "qwen.mix.remoteBlocked"
        : code.includes("RBITNET_BINARY_MISSING") ? "qwen.mix.rbitnet.needBinary"
        : code.includes("SERVICE_UNAVAILABLE") ? "qwen.mix.serviceMissing"
        : code.includes("INVALID_RESPONSE") ? "qwen.mix.invalid" : "qwen.mix.failed";
      setError(t(key));
      setDiagnostic(code.match(/(?:INVALID_RESPONSE|REMOTE_BLOCKED|SERVICE_UNAVAILABLE|MODEL_MISSING)(?::[A-Z0-9_.]+)?/)?.[0]??null);
    } finally {setBusy(false);}
  };
  const nf=new Intl.NumberFormat(profileLocale(),{maximumFractionDigits:2});
  return <section className="qwen-mix-assistant" aria-label={t("qwen.mix.title")}>
    <p className="hint">{t("qwen.mix.local")}</p>
    <details className="qwen-mix-server">
      <summary>{t("qwen.mix.server")}</summary>
      <label>{t("qwen.mix.provider")}
        <select value={provider} onChange={e=>onProviderChange(e.target.value)}>
          <option value="ollama">{t("qwen.mix.provider.ollama")}</option>
          <option value="rbitnet">{t("qwen.mix.provider.rbitnet")}</option>
          <option value="openai_compat">{t("qwen.mix.provider.openaiCompat")}</option>
          <option value="llama_cpp">{t("qwen.mix.provider.llamaCpp")}</option>
          <option value="external">{t("qwen.mix.provider.external")}</option>
        </select>
      </label>
      <label>{t("qwen.mix.baseUrl")}<input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} spellCheck={false} /></label>
      {provider === "rbitnet" ? (
        <label>{t("qwen.mix.rbitnet.model")}
          <select value={modelId} onChange={e=>setModelId(e.target.value)}>
            {(rbitnet?.catalog??[
              {id:RBITNET_DEFAULT_MODEL,labelFr:t("qwen.mix.rbitnet.qwen"),present:false},
              {id:"microsoft-bitnet-b1.58-2b-4t",labelFr:t("qwen.mix.rbitnet.bitnet"),present:false},
            ]).map(entry=>(
              <option key={entry.id} value={entry.id}>{entry.labelFr}{entry.present?" ✓":""}</option>
            ))}
          </select>
        </label>
      ) : (
        <label>{t("qwen.mix.modelId")}<input value={modelId} onChange={e=>setModelId(e.target.value)} spellCheck={false} /></label>
      )}
      <label className="qwen-mix-remote">
        <input type="checkbox" checked={allowRemote} onChange={e=>setAllowRemote(e.target.checked)} />
        {t("qwen.mix.allowRemote")}
      </label>
      {allowRemote && <p className="hint">{t("qwen.mix.allowRemoteWarn")}</p>}
      <button type="button" className="btn" disabled={serverBusy||!settings} onClick={()=>void saveServer()}>{t("qwen.mix.saveServer")}</button>
      {provider === "llama_cpp" && <p className="hint">{t("qwen.mix.llamaCpp.hint")}</p>}
      {provider === "external" && <p className="hint">{t("qwen.mix.external.hint")}</p>}
      {provider === "rbitnet" && (
        <div className="qwen-mix-rbitnet">
          <p className="hint">{t("qwen.mix.rbitnet.weightsNotInInstaller")}</p>
          <p className="hint">{rbitnet?.messageFr ?? t("qwen.mix.rbitnet.hint")}</p>
          <p className="hint">{t("qwen.mix.rbitnet.pin",{tag:rbitnet?.releaseTag??"v0.1.0"})}</p>
          <p className="hint">{t("qwen.mix.rbitnet.jsonQuality")}</p>
          <button type="button" className="btn" disabled={sidecarBusy||Boolean(rbitnet?.binaryPresent)} onClick={()=>void installBinary()}>
            {t(rbitnet?.binaryPresent ? "qwen.mix.rbitnet.binaryOk" : "qwen.mix.rbitnet.installBinary")}
          </button>
          <button type="button" className="btn" disabled={sidecarBusy} onClick={()=>void installModel()}>
            {t("qwen.mix.rbitnet.installModel")}
          </button>
          <button type="button" className="btn" disabled={sidecarBusy} onClick={()=>void startSidecar()}>
            {t("qwen.mix.rbitnet.start")}
          </button>
          {sidecarBusy && <button type="button" className="btn" onClick={()=>void api.cancelRbitnetInstall()}>{t("qwen.mix.rbitnet.cancel")}</button>}
        </div>
      )}
      <details className="qwen-mix-leftovers">
        <summary>{t("qwen.mix.leftovers.title")}</summary>
        <ul>
          <li>{t("qwen.mix.leftovers.weights")}</li>
          <li>{t("qwen.mix.leftovers.e2e")}</li>
          <li>{t("qwen.mix.leftovers.json")}</li>
          <li>{t("qwen.mix.leftovers.llama")}</li>
          <li>{t("qwen.mix.leftovers.external")}</li>
          <li>{t("qwen.mix.leftovers.foundry")}</li>
        </ul>
      </details>
      {serverMsg && <p className="hint" role="status">{serverMsg}</p>}
    </details>
    <details className="qwen-mix-license">
      <summary>{t("qwen.mix.license")}</summary>
      <p>{t("qwen.mix.licenseNotice")}</p>
      <pre>{qwenLicense}</pre>
    </details>
    <label>{t("qwen.mix.objective")}<textarea maxLength={1000} value={objective} onChange={e=>setObjective(e.target.value)} /></label>
    <button type="button" className="btn" disabled={busy||!hasStems} onClick={()=>void run()}>{t(busy?"qwen.mix.busy":"qwen.mix.analyze")}</button>
    {!hasStems && <p className="hint">{t("qwen.mix.needStems")}</p>}
    <div role="status" aria-live="polite">{error && <p className="hint error">{error}</p>}</div>
    {diagnostic && <details><summary>{t("qwen.mix.diagnostic")}</summary><code>{diagnostic}</code></details>}
    {proposal && <>
      <p className="hint">{t("qwen.mix.measured",{model:proposal.result.model,time:nf.format(proposal.result.elapsedMs/1000)})}</p>
      {Number.isFinite(proposal.totalElapsedMs) && <p className="hint">{t("qwen.mix.totalMeasured",{time:nf.format(proposal.totalElapsedMs/1000)})}</p>}
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
