import { describe, expect, it } from "vitest";
import {
  buildProjectPayload,
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
    const client = createRemoteGpuWorkerClient(
      {
        localFirst: false,
        remoteEnabled: true,
      },
      { useHttpTransport: false },
    );
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

  it("makes zero network calls when remote is opted out", async () => {
    const client = createRemoteGpuWorkerClient();
    expect(client.isNetworkIdle()).toBe(true);
    const probe = await client.probe();
    expect(probe.status).toBe("rejected_local_only");
  });

  it("hashes a real project payload (not blob://probe)", async () => {
    const built = await buildProjectPayload({
      projectId: "proj-1",
      kind: "yue2_generate",
      request: { style: "pop", lyrics: "[Verse]\nHi", cot: "full" },
      artifacts: { lyrics: "[Verse]\nHi" },
    });
    expect(built.plaintextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(built.blob.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(built.blob.cipherPath.startsWith("memory://")).toBe(true);
    expect(built.blob.cipherPath.includes("blob://probe")).toBe(false);
    expect(built.blob.byteLength).toBeGreaterThan(0);
  });

  it("attaches ciphertext when accessToken is provided", async () => {
    const built = await buildProjectPayload({
      projectId: "proj-2",
      kind: "yue2_generate",
      accessToken: "shared-token-for-hkdf",
      request: { style: "x", lyrics: "y" },
    });
    expect(built.blob.encryption).toBe("aes-256-gcm");
    expect(built.blob.ciphertextBase64).toBeTruthy();
    expect(built.blob.ivBase64).toBeTruthy();
  });
});
