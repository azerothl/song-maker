import { invoke } from "@tauri-apps/api/core";
import type { ScoreDocument } from "@song-maker/score-engine";
import { scoreTicksToSeconds } from "./scoreTiming";

export type MidiOutputPort = {id:string;name:string};
export type MidiOutputNote = {startMs:number;endMs:number;pitch:number;velocity:number};
export type MidiOutputSupport = {
  os:string;
  backend:string;
  portCount:number;
  nativeProof:boolean;
  honestyFr:string;
};

export function scoreOutputNotes(document:ScoreDocument,voiceId?:string|null):MidiOutputNote[] {
 const voice=(voiceId?document.voices.find(v=>v.id===voiceId):null)??document.voices[0];
 return (voice?.notes??[]).map(note=>({
  startMs:scoreTicksToSeconds(document,note.startTick)*1000,
  endMs:scoreTicksToSeconds(document,note.startTick+note.durationTick)*1000,
  pitch:note.pitch,velocity:note.velocity,
 }));
}

export const listMidiOutputs=()=>invoke<MidiOutputPort[]>("list_midi_outputs");
export const midiOutputSupport=()=>invoke<MidiOutputSupport>("midi_output_support");
export const connectMidiOutput=(portId:string)=>invoke<void>("connect_midi_output",{portId});
export const panicMidiOutput=()=>invoke<void>("panic_midi_output");
export const disconnectMidiOutput=()=>invoke<void>("disconnect_midi_output");
export const playMidiOutput=(notes:MidiOutputNote[],channel:number,program:number)=>
 invoke<void>("play_midi_output",{notes,channel,program});
