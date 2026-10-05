import { createHash, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generationContract, wavMetadata } from "./generation-contract.js";
import { remoteInstrumental } from "./instrumental.js";
import { extractRemoteScore } from "./score-artifact.js";

export type WorkerConfig = {
  host: string;
  port: number;
  /** Required bearer token (never logged). */
  authToken: string;
  /** Max plaintext / ciphertext bytes accepted. */
  maxPayloadBytes: number;
  /** Retention hours before ciphertext + artifacts are deleted. */
  retentionHours: number;
  /** Delete artifacts after a successful download of audio.wav. */
  deleteAfterDownload: boolean;
  /** Data directory for job artifacts. */
  dataDir: string;
  /** Browser origins allowed to call this bearer-token protected API. */
  corsAllowedOrigins: string[];
  /**
   * audiocpp_server base URL (e.g. http://127.0.0.1:8090).
   * When unset, YuE2 runs in simulate mode (minimal WAV + ABC).
   */
  audiocppUrl: string | null;
  /** Force simulate even if audiocppUrl is set (tests). */
  simulate: boolean;
  /** Log sink — never receives secrets. */
  log?: (line: string) => void;
};

export function defaultConfig(overrides: Partial<WorkerConfig> = {}): WorkerConfig {
  const cfg: WorkerConfig = {
    host: overrides.host ?? "127.0.0.1",
    port: overrides.port ?? 8787,
    authToken: overrides.authToken ?? "",
    maxPayloadBytes: overrides.maxPayloadBytes ?? 8 * 1024 * 1024,
    retentionHours: overrides.retentionHours ?? 24,
    deleteAfterDownload: overrides.deleteAfterDownload ?? true,
    dataDir: overrides.dataDir ?? join(tmpdir(), "song-maker-remote-worker"),
    corsAllowedOrigins: overrides.corsAllowedOrigins ?? ["*"],
    audiocppUrl: overrides.audiocppUrl ?? null,
    simulate: overrides.simulate ?? !overrides.audiocppUrl,
  };
  if (overrides.log) {
    cfg.log = overrides.log;
  }
  return cfg;
}

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "rejected_no_consent"
  | "rejected_unauthorized"
  | "rejected_retention";

export type StoredJob = {
  id: string;
  status: JobStatus;
  kind: string;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  resultCipher: {
    cipherPath: string;
    contentSha256: string;
    encryption: "aes-256-gcm";
  } | null;
  artifacts: Record<string, { path: string; sha256: string; bytes: number }>;
  cancelRequested: boolean;
  downloaded: boolean;
  payloadSha256: string;
};

const SALT = Buffer.from("song-maker-remote-v1");
const INFO = Buffer.from("payload-aes-256-gcm");

function log(cfg: WorkerConfig, msg: string): void {
  const line = `[remote-worker] ${msg}`;
  if (cfg.log) cfg.log(line);
  else console.info(line);
}

function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Node HKDF-SHA-256 matching packages/remote-worker deriveAesKeyFromToken. */
export function deriveAesKeyFromTokenNode(token: string): Buffer {
  return Buffer.from(hkdfSync("sha256", token.trim(), SALT, INFO, 32));
}

