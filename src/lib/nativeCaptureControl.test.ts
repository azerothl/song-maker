import assert from "node:assert/strict";
import { it } from "node:test";
import { runNativeCaptureControl } from "./nativeCaptureControl";

it("applies a native capture transition only after the control succeeds", async () => {
  const events: string[] = [];
  await runNativeCaptureControl(
    async () => {
      events.push("pause-requested");
    },
    {
      onBusyChange: (busy) => events.push(`busy:${busy}`),
      onSuccess: () => events.push("paused"),
      onFailure: () => events.push("error"),
    },
  );

  assert.deepEqual(events, ["busy:true", "pause-requested", "paused", "busy:false"]);
});

it("keeps capture state unchanged and releases controls after a native error", async () => {
  const events: string[] = [];
  const failure = new Error("device unavailable");
  await runNativeCaptureControl(
    async () => {
      events.push("resume-requested");
      throw failure;
    },
    {
      onBusyChange: (busy) => events.push(`busy:${busy}`),
      onSuccess: () => events.push("recording"),
      onFailure: (error) => {
        assert.equal(error, failure);
        events.push("error");
      },
    },
  );

  assert.deepEqual(events, ["busy:true", "resume-requested", "error", "busy:false"]);
});
