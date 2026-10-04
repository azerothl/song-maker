import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNativeBackend,
  nativeRoundTripLabel,
  type NativeCaptureBackend,
} from "./nativeCapture.ts";

describe("nativeCapture labels", () => {
  it("states shared WASAPI and no ASIO", () => {
    const info: NativeCaptureBackend = {
      hostApi: "wasapi-shared",
      exclusive: false,
      asio: false,
      platform: "windows",
      roundTripMeasured: false,
      notesFr: "x",
    };
    assert.equal(
      formatNativeBackend(info),
      "wasapi-shared (partagé, sans ASIO)",
    );
    assert.equal(nativeRoundTripLabel(20), "20 ms (tampon, aller-retour estimé)");
    assert.equal(nativeRoundTripLabel(null), "—");
  });
});
