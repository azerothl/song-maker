import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignAbcHeaders,
  formatAbcKeyField,
  parseAbcHeaders,
} from "./abcMetadata.ts";

describe("abcMetadata", () => {
  const sample = `X:1
T:Demo
M:4/4
L:1/8
Q:1/4=119
K:Em
V: Vocal
C`;

  it("parse les en-têtes Q/K/M", () => {
    const meta = parseAbcHeaders(sample);
    assert.equal(meta.tempoBpm, 119);
    assert.deepEqual(meta.key, { tonic: "E", mode: "minor" });
    assert.deepEqual(meta.meter, { numerator: 4, denominator: 4 });
  });

  it("aligne tempo et tonalité demandés (#106)", () => {
    const result = alignAbcHeaders(sample, {
      tempoBpm: 112,
      key: { tonic: "D", mode: "minor" },
      meter: { numerator: 4, denominator: 4 },
    });
    assert.equal(result.changed, true);
    assert.deepEqual(result.drifted.sort(), ["key", "tempo"]);
    assert.match(result.abc, /Q:1\/4=112/);
    assert.match(result.abc, /K:Dm/);
    assert.match(result.abc, /M:4\/4/);
    assert.equal(result.after.tempoBpm, 112);
    assert.deepEqual(result.after.key, { tonic: "D", mode: "minor" });
  });

  it("n'invente rien sans demande", () => {
    const result = alignAbcHeaders(sample, {});
    assert.equal(result.changed, false);
    assert.equal(result.abc, sample);
    assert.deepEqual(result.drifted, []);
  });

  it("insère Q/K manquants", () => {
    const result = alignAbcHeaders("X:1\nT:x\nC", {
      tempoBpm: 100,
      key: { tonic: "C", mode: "major" },
    });
    assert.equal(result.changed, true);
    assert.match(result.abc, /Q:1\/4=100/);
    assert.match(result.abc, /K:C/);
  });

  it("conserve une note de dérive modèle", () => {
    const result = alignAbcHeaders(sample, {
      tempoBpm: 112,
      key: { tonic: "D", mode: "minor" },
    });
    assert.match(result.abc, /% song-maker-meta: model Q=119 K=Em/);
  });

  it("formatAbcKeyField suit le dialecte YuE2", () => {
    assert.equal(formatAbcKeyField({ tonic: "D", mode: "minor" }), "Dm");
    assert.equal(formatAbcKeyField({ tonic: "F#", mode: "major" }), "^F");
    assert.equal(formatAbcKeyField({ tonic: "Bb", mode: "major" }), "_B");
  });
});
