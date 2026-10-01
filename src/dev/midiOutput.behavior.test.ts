import assert from "node:assert/strict";
import { after,before,it } from "node:test";
import { chromium,type Browser } from "playwright";
import type { ViteDevServer } from "vite";
import { startCaptureViteServer,stopCaptureViteServer } from "./captureViteServer";
let server:ViteDevServer,browser:Browser;
before(async()=>{server=await startCaptureViteServer(5237);browser=await chromium.launch();});
after(async()=>{await browser?.close();if(server)await stopCaptureViteServer(server);});
it("MIDI output connects only after selection and panic cancels playback",async()=>{
 const page=await browser.newPage();
 try {
  await page.addInitScript(()=>{
   localStorage.setItem("song-maker.locale","en");
   const state={commands:[] as Array<{cmd:string;args:unknown}>,finish:null as null|(()=>void)};
   const fixture=window as unknown as {__midiTest:typeof state;__captureMidiOutput:(cmd:string,args:unknown)=>unknown};
   fixture.__midiTest=state;
   fixture.__captureMidiOutput=(cmd:string,args:unknown)=>{
    state.commands.push({cmd,args});
    if(cmd==="list_midi_outputs")return [{id:"virtual-test",name:"Fixture port"}];
    if(cmd==="play_midi_output")return new Promise<void>(resolve=>{state.finish=resolve;});
    if(cmd==="panic_midi_output"){state.finish?.();state.finish=null;}
   };
  });
  await page.goto("http://127.0.0.1:5237/midi-output-capture.html");
  const play=page.getByRole("button",{name:"Play through MIDI output",exact:true});
  assert.equal(await play.isDisabled(),true);
  await page.getByRole("button",{name:"Find MIDI outputs"}).click();
  await page.getByLabel("Output",{exact:true}).selectOption("virtual-test");
  await play.click();
  await page.getByText("Playing through MIDI output…",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Stop all notes",exact:true}).click();
  await page.waitForFunction(()=>!Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(button=>button.textContent==="Play through MIDI output")?.disabled);
  assert.equal(await play.isEnabled(),true);
  const commands=await page.evaluate(()=>(window as unknown as {__midiTest:{commands:Array<{cmd:string;args:unknown}>}}).__midiTest.commands);
  const connection=commands.findIndex(c=>c.cmd==="connect_midi_output");
  const start=commands.findIndex(c=>c.cmd==="play_midi_output");
  assert.ok(connection>=0&&start>connection);
  assert.equal(commands.at(-1)?.cmd,"panic_midi_output");
  assert.deepEqual(commands[start].args,{notes:[{startMs:0,endMs:250,pitch:60,velocity:90}],channel:0,program:0});
 } finally {await page.close();}
});
it("disconnected MIDI output shows a readable failure and never starts score playback",async()=>{
 const page=await browser.newPage();
 try {
  await page.addInitScript(()=>{(window as unknown as {__captureMidiOutput:(cmd:string)=>unknown}).__captureMidiOutput=(cmd:string)=>{
   if(cmd==="list_midi_outputs")return [{id:"gone",name:"Disconnected fixture"}];
   if(cmd==="connect_midi_output")throw new Error("MIDI_DISCONNECTED private details");
   if(cmd==="play_midi_output")throw new Error("Unexpected playback");
  };});
  await page.goto("http://127.0.0.1:5237/midi-output-capture.html");
  await page.getByRole("button",{name:"Rechercher les sorties MIDI"}).click();
  await page.getByLabel("Sortie",{exact:true}).selectOption("gone");
  await page.getByText("La sortie MIDI ne répond pas. Recherchez les sorties et reconnectez le port.",{exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Lire sur la sortie MIDI"}).isDisabled(),true);
  assert.doesNotMatch(await page.locator("main").innerText(),/MIDI_DISCONNECTED|private details/);
 } finally {await page.close();}
});
