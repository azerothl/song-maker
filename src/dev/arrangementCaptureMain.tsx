import { useEffect,useState } from "react";
import { createRoot } from "react-dom/client";
import { ClipTimeline } from "../components/ClipTimeline";
import { buildCaptureDemoMix } from "./captureDemoMix";
import type { MixDoc } from "../lib/types";
import "../App.css";
const fixture=buildCaptureDemoMix(2);
fixture.tracks[0].clips[0].startMs=8000;
fixture.tracks[0].clips[0].durationMs=12000;
fixture.markers=[{id:"marker-fixture",name:"My chorus",kind:"chorus",startMs:8000}];
fixture.tempoMap=[{startMs:0,quarterBpm:120}];
function Capture(){
 const[mix,setMix]=useState<MixDoc>(fixture);
 const[position,setPosition]=useState(0);
 useEffect(()=>{Object.assign(window,{__arrangementMix:mix});},[mix]);
 return <main className="main"><div className="panel"><ClipTimeline mix={mix} onChange={setMix} currentTimeMs={position} onSeek={sec=>setPosition(sec*1000)}/></div></main>;
}
createRoot(document.getElementById("root")!).render(<Capture/>);
