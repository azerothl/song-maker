import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCaptureDemoMix } from "../dev/captureDemoMix";
import { parseCaptureHash } from "../dev/productionCaptureHash";
import { roleWaveColor } from "./trackRoleColors";

describe("stems Production — pistes démo (#159)", () => {
  it("inclut Piano et Guitare (import / enregistrement simulés)", () => {
    const mix = buildCaptureDemoMix(16);
    const names = mix.tracks.map((t) => t.name);
    assert.ok(names.some((n) => n.toLowerCase().includes("piano")));
    assert.ok(names.some((n) => n.toLowerCase().includes("guitare")));
    const piano = mix.tracks.find((t) => t.role === "piano");
    const guitar = mix.tracks.find((t) => t.role === "guitar");
    assert.ok(piano && guitar);
    assert.equal(roleWaveColor(piano.role), roleWaveColor("piano"));
    assert.equal(roleWaveColor(guitar.role), roleWaveColor("guitar"));
  });

  it("hash collapsed replie le groupe Rythmique pour la capture #159", () => {
    const prefs = parseCaptureHash("16,auto,collapsed,midplay");
    assert.equal(prefs.rythmiqueCollapsed, true);
    assert.equal(prefs.midPlayback, true);
  });
});
