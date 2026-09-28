import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import {
  buildMinimalWav,
  createAndStartWorker,
  deriveAesKeyFromTokenNode,
  type RemoteGpuWorkerServer,
} from "./index.js";

const TOKEN = "test-worker-token-32chars-minimum!!";

async function encryptEnvelope(
  token: string,
  plaintext: Buffer,
): Promise<{ ciphertextBase64: string; ivBase64: string; sha: string }> {
  const key = deriveAesKeyFromTokenNode(token);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertext = Buffer.concat([enc, tag]);
  const sha = createHash("sha256").update(plaintext).digest("hex");
  return {
    ciphertextBase64: ciphertext.toString("base64"),
    ivBase64: iv.toString("base64"),
    sha,
  };
}

describe("remote-worker-server", () => {
  let server: RemoteGpuWorkerServer | null = null;
  let dataDir = "";

  afterEach(async () => {
    if (server) {
      await server.stop();
      server = null;
    }
    if (dataDir) {
      await rm(dataDir, { recursive: true, force: true });
      dataDir = "";
    }
  });

  async function boot(): Promise<string> {
    dataDir = await mkdtemp(join(tmpdir(), "rw-test-"));
    const started = await createAndStartWorker({
      host: "127.0.0.1",
      port: 0,
      authToken: TOKEN,
      simulate: true,
      dataDir,
      log: () => undefined,
    });
    server = started.server;
    return started.baseUrl;
  }

  it("rejects missing auth on jobs", async () => {
    const base = await boot();
    const res = await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  it("health is public", async () => {
    const base = await boot();
    const res = await fetch(`${base}/v1/health`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("runs simulate job end-to-end and detects corrupt artifacts", async () => {
    const base = await boot();
    const envelope = Buffer.from(
      JSON.stringify({
        schema: "song-maker.remote-payload",
        schemaVersion: 1,
        projectId: "p1",
        kind: "yue2_generate",
        request: { style: "pop", lyrics: "[Verse]\nHi" },
        artifacts: { lyrics: "[Verse]\nHi" },
      }),
      "utf8",
    );
    const enc = await encryptEnvelope(TOKEN, envelope);
    const submit = await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        kind: "yue2_generate",
        consent: {
          userConsented: true,
          consentedAt: new Date().toISOString(),
          scope: "generation",
          retentionAcknowledged: true,
        },
        payload: {
          cipherPath: "memory://x",
          contentSha256: enc.sha,
          encryption: "aes-256-gcm",
          byteLength: envelope.length,
        },
        ciphertextBase64: enc.ciphertextBase64,
        ivBase64: enc.ivBase64,
      }),
    });
    expect(submit.status).toBe(202);
    const { id } = (await submit.json()) as { id: string };

    let status = "queued";
    for (let i = 0; i < 50 && status !== "succeeded" && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const poll = await fetch(`${base}/v1/jobs/${id}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      const body = (await poll.json()) as { status: string };
      status = body.status;
    }
    expect(status).toBe("succeeded");

    const art = await fetch(`${base}/v1/jobs/${id}/artifacts/audio.wav`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(art.status).toBe(200);
    const bytes = Buffer.from(await art.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(art.headers.get("x-content-sha256")).toMatch(/^[0-9a-f]{64}$/);

    const job = server!.getJob(id)!;
    await writeFile(job.artifacts["audio.wav"]!.path, Buffer.from("not-a-wav"));
    const bad = await fetch(`${base}/v1/jobs/${id}/artifacts/audio.wav`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(bad.status).toBe(500);
    const badJson = (await bad.json()) as { error: string };
    expect(badJson.error).toContain("artifact_corrupt");
  });

  it("cancels a job", async () => {
    const base = await boot();
    const envelope = Buffer.from(
      JSON.stringify({
        projectId: "p2",
        kind: "yue2_generate",
        request: {},
        artifacts: {},
      }),
      "utf8",
    );
    const enc = await encryptEnvelope(TOKEN, envelope);
    const submit = await fetch(`${base}/v1/jobs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        kind: "yue2_generate",
        consent: {
          userConsented: true,
          retentionAcknowledged: true,
        },
        payload: {
          cipherPath: "m",
          contentSha256: enc.sha,
          encryption: "aes-256-gcm",
        },
        ciphertextBase64: enc.ciphertextBase64,
        ivBase64: enc.ivBase64,
      }),
    });
    const { id } = (await submit.json()) as { id: string };
    const cancel = await fetch(`${base}/v1/jobs/${id}/cancel`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(cancel.status).toBe(200);
    const body = (await cancel.json()) as { status: string; error: string | null };
    expect(body.status).toBe("failed");
    expect(body.error).toBe("cancelled");
  });

  it("builds a valid minimal WAV", () => {
    const wav = buildMinimalWav(0.1);
    expect(wav.subarray(0, 4).toString()).toBe("RIFF");
    expect(wav.subarray(8, 12).toString()).toBe("WAVE");
  });
});
