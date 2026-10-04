import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseMidiMessage } from "./midiInput.ts";
import { INSTRUMENT_PROGRAMS } from "./midiInstrument.ts";
import { createEmptyScoreDocument } from "./score.ts";
import { quantizeSecondsToTick } from "./midiScorePlayer.ts";

describe("midiInput", () => {
  it("parses note on/off", () => {
    const on = parseMidiMessage(Uint8Array.of(0x90, 60, 100), 1);
    assert.deepEqual(on, {
      type: "noteon",
      pitch: 60,
      velocity: 100,
      timeStamp: 1,
    });
    const offVel = parseMidiMessage(Uint8Array.of(0x90, 60, 0), 2);
    assert.equal(offVel?.type, "noteoff");
    const off = parseMidiMessage(Uint8Array.of(0x80, 60, 40), 3);
    assert.equal(off?.type, "noteoff");
  });

  it("ignores non-note messages", () => {
    assert.equal(parseMidiMessage(Uint8Array.of(0xb0, 7, 100), 0), null);
  });
});

describe("midiInstrument programs", () => {
  it("lists built-in oscillator programs and keeps SF2 optional", () => {
    assert.ok(INSTRUMENT_PROGRAMS.includes("piano"));
    assert.equal(INSTRUMENT_PROGRAMS.length, 8);
  });
});

describe("midiScorePlayer quantize", () => {
  it("quantizes free timing to tick grid", () => {
    const doc = createEmptyScoreDocument();
    // 0.5 s at 120 BPM = 960 ticks
    const tick = quantizeSecondsToTick(0.5, doc, 120);
    assert.equal(tick, 960);
  });
});
