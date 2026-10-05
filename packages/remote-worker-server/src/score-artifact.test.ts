import { expect, it } from "vitest";
import { extractRemoteScore } from "./score-artifact.js";
it("extracts the real ABC artifact and never manufactures notes when absent", () => {
  const abc = "X:1\nK:C\nCDEF|";
  expect(extractRemoteScore({ artifacts: [{ id: "score", meta: { format: "abc" }, payload: Buffer.from(abc).toString("base64") }] })).toBe(abc);
  expect(extractRemoteScore({ artifacts: [{ id: "abc", payload: abc }] })).toBe(abc);
  expect(extractRemoteScore({ artifacts: [{ id: "semantic", payload: "{}" }] })).toBeNull();
  expect(extractRemoteScore({ score: "not a score" })).toBeNull();
  expect(extractRemoteScore({ artifacts: [{ id: "score", payload: "invalid" }, { id: "score.abc", payload: abc }] })).toBe(abc);
  expect(extractRemoteScore({}, abc)).toBe(abc);
});
