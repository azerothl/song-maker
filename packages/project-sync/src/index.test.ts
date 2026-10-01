import { describe, expect, it } from "vitest";
import {
  createEmptyEnvelope,
  createProjectSyncClient,
  DEFAULT_PROJECT_SYNC_PREFERENCES,
} from "./index.js";

describe("project-sync client", () => {
  it("defaults to never_synced and opt-out", () => {
    const client = createProjectSyncClient();
    const prefs = client.getPreferences("proj-1");
    expect(prefs).toEqual(DEFAULT_PROJECT_SYNC_PREFERENCES);
    expect(prefs.syncEnabled).toBe(false);
    expect(prefs.status).toBe("never_synced");
  });

  it("does not call transport when sync disabled", async () => {
    const client = createProjectSyncClient();
    const result = await client.push("proj-1", createEmptyEnvelope("proj-1"));
    expect(result.status).toBe("never_synced");
    expect(result.error).toMatch(/désactivée/);
  });

  it("returns not_implemented when opted in without real transport", async () => {
    const client = createProjectSyncClient();
    client.setPreferences("proj-1", { syncEnabled: true });
    const result = await client.push("proj-1", createEmptyEnvelope("proj-1"));
    expect(result.status).toBe("not_implemented");
    expect(result.error).toMatch(/transport|Tauri|synchro/i);
    expect(client.getPreferences("proj-1").status).toBe("not_implemented");
  });

  it("opt-out resets status to never_synced", () => {
    const client = createProjectSyncClient();
    client.setPreferences("proj-1", {
      syncEnabled: true,
      status: "error",
      lastError: "x",
    });
    const next = client.setPreferences("proj-1", { syncEnabled: false });
    expect(next.status).toBe("never_synced");
    expect(next.lastError).toBeNull();
  });
});
