import assert from "node:assert/strict";
import { it } from "node:test";
import { parseRemoteGenerationResult } from "./remoteResult";

const sha256 = "a".repeat(64);
const valid = {
  schema: "songmaker.generation.result",
  schemaVersion: 1,
  state: "generated",
  provenance: { provider: "audiocpp" },
  audio: {
    path: "audio.wav",
    durationMs: 30_000,
    sampleRate: 44_100,
    channels: 2,
    sha256,
  },
  score: null,
};
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

it("accepts a complete real result and exposes its audio checksum", () => {
  assert.deepEqual(parseRemoteGenerationResult(encode(valid)), {
    ok: true,
    value: { audioSha256: sha256, scoreSha256: null },
  });
});

it("records a score only when the worker declares a verifiable score artifact", () => {
  const checked = parseRemoteGenerationResult(
    encode({ ...valid, score: { path: "score.abc", sha256 } }),
  );
  assert.deepEqual(checked, {
    ok: true,
    value: { audioSha256: sha256, scoreSha256: sha256 },
  });
});

it("refuses simulated, incomplete, and malformed results before audio import", () => {
  const simulated = parseRemoteGenerationResult(
    encode({ ...valid, provenance: { provider: "simulate" } }),
  );
  assert.equal(simulated.ok, false);
  if (!simulated.ok) assert.match(simulated.error, /démonstration/);

  for (const result of [
    { ...valid, state: "failed" },
    { ...valid, provenance: undefined },
    { ...valid, audio: undefined },
    { ...valid, audio: { ...valid.audio, durationMs: 0 } },
    { ...valid, audio: { ...valid.audio, sha256: "not-a-checksum" } },
  ]) {
    const checked = parseRemoteGenerationResult(encode(result));
    assert.equal(checked.ok, false);
    if (!checked.ok) assert.match(checked.error, /résultat de génération complet/);
  }

  const malformed = parseRemoteGenerationResult(new TextEncoder().encode("invalid"));
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.match(malformed.error, /illisible/);
});
