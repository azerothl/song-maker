import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTauriRuntime, readAppVersion } from "./runtimeHost.ts";

describe("readAppVersion", () => {
  it("renvoie null hors runtime Tauri plutôt qu'une version inventée", async () => {
    // Le runner node:test n'a pas de window, donc pas de __TAURI_INTERNALS__.
    assert.equal(isTauriRuntime(), false);
    assert.equal(await readAppVersion(), null);
  });
});

describe("isTauriRuntime", () => {
  it("ne lève pas quand window est absent", () => {
    assert.doesNotThrow(() => isTauriRuntime());
  });
});
