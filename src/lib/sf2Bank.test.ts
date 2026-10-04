import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTestSf2, parseSf2, pickSf2Zone } from "./sf2Bank.ts";

describe("sf2Bank", () => {
  it("parses a tiny sine SF2 and maps MIDI 60 to the sample", () => {
    const buf = buildTestSf2({ sampleRate: 22050, rootKey: 60 });
    const bank = parseSf2(buf);
    assert.equal(bank.presets.length, 1);
    assert.equal(bank.presets[0]?.name, "TestSine");
    assert.equal(bank.presets[0]?.bank, 0);
    assert.equal(bank.presets[0]?.program, 0);
    const zone = pickSf2Zone(bank, 0, 60);
    assert.ok(zone);
    assert.ok((zone?.sample.length ?? 0) >= 128);
    assert.equal(zone?.rootKey, 60);
    assert.equal(zone?.sampleRate, 22050);
  });

  it("rejects garbage", () => {
    assert.throws(() => parseSf2(new ArrayBuffer(16)), /SF2_INVALID/);
  });
});
