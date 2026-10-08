import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { checkRemoteDuration, wavMetadata } from "./generation-contract.js";

const run = promisify(execFile);
const roles = ["drums", "bass", "other"] as const;

/** audio.cpp and this worker must share the worker data directory. */
export async function remoteInstrumental(original: Buffer, jobDir: string, endpoint: string, cancelled: () => boolean) {
  const directory = join(jobDir, "instrumental");
  await mkdir(directory, { recursive: true });
  const originalPath = join(jobDir, "audio-original.wav");
  await writeFile(originalPath, original);
  const expectedMs = wavMetadata(original).durationMs;
  const ffmpeg = process.env.SONG_MAKER_FFMPEG || "ffmpeg";
  const runFfmpeg = async (args: string[]) => {
    try {
      await run(ffmpeg, args, { windowsHide: true, maxBuffer: 1024 * 1024 });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      throw new Error(code === "ENOENT"
        ? "FFmpeg est absent du worker. Installez-le ou configurez SONG_MAKER_FFMPEG pour retirer les voix. L’original reste conservé."
        : "La préparation de l’instrumental a échoué. Vérifiez FFmpeg sur le worker. L’original reste conservé.", { cause: error });
    }
  };
  const convert = async (source: string, target: string, rate: number) => {
    if (cancelled()) throw new Error("cancelled");
    await runFfmpeg(["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
      "-af", `aresample=${rate}:resampler=soxr:precision=28`, "-ac", "2", "-c:a", "pcm_s16le", target]);
    checkRemoteDuration(wavMetadata(await readFile(target)).durationMs, expectedMs);
  };
  const input = join(directory, "input-44100.wav");
  await convert(originalPath, input, 44100);
  if (cancelled()) throw new Error("cancelled");
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/tasks/run`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "htdemucs", request: { audio: resolve(input) } }),
  });
  if (!response.ok) throw new Error("Le retrait des voix a échoué. Vérifiez que HTDemucs est installé sur le worker et que le moteur peut lire son dossier de données.");
  const result = await response.json() as { named_audio_outputs?: { id: string; audio: string }[] };
  const stems = result.named_audio_outputs;
  if (!Array.isArray(stems)) throw new Error("Le moteur n’a pas fourni les pistes nécessaires au retrait des voix.");
  const paths: string[] = [];
  for (const role of [...roles, "vocals"]) {
    const matches = stems.filter(stem => stem.id === role);
    if (matches.length !== 1 || typeof matches[0]!.audio !== "string") throw new Error(`Piste ${role} absente ou ambiguë. L’instrumental n’est pas publié.`);
    const bytes = Buffer.from(matches[0]!.audio, "base64");
    checkRemoteDuration(wavMetadata(bytes).durationMs, expectedMs);
    const source = join(directory, `${role}.wav`);
    await writeFile(source, bytes);
    if (role !== "vocals") {
      const converted = join(directory, `${role}-48000.wav`);
      await convert(source, converted, 48000);
      paths.push(converted);
    }
  }
  if (cancelled()) throw new Error("cancelled");
  const output = join(jobDir, "audio-instrumental.wav");
  await runFfmpeg(["-nostdin", "-hide_banner", "-loglevel", "error", "-y",
    ...paths.flatMap(path => ["-i", path]), "-filter_complex",
    "[0:a][1:a][2:a]amix=inputs=3:duration=longest:normalize=0,alimiter=limit=0.95:level=false:latency=true[out]",
    "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", output]);
  const wav = await readFile(output);
  checkRemoteDuration(wavMetadata(wav).durationMs, expectedMs);
  return { wav, processing: { method: "htdemucs-accompaniment", originalPath: "audio-original.wav",
    originalSha256: createHash("sha256").update(original).digest("hex"),
    includedStems: roles, excludedStems: ["vocals"], residualVocalsPossible: true } };
}
