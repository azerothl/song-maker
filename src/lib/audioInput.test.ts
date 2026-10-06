import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audioInputCapability, wantsAudioInput } from "./audioInput.ts";

describe("audioInputCapability", () => {
  it("explains the imported-audio limit in user-facing language", () => {
    for (const engine of ["yue2", "ace_step", "ace_step_lego", "unknown"]) {
      const cap = audioInputCapability(engine);
      assert.equal(cap.supported, false);
      assert.match(cap.messageFr, /morceau importé/);
      assert.match(cap.messageFr, /Reprise/);
      assert.doesNotMatch(cap.messageFr, /audio_input|inpainting|décodeur|sidecar/i);
    }
  });

  it("detects a requested reference or inpaint window", () => {
    assert.equal(wantsAudioInput({}), false);
    assert.equal(wantsAudioInput({ audioInputPath: "  " }), false);
    assert.equal(wantsAudioInput({ audioInputPath: "/tmp/ref.wav" }), true);
    assert.equal(wantsAudioInput({ inpaintStartMs: 1000, inpaintEndMs: 4000 }), true);
  });
});
