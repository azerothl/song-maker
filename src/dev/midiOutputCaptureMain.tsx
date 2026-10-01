import { createRoot } from "react-dom/client";
import { MidiOutputPanel } from "../components/MidiOutputPanel";
import { createEmptyScoreDocument } from "../lib/score";
import "../App.css";
const document=createEmptyScoreDocument({id:"midi-output-fixture"});
document.voices[0].notes=[{id:"n1",startTick:0,durationTick:480,pitch:60,velocity:90}];
document.voices.push({...document.voices[0],id:"second",name:"Second voice",notes:[{id:"n2",startTick:960,durationTick:960,pitch:64,velocity:70}]});
createRoot(window.document.getElementById("root")!).render(<main className="main"><div className="panel"><MidiOutputPanel document={document}/></div></main>);
