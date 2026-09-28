import { describe, expect, it } from "vitest";
import {
  clampStretchRatio,
  pitchShiftMono,
  qualityHintForProcess,
  resolveClipStretchRatio,
  stretchRatioFromTempos,
  timeStretchMono,
} from "./timeStretch.js";
import { placeClipsOnTimeline } from "./clips.js";

describe("timeStretch", () => {
  it("clamps stretch ratio", () => {
    expect(clampStretchRatio(0)).toBe(1);
    expect(clampStretchRatio(10)).toBe(4);
    expect(clampStretchRatio(0.1)).toBe(0.25);
  });

  it("derives stretch from tempos (faster project → shorter)", () => {
    expect(stretchRatioFromTempos(100, 120)).toBeCloseTo(100 / 120, 5);
    expect(stretchRatioFromTempos(120, 100)).toBeCloseTo(1.2, 5);
    expect(stretchRatioFromTempos(null, 120)).toBeNull();
  });

  it("resolves follow-project vs explicit ratio", () => {
    expect(
      resolveClipStretchRatio({
        processingEnabled: true,
        followProjectTempo: true,
        sourceTempoBpm: 100,
        projectTempoBpm: 120,
      }),
    ).toBeCloseTo(100 / 120, 5);
    expect(
      resolveClipStretchRatio({
        processingEnabled: false,
        followProjectTempo: true,
        sourceTempoBpm: 100,
        projectTempoBpm: 120,
        timeStretchRatio: 2,
      }),
    ).toBe(1);
    expect(
      resolveClipStretchRatio({
        processingEnabled: true,
        timeStretchRatio: 1.5,
      }),
    ).toBe(1.5);
  });

  it("stretches duration without crashing and roughly matches ratio", () => {
    const sr = 8000;
    const n = 8000;
    const input = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      input[i] = Math.sin((2 * Math.PI * 220 * i) / sr);
    }
    const out = timeStretchMono(input, 1.25, sr);
    expect(out.length).toBeCloseTo(n * 1.25, -2);
    // Energy preserved roughly (not silence).
    let e = 0;
    for (let i = 0; i < out.length; i++) e += (out[i] ?? 0) ** 2;
    expect(e).toBeGreaterThan(1);
  });

  it("pitch shift preserves length", () => {
    const sr = 8000;
    const input = new Float32Array(4000);
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / sr);
    }
    const out = pitchShiftMono(input, 2, sr);
    expect(out.length).toBe(input.length);
  });

  it("quality hints flag drums / extreme ratios", () => {
    expect(qualityHintForProcess(1.5, 0, "drums")).toBe("drums_caution");
    expect(qualityHintForProcess(3, 0, "voice")).toBe("extreme_ratio");
    expect(qualityHintForProcess(1.02, 0, "voice")).toBe("voice_ok");
  });
});

describe("placeClipsOnTimeline with stretch", () => {
  it("extends timeline when stretch > 1", () => {
    const sr = 1000;
    const src = new Float32Array(1000);
    for (let i = 0; i < src.length; i++) src[i] = 0.5;
    const placed = placeClipsOnTimeline(
      src,
      src,
      [
        {
          startMs: 0,
          offsetMs: 0,
          durationMs: 2000,
          fadeInMs: 0,
          fadeOutMs: 0,
          gainDb: 0,
          processingEnabled: true,
          timeStretchRatio: 2,
        },
      ],
      sr,
    );
    expect(placed.frameCount).toBe(2000);
    // Source only 1s; stretch fills 2s timeline.
    expect(Math.abs(placed.left[1500] ?? 0)).toBeGreaterThan(0.01);
  });

  it("skips inactive takes", () => {
    const sr = 1000;
    const src = new Float32Array(500);
    src.fill(1);
    const placed = placeClipsOnTimeline(
      src,
      src,
      [
        {
          startMs: 0,
          offsetMs: 0,
          durationMs: 500,
          fadeInMs: 0,
          fadeOutMs: 0,
          gainDb: 0,
          takeActive: false,
        },
      ],
      sr,
    );
    expect(placed.frameCount).toBe(1);
    expect(placed.left.length).toBe(1);
    expect(placed.left[0]).toBe(0);
  });
});
