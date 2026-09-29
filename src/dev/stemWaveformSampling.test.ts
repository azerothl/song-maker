import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickSolidBarPixelY,
  stemWaveformSampleClientXs,
} from "./stemWaveformSampling";

describe("stemWaveformSampling (#159)", () => {
  it("place l’échantillon lue à gauche et à venir à droite du curseur", () => {
    const peaks = 200;
    const { playheadX, playedSampleX, unplayedSampleX } = stemWaveformSampleClientXs(
      400,
      222,
      444,
      peaks,
    );
    assert.equal(playheadX, 200);
    const barW = 400 / peaks;
    assert.ok(playedSampleX + barW * 0.6 < playheadX);
    assert.ok(unplayedSampleX > playheadX + barW * 0.4);
  });

  it("trouve un pixel de barre distinct du fond", () => {
    const bg = { r: 23, g: 19, b: 32 };
    const read = (x: number, y: number) => {
      if (x === 300 && y === 20) return { r: 100, g: 50, b: 80 };
      return bg;
    };
    const pick = pickSolidBarPixelY(read, 300, 40, bg);
    assert.ok(pick);
    assert.equal(pick!.rgb.r, 100);
  });
});
