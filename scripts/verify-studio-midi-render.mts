import assert from "node:assert/strict";
import { chromium } from "playwright";

// Real Chromium OfflineAudioContext; only native IPC is replaced here.
// This complements the separate Windows/plugin acceptance run.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.addInitScript("window.__name = (target) => target;");
  await page.goto(process.env.STUDIO_TEST_URL ?? "http://127.0.0.1:1420/");
  const result = await page.evaluate(async () => {
    const { renderMidiMixStems, planarPcm } = await import("/src/lib/midiMixRender.ts");
    const { makeRegularBeatVoice } = await import("/src/lib/studioAssistant.ts");
    const { createEmptyScoreDocument } = await import("/src/lib/score.ts");
    const { exportProjectAudio, processTrackVst3Effects } = await import("/src/lib/exportMix.ts");
    const { api } = await import("/src/lib/api.ts");
    const { SoftSynth } = await import("/src/lib/midiInstrument.ts");
    const score = createEmptyScoreDocument({ tempoBpm: 120 });
    const beat = makeRegularBeatVoice("Beat");
    score.voices = [beat, { ...beat, id: "unlinked-reference" }];
    const mix = { schema: "songmaker.mix", schemaVersion: 1, id: "mix-v001", separationId: "", sampleRate: 48000,
      masterGainDb: 0, peakCeilingDb: -1, tracks: [{ id: beat.id, name: beat.name, role: "midi", gainDb: 0,
        pan: 0, mute: false, solo: false, locked: false, aiSeparated: false, clips: [], vst3Effects: [] }] };
    const stems = await renderMidiMixStems(mix, score);
    const rms = (values: Float32Array) => Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
    const lateRms = rms(stems[0].left.slice(48000 * 6, 48000 * 7));
    api.vst3ProcessPcm = async (request) => {
      const bytes = Uint8Array.from(request.pcmLe);
      const view = new DataView(bytes.buffer);
      for (let offset = 0; offset < bytes.length; offset += 4) view.setFloat32(offset, view.getFloat32(offset, true) * 0.5, true);
      return { pcmLe: Array.from(bytes), peakTrimDb: 0 };
    };
    mix.tracks[0].vst3Effects = [{ id: "effect", enabled: true, pluginPath: "test", pluginName: "test", parameters: {} }];
    const wet = await processTrackVst3Effects(mix, stems);
    const ratio = rms(wet[0].left) / rms(stems[0].left);
    let exported: any;
    api.exportPcmAudio = async (_id, request) => { exported = request; return "test-midi.wav"; };
    const path = await exportProjectAudio("test", "wav", mix, null, { score });
    const exportedAudio = planarPcm(exported.pcmLe, "mix", exported.sampleRate);
    mix.tracks[0].mute = true;
    await exportProjectAudio("test", "wav", mix, null, { score });
    const silent = planarPcm(exported.pcmLe, "mix", exported.sampleRate);
    const context = new OfflineAudioContext(2, 48000, 48000);
    const synth = new SoftSynth({ context, latencySec: 0 });
    await synth.noteOn(60, 100, 0.5);
    synth.noteOff(60, 0.75);
    synth.allNotesOff();
    const cancelled = await context.startRendering();
    return { stemCount: stems.length, seconds: stems[0].left.length / 48000, lateRms, ratio, path,
      exportRms: rms(exportedAudio.left), muteRms: rms(silent.left), stopRms: rms(cancelled.getChannelData(0)) };
  });
  assert.equal(result.stemCount, 1, "unlinked transcription references must not sound twice");
  assert.ok(result.seconds >= 7.9 && result.seconds <= 8.3);
  assert.ok(result.lateRms > 0.0001, "the scheduled beat must still sound after the first measure");
  assert.ok(Math.abs(result.ratio - 0.5) < 0.00001, "MIDI inserts must process the rendered audio");
  assert.ok(result.exportRms > 0.0001);
  assert.equal(result.muteRms, 0);
  assert.equal(result.stopRms, 0, "pause must cancel notes scheduled in the future");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
