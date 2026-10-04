import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audioInputCapability, wantsAudioInput } from "./audioInput.ts";

describe("audioInputCapability", () => {
  it("never claims YuE2 or ACE-Step can consume audio_input", () => {
    for (const engine of ["yue2", "ace_step", "unknown"]) {
      const cap = audioInputCapability(engine);
      assert.equal(cap.supported, false);
      assert.match(cap.messageFr, /audio_input/);
      assert.match(cap.messageFr, /SheetSage2/);
    }
  });

  it("detects a requested reference or inpaint window", () => {
    assert.equal(wantsAudioInput({}), false);
    assert.equal(wantsAudioInput({ audioInputPath: "  " }), false);
    assert.equal(wantsAudioInput({ audioInputPath: "/tmp/ref.wav" }), true);
    assert.equal(wantsAudioInput({ inpaintStartMs: 1000, inpaintEndMs: 4000 }), true);
  });
});
