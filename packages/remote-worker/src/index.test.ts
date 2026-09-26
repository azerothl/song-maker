import { describe, expect, it } from "vitest";
import {
  createConsent,
  createEmptyAuthPlaceholder,
  createRemoteGpuWorkerClient,
} from "./index.js";

describe("remote-worker client stub", () => {
  it("rejects submit without user consent", async () => {
    const client = createRemoteGpuWorkerClient();
    const result = await client.submit({
      kind: "yue2_generate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth: { scheme: "bearer_placeholder", accessToken: "tok", expiresAt: null },
      consent: createConsent({ userConsented: false, scope: "generation" }),
      payload: {
        cipherPath: "blob://x",
        contentSha256: "a".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("rejected_no_consent");
  });

  it("rejects submit without auth token", async () => {
    const client = createRemoteGpuWorkerClient();
    const result = await client.submit({
      kind: "htdemucs_separate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth: createEmptyAuthPlaceholder(),
      consent: createConsent({ userConsented: true, scope: "separation" }),
      payload: {
        cipherPath: "blob://y",
        contentSha256: "b".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("rejected_unauthorized");
  });

  it("queues a job when consent, token, and TLS are present", async () => {
    const client = createRemoteGpuWorkerClient();
    const auth = await client.authenticate({
      scheme: "bearer_placeholder",
      accessToken: "test-token",
      expiresAt: null,
    });
    const result = await client.submit({
      kind: "yue2_generate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth,
      consent: createConsent({ userConsented: true, scope: "both" }),
      payload: {
        cipherPath: "blob://z",
        contentSha256: "c".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("queued");
    expect(result.id).toMatch(/^remote-job-/);
  });
});