export async function decryptAesGcm(
  ciphertext: Buffer,
  key: Buffer,
  iv: Buffer,
): Promise<Buffer> {
  const { createDecipheriv } = await import("node:crypto");
  // Web Crypto AES-GCM appends 16-byte auth tag at the end.
  if (ciphertext.length < 17) {
    throw new Error("ciphertext trop court");
  }
  const tag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function buildMinimalWav(durationSec = 0.25, sampleRate = 48000): Buffer {
  const channels = 2;
  const bits = 16;
  const nFrames = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataSize = nFrames * channels * (bits / 8);
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * (bits / 8), 28);
  buf.writeUInt16LE(channels * (bits / 8), 32);
  buf.writeUInt16LE(bits, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // silence
  return buf;
}

function safeEqualToken(expected: string, provided: string | null): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function readBearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length).trim() || null;
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`payload exceeds max ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(raw),
    "cache-control": "no-store",
  });
  res.end(raw);
}

export class RemoteGpuWorkerServer {
  readonly config: WorkerConfig;
  private readonly jobs = new Map<string, StoredJob>();
  private readonly runningJobs = new Set<Promise<void>>();
  private server: Server | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WorkerConfig) {
    this.config = config;
  }

  getJob(id: string): StoredJob | undefined {
    return this.jobs.get(id);
  }

  async start(): Promise<{ baseUrl: string }> {
    await mkdir(this.config.dataDir, { recursive: true });
    if (!this.config.authToken.trim()) {
      throw new Error(
        "SONG_MAKER_REMOTE_WORKER_TOKEN (authToken) requis — refuse de démarrer sans jeton.",
      );
    }
    await new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handle(req, res).catch((e) => {
          log(this.config, `handler error: ${e instanceof Error ? e.message : String(e)}`);
          if (!res.headersSent) {
            sendJson(res, 500, { status: "failed", error: "internal_error" });
          }
        });
      });
      this.server.on("error", reject);
      this.server.listen(this.config.port, this.config.host, () => resolve());
    });
    const addr = this.server!.address();
    if (addr && typeof addr === "object") {
      this.config.port = addr.port;
    }
    this.cleanupTimer = setInterval(() => {
      void this.purgeExpired();
    }, 60_000);
    const baseUrl = `http://${this.config.host}:${this.config.port}`;
    log(
      this.config,
      `listening ${baseUrl} simulate=${this.config.simulate} retention=${this.config.retentionHours}h`,
    );
    return { baseUrl };
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    await Promise.allSettled([...this.runningJobs]);
    await new Promise<void>((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  async purgeExpired(): Promise<number> {
    const maxAge = this.config.retentionHours * 3600_000;
    const now = Date.now();
    let n = 0;
    for (const [id, job] of this.jobs) {
      if (now - job.createdAt > maxAge || (job.downloaded && this.config.deleteAfterDownload)) {
        await this.deleteJobFiles(job);
        this.jobs.delete(id);
        n += 1;
      }
    }
    if (n > 0) log(this.config, `purged ${n} job(s)`);
    return n;
  }

  private async deleteJobFiles(job: StoredJob): Promise<void> {
    const dir = join(this.config.dataDir, job.id);
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    if (!this.applyCors(req, res)) return;

    if (req.method === "GET" && path === "/v1/health") {
      // Health may be unauthenticated for load balancers; still no secrets.
      sendJson(res, 200, {
        ok: true,
        service: "song-maker-remote-worker",
        simulate: this.config.simulate,
        retentionHours: this.config.retentionHours,
      });
      return;
    }

    const token = readBearer(req);
    if (!safeEqualToken(this.config.authToken, token)) {
      sendJson(res, 401, {
        status: "rejected_unauthorized",
        error: "Bearer token invalide ou absent.",
      });
      return;
    }

    if (req.method === "POST" && path === "/v1/jobs") {
      await this.handleSubmit(req, res, token!);
      return;
    }

    const jobMatch = /^\/v1\/jobs\/([^/]+)$/.exec(path);
    if (req.method === "GET" && jobMatch) {
      this.handlePoll(res, decodeURIComponent(jobMatch[1]!));
      return;
    }

    const cancelMatch = /^\/v1\/jobs\/([^/]+)\/cancel$/.exec(path);
    if (req.method === "POST" && cancelMatch) {
      this.handleCancel(res, decodeURIComponent(cancelMatch[1]!));
      return;
    }

    const artMatch = /^\/v1\/jobs\/([^/]+)\/artifacts\/([^/]+)$/.exec(path);
    if (req.method === "GET" && artMatch) {
      await this.handleArtifact(
        res,
        decodeURIComponent(artMatch[1]!),
        decodeURIComponent(artMatch[2]!),
      );
      return;
    }

    sendJson(res, 404, { status: "failed", error: "not_found" });
  }

  private applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    const origin = req.headers.origin;
    if (origin) {
      const allowAnyOrigin = this.config.corsAllowedOrigins.includes("*");
      if (!allowAnyOrigin && !this.config.corsAllowedOrigins.includes(origin)) {
        sendJson(res, 403, { status: "failed", error: "origin_not_allowed" });
        return false;
      }
      res.setHeader(
        "access-control-allow-origin",
        allowAnyOrigin ? "*" : origin,
      );
      if (!allowAnyOrigin) res.setHeader("vary", "Origin");
      res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      res.setHeader(
        "access-control-allow-headers",
        "Accept, Authorization, Content-Type",
      );
      res.setHeader("access-control-expose-headers", "X-Content-SHA256");
      res.setHeader("access-control-max-age", "600");
    }

    if (req.method === "OPTIONS") {
      if (!new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname.startsWith("/v1/")) {
        sendJson(res, 404, { status: "failed", error: "not_found" });
        return false;
      }
      res.writeHead(204, { "cache-control": "no-store" });
      res.end();
      return false;
    }

    return true;
  }

  private async handleSubmit(
    req: IncomingMessage,
    res: ServerResponse,
    token: string,
  ): Promise<void> {
    let raw: Buffer;
    try {
      raw = await readBody(req, this.config.maxPayloadBytes + 64_000);
    } catch (e) {
      sendJson(res, 413, {
        status: "failed",
        error: e instanceof Error ? e.message : "payload_too_large",
      });
      return;
    }

    let body: {
      kind?: string;
      consent?: {
        userConsented?: boolean;
        retentionAcknowledged?: boolean;
      };
      payload?: {
        contentSha256?: string;
        encryption?: string;
        byteLength?: number;
        cipherPath?: string;
      };
      ciphertextBase64?: string;
      ivBase64?: string;
    };
    try {
      body = JSON.parse(raw.toString("utf8")) as typeof body;
    } catch {
      sendJson(res, 400, { status: "failed", error: "json_invalid" });
      return;
    }

    if (!body.consent?.userConsented) {
      sendJson(res, 403, {
        status: "rejected_no_consent",
        error: "Consentement utilisateur requis.",
      });
      return;
    }
    if (!body.consent.retentionAcknowledged) {
      sendJson(res, 403, {
        status: "rejected_retention",
        error: "Accusé de rétention requis.",
      });
      return;
    }
    if (body.kind !== "yue2_generate" && body.kind !== "htdemucs_separate") {
      sendJson(res, 400, { status: "failed", error: "kind_unsupported" });
      return;
    }
    if (!body.ciphertextBase64 || !body.ivBase64) {
      sendJson(res, 400, {
        status: "failed",
        error: "ciphertextBase64 et ivBase64 requis (enveloppe AES-GCM).",
      });
      return;
    }

    let cipher: Buffer;
    let iv: Buffer;
    try {
      cipher = Buffer.from(body.ciphertextBase64, "base64");
      iv = Buffer.from(body.ivBase64, "base64");
    } catch {
      sendJson(res, 400, { status: "failed", error: "base64_invalid" });
      return;
    }
    if (cipher.length > this.config.maxPayloadBytes) {
      sendJson(res, 413, { status: "failed", error: "payload_too_large" });
      return;
    }

    let plaintext: Buffer;
    try {
      const key = deriveAesKeyFromTokenNode(token);
      plaintext = await decryptAesGcm(cipher, key, iv);
    } catch (e) {
      sendJson(res, 400, {
        status: "failed",
        error: `decrypt_failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }

    const expectedSha = body.payload?.contentSha256?.toLowerCase();
    const gotSha = sha256Hex(plaintext);
    if (expectedSha && expectedSha !== gotSha) {
      sendJson(res, 400, {
        status: "failed",
        error: `checksum_mismatch expected=${expectedSha} got=${gotSha}`,
      });
      return;
    }

    let envelope: {
      projectId?: string;
      kind?: string;
      request?: Record<string, unknown>;
      artifacts?: Record<string, string>;
    };
    try {
      envelope = JSON.parse(plaintext.toString("utf8")) as typeof envelope;
    } catch {
      sendJson(res, 400, { status: "failed", error: "envelope_json_invalid" });
      return;
    }

    const id = `job-${randomUUID()}`;
    const jobDir = join(this.config.dataDir, id);
    await mkdir(jobDir, { recursive: true });
    await writeFile(join(jobDir, "request.json"), plaintext);

    const job: StoredJob = {
      id,
      status: "queued",
      kind: body.kind,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resultCipher: null,
      artifacts: {},
      cancelRequested: false,
      downloaded: false,
      payloadSha256: gotSha,
    };
    this.jobs.set(id, job);
    log(this.config, `job ${id} queued kind=${body.kind} project=${envelope.projectId ?? "?"}`);
    sendJson(res, 202, { id, status: "queued" });

    const running = this.runJob(job, envelope).catch((e) => {
      job.status = "failed";
      job.error = e instanceof Error ? e.message : String(e);
      job.updatedAt = Date.now();
      log(this.config, `job ${id} failed: ${job.error}`);
    });
    this.runningJobs.add(running);
    void running.finally(() => {
      this.runningJobs.delete(running);
    });
  }

  private handlePoll(res: ServerResponse, id: string): void {
    const job = this.jobs.get(id);
    if (!job) {
      sendJson(res, 404, { id, status: "failed", error: "job_not_found" });
      return;
    }
    sendJson(res, 200, {
      id: job.id,
      status: job.status,
      resultCipher: job.resultCipher,
      error: job.error,
      artifacts: Object.keys(job.artifacts),
    });
  }

  private handleCancel(res: ServerResponse, id: string): void {
    const job = this.jobs.get(id);
    if (!job) {
      sendJson(res, 404, { id, status: "failed", error: "job_not_found" });
      return;
    }
    job.cancelRequested = true;
    if (job.status === "queued" || job.status === "running") {
      job.status = "failed";
      job.error = "cancelled";
      job.updatedAt = Date.now();
    }
    sendJson(res, 200, { id: job.id, status: job.status, error: job.error });
  }

  private async handleArtifact(
    res: ServerResponse,
    id: string,
    name: string,
  ): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) {
      sendJson(res, 404, { error: "job_not_found" });
      return;
    }
    const allowed = new Set(["audio.wav", "score.abc", "result.json"]);
    if (!allowed.has(name)) {
      sendJson(res, 400, { error: "artifact_unknown" });
      return;
    }
    const meta = job.artifacts[name];
    if (!meta) {
      sendJson(res, 404, { error: "artifact_missing" });
      return;
    }
    const bytes = await readFile(meta.path);
    const sha = sha256Hex(bytes);
    if (sha !== meta.sha256) {
      sendJson(res, 500, {
        error: `artifact_corrupt expected=${meta.sha256} got=${sha}`,
      });
      return;
    }
    if (name === "audio.wav") {
      job.downloaded = true;
    }
    const type =
      name.endsWith(".wav")
        ? "audio/wav"
        : name.endsWith(".json")
          ? "application/json"
          : "text/plain; charset=utf-8";
    res.writeHead(200, {
      "content-type": type,
      "content-length": bytes.length,
      "x-content-sha256": sha,
      "cache-control": "no-store",
    });
    res.end(bytes);
  }

  private async runJob(
    job: StoredJob,
    envelope: {
      projectId?: string;
      request?: Record<string, unknown>;
      artifacts?: Record<string, string>;
    },
  ): Promise<void> {
    job.status = "running";
    job.updatedAt = Date.now();
    if (job.cancelRequested) {
      job.status = "failed";
      job.error = "cancelled";
      return;
    }

    const jobDir = join(this.config.dataDir, job.id);
    let wav: Buffer;
    let abc: string | null;
    let provenance: Record<string, unknown>;
    let instrumentalProcessing: Awaited<ReturnType<typeof remoteInstrumental>>["processing"] | null = null;

    if (this.config.simulate || !this.config.audiocppUrl) {
      wav = buildMinimalWav(0.25);
      abc =
        envelope.artifacts?.abc?.trim() ||
        "X:1\nT:remote-sim\nM:4/4\nL:1/8\nK:C\nCDEF|";
      provenance = {
        provider: "simulate",
        note: "AUDIOCPP_URL unset — simulated YuE2 for contract tests",
      };
    } else {
      const req = (envelope.request ?? {}) as {
        targetDurationSec?: number;
        preferFullLyrics?: boolean;
        instrumentalMode?: boolean;
        style?: string;
        lyrics?: string;
        cot?: string;
        seed?: number | null;
      };
      const contract = generationContract(req, envelope.artifacts?.lyrics ?? "");
      const lyrics = contract.lyrics;
      const body = {
        model: job.kind === "htdemucs_separate" ? "htdemucs" : "yue2",
        request:
          job.kind === "htdemucs_separate"
            ? { audio: "unsupported-remote-path" }
            : {
                lyrics,
                seed: req.seed ?? 1,
                options: {
                  style: req.style ?? "",
                  cot: req.cot ?? "full",
                  num_inference_steps: 8,
                  guidance_scale: 1.5,
                  export_semantic: true,
                  semantic_min_tokens: contract.minimum,
                  semantic_max_tokens: contract.maximum,
                  ...(envelope.artifacts?.abc
                    ? { abc: envelope.artifacts.abc }
                    : {}),
                },
              },
      };
      const resp = await fetch(`${this.config.audiocppUrl.replace(/\/$/, "")}/v1/tasks/run`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(body),
      });
      if (job.cancelRequested) {
        job.status = "failed";
        job.error = "cancelled";
        return;
      }
      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`audiocpp HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const json = JSON.parse(text) as {
        audio?: string;
        named_audio_outputs?: { audio?: string }[];
        score?: string;
        abc?: string;
        artifacts?: unknown;
      };
      const b64 =
        json.audio ||
        json.named_audio_outputs?.[0]?.audio ||
        "";
      if (!b64) throw new Error("audiocpp response without audio");
      wav = Buffer.from(b64, "base64");
      if (wav.length < 12 || wav.subarray(0, 4).toString() !== "RIFF") {
        throw new Error("audiocpp returned non-WAV audio");
      }
      const actual = wavMetadata(wav);
      if (actual.durationMs <= 0) {
        throw new Error("Le moteur distant n’a pas produit d’audio.");
      }
      abc = extractRemoteScore(json, envelope.artifacts?.abc);
      provenance = { provider: "audiocpp", endpoint: this.config.audiocppUrl };
      if (job.kind === "yue2_generate" && req.instrumentalMode === true) {
        const instrumental = await remoteInstrumental(wav, jobDir, this.config.audiocppUrl, () => job.cancelRequested);
        wav = instrumental.wav;
        instrumentalProcessing = instrumental.processing;
      }
    }

    if (job.cancelRequested) {
      job.status = "failed";
      job.error = "cancelled";
      return;
    }

    const wavPath = join(jobDir, "audio.wav");
    const abcPath = join(jobDir, "score.abc");
    const resultPath = join(jobDir, "result.json");
    await writeFile(wavPath, wav);
    if (abc) await writeFile(abcPath, abc, "utf8");
    const audioSha = sha256Hex(wav);
    const audioMetadata = wavMetadata(wav);
    const scoreSha = abc ? sha256Hex(Buffer.from(abc, "utf8")) : null;
    const result = {
      schema: "songmaker.generation.result",
      schemaVersion: 1,
      id: job.id,
      state: "generated",
      startedAt: new Date(job.createdAt).toISOString(),
      finishedAt: new Date().toISOString(),
      audio: {
        path: "audio.wav",
        ...audioMetadata,
        sha256: audioSha,
      },
      score: abc ? { path: "score.abc", sha256: scoreSha } : null,
      provenance: {
        ...provenance,
        remoteJobId: job.id,
        projectId: envelope.projectId ?? null,
        contentSha256: job.payloadSha256,
      },
      error: null,
      instrumentalProcessing,
    };
    const resultRaw = Buffer.from(JSON.stringify(result, null, 2), "utf8");
    await writeFile(resultPath, resultRaw);

    job.artifacts = {
      "audio.wav": { path: wavPath, sha256: audioSha, bytes: wav.length },
      ...(abc && scoreSha ? { "score.abc": {
        path: abcPath,
        sha256: scoreSha,
        bytes: Buffer.byteLength(abc, "utf8"),
      } } : {}),
      "result.json": {
        path: resultPath,
        sha256: sha256Hex(resultRaw),
        bytes: resultRaw.length,
      },
    };
    job.resultCipher = {
      cipherPath: `worker://${job.id}/artifacts`,
      contentSha256: audioSha,
      encryption: "aes-256-gcm",
    };
    job.status = "succeeded";
    job.updatedAt = Date.now();
    log(this.config, `job ${job.id} succeeded audioSha=${audioSha.slice(0, 12)}…`);
  }
}

export async function createAndStartWorker(
  overrides: Partial<WorkerConfig> = {},
): Promise<{ server: RemoteGpuWorkerServer; baseUrl: string }> {
  const config = defaultConfig(overrides);
  const server = new RemoteGpuWorkerServer(config);
  const { baseUrl } = await server.start();
  return { server, baseUrl };
}
