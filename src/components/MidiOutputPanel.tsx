import { useEffect, useRef, useState } from "react";
import type { ScoreDocument } from "@song-maker/score-engine";
import { connectMidiOutput, disconnectMidiOutput, listMidiOutputs, panicMidiOutput, playMidiOutput, scoreOutputNotes, type MidiOutputPort } from "../lib/midiOutput";
import { t } from "../ui/i18n";

export function MidiOutputPanel({document,voiceId}:{document:ScoreDocument;voiceId?:string|null}) {
 const [ports,setPorts]=useState<MidiOutputPort[]>([]);
 const [portId,setPortId]=useState("");
 const [connected,setConnected]=useState(false);
 const [busy,setBusy]=useState(false);
 const [playing,setPlaying]=useState(false);
 const [channel,setChannel]=useState(1);
 const [program,setProgram]=useState(1);
 const [selectedVoice,setSelectedVoice]=useState(voiceId??document.voices[0]?.id??"");
 const [error,setError]=useState(false);
 const epoch=useRef(0);
 const alive=useRef(true);
 const outputVoice=document.voices.find(voice=>voice.id===selectedVoice)?.id??voiceId??document.voices[0]?.id??"";
 const notes=scoreOutputNotes(document,outputVoice);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;void disconnectMidiOutput().catch(()=>{});};},[]);
 async function refresh() {
  setBusy(true);setError(false);
  try {
   const next=await listMidiOutputs();
   if(!alive.current)return;
   setPorts(next);
   if(!next.some(port=>port.id===portId)) {
    epoch.current++;await disconnectMidiOutput();setConnected(false);setPlaying(false);setPortId("");
   }
  } catch {if(alive.current)setError(true);}
  finally {if(alive.current)setBusy(false);}
 }
 async function select(id:string) {
  epoch.current++;
  setBusy(true);setError(false);setConnected(false);setPlaying(false);setPortId(id);
  try {
   await disconnectMidiOutput();
   if(id)await connectMidiOutput(id);
   if(!alive.current){await disconnectMidiOutput();return;}
   if(alive.current)setConnected(Boolean(id));
  } catch {if(alive.current)setError(true);}
  finally {if(alive.current)setBusy(false);}
 }
 async function play(audition=false) {
  const token=++epoch.current;
  setPlaying(true);setError(false);
  try {await playMidiOutput(audition?[{startMs:0,endMs:3000,pitch:60,velocity:90}]:notes,channel-1,program-1);}
  catch {if(alive.current&&token===epoch.current){setError(true);setConnected(false);}}
  finally {if(alive.current&&token===epoch.current)setPlaying(false);}
 }
 async function panic() {
  epoch.current++;setPlaying(false);setError(false);setBusy(true);
  try {await panicMidiOutput();}catch{if(alive.current)setError(true);}
  finally {if(alive.current)setBusy(false);}
 }
 return <section className="midi-output-panel" aria-label={t("midi.output.title")}>
  <h4>{t("midi.output.title")}</h4>
  <p className="hint">{t("midi.output.hint")}</p>
  <div className="midi-instrument-controls">
   <label>{t("midi.output.voice")}<select aria-label={t("midi.output.voice")} value={outputVoice} disabled={playing} onChange={e=>setSelectedVoice(e.target.value)}>
    {document.voices.map(voice=><option key={voice.id} value={voice.id}>{voice.name||voice.id}</option>)}
   </select></label>
   <button type="button" className="btn" disabled={busy} onClick={()=>void refresh()}>{t("midi.output.refresh")}</button>
   <label>{t("midi.output.port")}<select aria-label={t("midi.output.port")} value={portId} disabled={busy} onChange={e=>void select(e.target.value)}>
    <option value="">{t("midi.output.none")}</option>
    {ports.map(port=><option key={port.id} value={port.id}>{port.name}</option>)}
   </select></label>
   <label>{t("midi.output.channel")}<input type="number" min={1} max={16} step={1} value={channel} disabled={playing} onChange={e=>setChannel(Math.max(1,Math.min(16,Math.round(Number(e.target.value)||1))))}/></label>
   <label>{t("midi.output.program")}<input type="number" min={1} max={128} step={1} value={program} disabled={playing} onChange={e=>setProgram(Math.max(1,Math.min(128,Math.round(Number(e.target.value)||1))))}/></label>
  </div>
  <div className="btn-row">
   <button type="button" className="btn" disabled={!connected||busy||playing||notes.length===0} onClick={()=>void play()}>{t("midi.output.play")}</button>
   <button type="button" className="btn" disabled={!connected||busy||playing} onClick={()=>void play(true)}>{t("midi.audition")}</button>
   <button type="button" className="btn" onClick={()=>void panic()}>{t("midi.output.panic")}</button>
  </div>
  <div role="status" aria-live="polite">{error?<p className="hint error">{t("midi.output.error")}</p>:playing?<p className="hint">{t("midi.output.playing")}</p>:ports.length===0&&!busy?<p className="hint">{t("midi.output.empty")}</p>:null}</div>
 </section>;
}
