import assert from "node:assert/strict";
import { it } from "node:test";
import { remoteResultError } from "./remoteResult";
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
it("refuses simulated remote takes and malformed results before audio import", () => {
  const base = { schema: "songmaker.generation.result", state: "generated" };
  assert.match(remoteResultError(encode({ ...base, provenance: { provider: "simulate" } }))!, /démonstration/);
  assert.equal(remoteResultError(encode({ ...base, provenance: { provider: "audiocpp" } })), null);
  assert.match(remoteResultError(encode({ ...base, state: "failed" }))!, /valide/);
  assert.match(remoteResultError(new TextEncoder().encode("invalid"))!, /illisible/);
});
