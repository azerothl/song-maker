#!/usr/bin/env node
/**
 * Reference remote GPU worker CLI.
 * Env (never logged as values in this process beyond presence):
 *   SONG_MAKER_REMOTE_WORKER_TOKEN  (required)
 *   SONG_MAKER_REMOTE_WORKER_HOST   (default 127.0.0.1)
 *   SONG_MAKER_REMOTE_WORKER_PORT   (default 8787)
 *   SONG_MAKER_REMOTE_WORKER_DATA   (default OS tmp)
 *   SONG_MAKER_REMOTE_WORKER_MAX_BYTES
 *   SONG_MAKER_REMOTE_WORKER_RETENTION_HOURS
 *   AUDIOCPP_URL                   (optional — real YuE2 GPU)
 *   SONG_MAKER_REMOTE_WORKER_SIMULATE=1
 */
import { createAndStartWorker, type WorkerConfig } from "./server.js";

const token = process.env.SONG_MAKER_REMOTE_WORKER_TOKEN?.trim() ?? "";
if (!token) {
  console.error(
    "Missing SONG_MAKER_REMOTE_WORKER_TOKEN. Refusing to start without auth.",
  );
  process.exit(1);
}

const port = Number(process.env.SONG_MAKER_REMOTE_WORKER_PORT ?? "8787");
const host = process.env.SONG_MAKER_REMOTE_WORKER_HOST ?? "127.0.0.1";
const simulate =
  process.env.SONG_MAKER_REMOTE_WORKER_SIMULATE === "1" ||
  !process.env.AUDIOCPP_URL;

const overrides: Partial<WorkerConfig> = {
  host,
  port,
  authToken: token,
  audiocppUrl: process.env.AUDIOCPP_URL ?? null,
  simulate,
};
if (process.env.SONG_MAKER_REMOTE_WORKER_DATA) {
  overrides.dataDir = process.env.SONG_MAKER_REMOTE_WORKER_DATA;
}
if (process.env.SONG_MAKER_REMOTE_WORKER_MAX_BYTES) {
  overrides.maxPayloadBytes = Number(
    process.env.SONG_MAKER_REMOTE_WORKER_MAX_BYTES,
  );
}
if (process.env.SONG_MAKER_REMOTE_WORKER_RETENTION_HOURS) {
  overrides.retentionHours = Number(
    process.env.SONG_MAKER_REMOTE_WORKER_RETENTION_HOURS,
  );
}

const { server, baseUrl } = await createAndStartWorker(overrides);

console.info(`song-maker remote worker ready at ${baseUrl}`);
console.info(
  `mode=${simulate ? "simulate" : "audiocpp"} token=set retention configured`,
);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
