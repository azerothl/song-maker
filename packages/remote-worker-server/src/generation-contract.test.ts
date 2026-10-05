import { describe, expect, it } from "vitest";
import { buildMinimalWav } from "./server.js";
import { checkRemoteDuration, generationContract, wavMetadata } from "./generation-contract.js";

describe("remote duration contract", () => {
  it.each([30, 60, 360])("budgets exactly %i seconds in instrumental mode and excludes drafts", seconds => {
    const contract = generationContract({ targetDurationSec: seconds, instrumentalMode: true, lyrics: "draft", preferFullLyrics: true }, "fallback draft");
    expect(contract.lyrics).toBe("");
    expect(contract.minimum).toBe(seconds * 25);
    expect(contract.maximum).toBe(seconds * 25);
    expect(contract.fixedDuration).toBe(true);
  });
  it("retains lyric headroom only for sung lyrics-first requests", () => {
    expect(generationContract({ targetDurationSec: 360, lyrics: "[Verse]\nhello" })).toMatchObject({ minimum: 9000, maximum: 11250, fixedDuration: false });
    expect(generationContract({ targetDurationSec: 30, preferFullLyrics: false })).toMatchObject({ minimum: 750, maximum: 750 });
    expect(() => generationContract({ targetDurationSec: "360" })).toThrow();
  });
  it("reads actual WAV metadata and detects incomplete files", () => {
    const wav = buildMinimalWav(0.25);
    expect(wavMetadata(wav)).toMatchObject({ durationMs: 250 });
    expect(wavMetadata(wav).sampleRate).toBe(wav.readUInt32LE(24));
    expect(wavMetadata(wav).channels).toBe(wav.readUInt16LE(22));
    expect(() => wavMetadata(wav.subarray(0, wav.length - 1))).toThrow();
    expect(() => wavMetadata(Buffer.from("RIFFxxxxWAVE"))).toThrow();
  });
  it("refuses short or long outputs before publication, within desktop tolerance", () => {
    expect(checkRemoteDuration(359998, 360000).matches).toBe(true);
    expect(() => checkRemoteDuration(75278, 360000)).toThrow("n’est pas publiée");
    expect(() => checkRemoteDuration(361000, 360000)).toThrow();
  });
});
