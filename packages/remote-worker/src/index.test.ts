import { describe, expect, it } from "vitest";
import {
  createConsent,
  createEmptyAuthPlaceholder,
  createRemoteGpuWorkerClient,
  resolveAuthPlaceholder,
  REMOTE_WORKER_TOKEN_ENV,
  DEFAULT_RETENTION_POLICY,
} from "./index.js";

describe("remote-worker client", () => {
  it("rejects submit when local-first and remote disabled (default)", async () => {
    const client = createRemoteGpuWorkerClient();
    const result = await client.submit({
      kind: "yue2_generate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth: { scheme: "bearer_placeholder", accessToken: "tok", expiresAt: null },
      consent: createConsent({
        userConsented: true,
        scope: "generation",
        retentionAcknowledged: true,
      }),
      payload: {
        cipherPath: "blob://x",
        contentSha256: "a".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("rejected_local_only");
  });

  it("rejects submit without user consent", async () => {
    const client = createRemoteGpuWorkerClient({
      localFirst: false,
      remoteEnabled: true,
    });
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

  it("rejects without retention acknowledgement", async () => {
    const client = createRemoteGpuWorkerClient({
      localFirst: false,
      remoteEnabled: true,
    });
    const result = await client.submit({
      kind: "yue2_generate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth: { scheme: "bearer_placeholder", accessToken: "tok", expiresAt: null },
      consent: createConsent({
        userConsented: true,
        scope: "generation",
        retentionAcknowledged: false,
      }),
      payload: {
        cipherPath: "blob://x",
        contentSha256: "a".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("rejected_retention");
    expect(result.error).toContain("consentement");
  });

  it("rejects submit without auth token", async () => {
    const client = createRemoteGpuWorkerClient({
      localFirst: false,
      remoteEnabled: true,
    });
    const result = await client.submit({
      kind: "htdemucs_separate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth: createEmptyAuthPlaceholder(),
      consent: createConsent({
        userConsented: true,
        scope: "separation",
        retentionAcknowledged: true,
      }),
      payload: {
        cipherPath: "blob://y",
        contentSha256: "b".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("rejected_unauthorized");
  });

  it("resolves token from env", () => {
    const auth = resolveAuthPlaceholder({
      env: { [REMOTE_WORKER_TOKEN_ENV]: "env-token" },
    });
    expect(auth.accessToken).toBe("env-token");
  });

  it("queues a job when consent, retention, token, and TLS are present", async () => {
    const client = createRemoteGpuWorkerClient({
      localFirst: false,
      remoteEnabled: true,
    });
    const auth = await client.authenticate({
      scheme: "bearer_placeholder",
      accessToken: "test-token",
      expiresAt: null,
    });
    const result = await client.submit({
      kind: "yue2_generate",
      endpoint: { baseUrl: "https://gpu.example", requireTls: true },
      auth,
      consent: createConsent({
        userConsented: true,
        scope: "both",
        retentionAcknowledged: true,
      }),
      payload: {
        cipherPath: "blob://z",
        contentSha256: "c".repeat(64),
        encryption: "aes-256-gcm-placeholder",
      },
    });
    expect(result.status).toBe("queued");
    expect(result.id).toMatch(/^remote-job-/);
    expect(DEFAULT_RETENTION_POLICY.maxRetentionHours).toBe(24);
  });
});
