import { expect, it } from "vitest";
import { createServer } from "node:http";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildMinimalWav, createAndStartWorker, deriveAesKeyFromTokenNode } from "./server.js";

it.each([30, 1])("publishes encrypted HTTP YuE2 output of %i seconds without a wall-clock duration gate", async outputSeconds => {
  const token = "duration-flow-test-token";
  let observed: { request: { lyrics: string; options: Record<string, unknown> } } | undefined;
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.model === "yue2") observed = body;
    res.writeHead(200, { "content-type": "application/json" });
    if (body.model === "htdemucs") {
      const silence = buildMinimalWav(outputSeconds);
      silence.fill(0, 44);
      res.end(JSON.stringify({ named_audio_outputs: ["drums", "bass", "other", "vocals"].map(id => ({ id,
        audio: (id === "vocals" ? buildMinimalWav(outputSeconds) : silence).toString("base64") })) }));
    } else res.end(JSON.stringify({ audio: buildMinimalWav(outputSeconds).toString("base64") }));
  });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address() as { port: number };
  const dataDir = await mkdtemp(join(tmpdir(), "rw-duration-flow-"));
  const worker = await createAndStartWorker({ port: 0, authToken: token, dataDir, simulate: false,
    audiocppUrl: `http://127.0.0.1:${address.port}`, log: () => undefined });
  try {
    const plaintext = Buffer.from(JSON.stringify({ projectId: "duration-test", kind: "yue2_generate",
      request: { targetDurationSec: 30, instrumentalMode: true, preferFullLyrics: true, lyrics: "draft lyrics" },
      artifacts: { lyrics: "draft lyrics" } }));
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", deriveAesKeyFromTokenNode(token), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const submitted = await fetch(`${worker.baseUrl}/v1/jobs`, { method: "POST", headers,
      body: JSON.stringify({ kind: "yue2_generate", consent: { userConsented: true, retentionAcknowledged: true },
        payload: { contentSha256: createHash("sha256").update(plaintext).digest("hex") },
        ciphertextBase64: encrypted.toString("base64"), ivBase64: iv.toString("base64") }) });
    expect(submitted.status).toBe(202);
    const { id } = await submitted.json() as { id: string };
    for (let i = 0; i < 6000; i++) {
      if (["succeeded", "failed"].includes(worker.server.getJob(id)!.status)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    expect(observed!.request.lyrics).toBe("");
    expect(observed!.request.options).toMatchObject({ semantic_min_tokens: 750, semantic_max_tokens: 750 });
    const job = worker.server.getJob(id)!;
    expect(job.status, job.error).toBe("succeeded");
    const result = JSON.parse(await readFile(job.artifacts["result.json"]!.path, "utf8"));
    expect(result.audio.durationMs).toBe(outputSeconds * 1000);
    expect(result.durationCompliance).toBeUndefined();
    expect(result.score).toBeNull();
    expect(job.artifacts["score.abc"]).toBeUndefined();
    const score = await fetch(`${worker.baseUrl}/v1/jobs/${id}/artifacts/score.abc`, { headers });
    expect(score.status).toBe(404);
    expect(result.instrumentalProcessing.excludedStems).toEqual(["vocals"]);
    const final = await readFile(job.artifacts["audio.wav"]!.path);
    const data = final.indexOf(Buffer.from("data")) + 8;
    expect(final.subarray(data).every(value => value === 0)).toBe(true);
    expect(await readFile(join(dataDir, id, "audio-original.wav"))).toEqual(buildMinimalWav(outputSeconds));
  } finally {
    await worker.server.stop();
    await new Promise<void>(resolve => upstream.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
  }
}, 90_000);
