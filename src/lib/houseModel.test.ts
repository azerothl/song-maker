import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canGenerateWithHouseModel,
  canSelectHouseModel,
  houseModelStatus,
} from "./houseModel.ts";

describe("houseModelStatus", () => {
  it("never claims the house model can generate", () => {
    for (const runtime of [undefined, "unavailable", "weights_present_unwired", "ready"]) {
      const status = houseModelStatus(runtime);
      assert.equal(status.available, false);
      assert.equal(status.generates, false);
      assert.equal(canSelectHouseModel(), false);
      assert.equal(canGenerateWithHouseModel(), false);
      assert.match(status.messageFr, /n’est pas disponible/);
      assert.match(status.messageFr, /scripts\/model-training/);
    }
  });
});
