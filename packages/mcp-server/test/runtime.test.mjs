import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { acquireGpuLock, assertGpuSafe, assertRequestedDuration, assertYue2GenerationAllowed, auditPromptDiversity, cancelJob, cliArgs, getJob, gpuLimits,
  inferenceThreads, insideWorkspace, normalizeSong, outputName, parseBatch, parseGpuTelemetry, publishExclusive,
  releaseGpuLock, runtimeStatus, semanticBudget, serverSongRequest, uniqueBatchSongs, wavDurationMs,
  workspaceRoot } from '../src/runtime.mjs';

const basic = { id: '01', title: 'Soft Morning', style: 'chill soul', lyrics: '[Verse]\nA quiet room', seed: 42 };

test('batch defaults feed YuE2 arguments and output names', () => {
  const [song] = parseBatch(JSON.stringify({ schemaVersion: 1,
    defaults: { targetDurationSec: 360, singingLanguage: 'en', preferFullLyrics: true }, songs: [basic] }));
  assert.equal(song.duration, 360);
  assert.equal(outputName(song, 0), '01 - Soft Morning.wav');
  const args = cliArgs(song, { modelDir: 'model', modelName: 'yue2-3b-q4_0.gguf' }, 'out.wav');
  assert.ok(args.includes('yue2.model_gguf=yue2-3b-q4_0.gguf'));
  assert.ok(args.includes('style=English, chill soul'));
  assert.ok(args.includes('--threads'));
  assert.deepEqual(semanticBudget(song), [9000, 11250]);
});

test('instrumental requests use empty lyrics and a fixed duration token budget', () => {
  const song = normalizeSong({ ...basic, lyrics: '', instrumentalMode: true,
    targetDurationSec: 30, preferFullLyrics: true });
  const args = cliArgs(song, { modelDir: 'model', modelName: 'q4.gguf' }, 'out.wav');
  assert.equal(args[args.indexOf('--lyrics') + 1], '');
  assert.deepEqual(semanticBudget(song), [750, 750]);
  assert.deepEqual(semanticBudget({ ...song, duration: 360, instrumental: false, preferFullLyrics: false }), [9000, 9000]);
});

test('fixed-duration YuE2 exports must match the requested duration', () => {
  const instrumental = normalizeSong({ ...basic, lyrics: '', instrumentalMode: true,
    targetDurationSec: 30 });
  assert.doesNotThrow(() => assertRequestedDuration(instrumental, 30_250));
  assert.throws(() => assertRequestedDuration(instrumental, 29_749), { code: 'GENERATION_DURATION_MISMATCH' });
  assert.doesNotThrow(() => assertRequestedDuration({ ...instrumental, instrumental: false,
    preferFullLyrics: true }, 8_000));
});

test('persistent-server instrumental requests leave lyrics empty and keep a fixed token budget', () => {
  const song = normalizeSong({ ...basic, lyrics: '', instrumentalMode: true, targetDurationSec: 60 });
  const request = serverSongRequest(song).request;
  assert.equal(request.lyrics, '');
  assert.equal(request.options.semantic_min_tokens, 1500);
  assert.equal(request.options.semantic_max_tokens, 1500);
});

test('batch prompt audit flags incomplete directions, duplicate prompts, and repeated axes', () => {
  const direction = {
    scene: 'rainy station platform',
    groove: 'broken shuffle rhythm',
    foreground: 'muted trumpet',
    harmony: 'open minor ninth chords',
    arrangement: 'solo piano then bass enters',
    motif: 'descending three note phrase',
  };
  const first = { ...basic, id: '01', creativeDirection: direction };
  const duplicate = { ...basic, id: '02', creativeDirection: direction };
  const incomplete = { ...basic, id: '03', creativeDirection: { scene: 'night garden' } };
  const audit = auditPromptDiversity([first, duplicate, incomplete]);
  assert.deepEqual(audit.exactDuplicates, [{ first: '01', second: '02' }]);
  assert.deepEqual(audit.underSpecified.map(song => song.id), ['03']);
  assert.deepEqual(audit.repeatedDirections.scene, [['01', '02']]);
});

test('WAV duration reader validates RIFF metadata without loading audio data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'song-maker-wav-'));
  const file = path.join(dir, 'test.wav');
  const sampleRate = 8000;
  const frames = sampleRate;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(frames * 2, 40);
  try {
    await writeFile(file, wav);
    assert.equal(await wavDurationMs(file), 1000);
    await writeFile(file, wav.subarray(0, 100));
    await assert.rejects(wavDurationMs(file), /tronqué/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('GPU telemetry parsing distinguishes unreadable sensors from overheating', () => {
  assert.throws(() => parseGpuTelemetry('NVIDIA GeForce, N/A, N/A'), { code: 'GPU_TELEMETRY_UNAVAILABLE' });
  assert.throws(() => assertGpuSafe({ name: 'NVIDIA', temperature: 80, freeMemoryMiB: 18000 },
    gpuLimits('q4')), { code: 'GPU_SAFETY_STOP' });
});

test('YuE2 runtime follows the active Song Maker cache and model, with an explicit per-job override', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'song-maker-runtime-'));
  const documents = path.join(dir, 'documents');
  const profileDirectory = path.join(documents, 'profiles', 'profile-001');
  const cache = path.join(dir, 'cache');
  const binaryFolder = process.platform === 'win32' ? 'windows-cuda12.4' : 'linux-cuda12.8-colab';
  const binaryName = process.platform === 'win32' ? 'audiocpp_cli.exe' : 'audiocpp_cli';
  const binaries = path.join(cache, 'binaries', 'v0.8.2', binaryFolder);
  const modelDir = path.join(cache, 'models', 'Yue2-3B-GGUF');
  const files = [
    path.join(binaries, binaryName),
    path.join(modelDir, 'yue2-3b-q4_0.gguf'),
    path.join(modelDir, 'yue2-3b-q8_0.gguf'),
    path.join(modelDir, 'yue2-vae-f16.gguf'),
    ...['yue2-model-config.json', 'yue2-generation-config.json', 'yue2-qwen.tiktoken', 'yue2-vae-config.json']
      .map(name => path.join(modelDir, 'sidecars', name)),
  ];
  try {
    await Promise.all(files.map(async file => {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, '');
    }));
    await mkdir(profileDirectory, { recursive: true });
    await writeFile(path.join(documents, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-001', profiles: [{ id: 'profile-001', kind: 'hobby' }],
    }));
    await writeFile(path.join(documents, 'settings.json'), JSON.stringify({
      cacheDir: cache, modelPack: 'q4', modelGguf: 'yue2-3b-q8_0.gguf',
    }));
    await writeFile(path.join(profileDirectory, 'profile-settings.json'), JSON.stringify({
      generationEngine: 'yue2', localYue2Enabled: true, yue2LicenseAccepted: true,
    }));

    const env = { ...process.env, SONG_MAKER_DOCUMENTS_DIR: documents };
    delete env.SONG_MAKER_CACHE;
    delete env.SONG_MAKER_MODEL;
    const appRuntime = runtimeStatus({ env });
    assert.equal(appRuntime.modelName, 'yue2-3b-q8_0.gguf');
    assert.equal(appRuntime.modelId, 'q8');
    assert.equal(appRuntime.profileId, 'profile-001');
    assert.equal(appRuntime.yue2LicenseAccepted, true);
    assert.equal(appRuntime.ready, false);
    assert.ok(appRuntime.missing.includes('YuE2 Q4 ou Q8'));
    assert.doesNotThrow(() => assertYue2GenerationAllowed(appRuntime));
    assert.throws(() => assertYue2GenerationAllowed({ ...appRuntime, localYue2Enabled: false }, {}), /désactivé/);
    assert.throws(() => assertYue2GenerationAllowed({ ...appRuntime, yue2LicenseAccepted: false }, {}), /licence non commerciale/);

    const explicitQ4 = runtimeStatus({ modelId: 'q4', env });
    assert.equal(explicitQ4.modelName, 'yue2-3b-q4_0.gguf');
    assert.equal(explicitQ4.modelId, 'q4');
    assert.throws(() => runtimeStatus({ engineId: 'ace_step', env }), /Moteur MCP indisponible/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('cancel_job marks a running job for cooperative cancellation', async () => {
  const jobId = randomUUID();
  const jobsDir = path.join(workspaceRoot, '.song-maker-mcp', 'jobs');
  const jobPath = path.join(jobsDir, jobId + '.json');
  const cancelPath = path.join(jobsDir, jobId + '.cancel');
  await mkdir(jobsDir, { recursive: true });
  try {
    await writeFile(jobPath, JSON.stringify({ id: jobId, state: 'running', pid: process.pid }));
    assert.deepEqual(await cancelJob(jobId), { id: jobId, state: 'cancelling', cancelled: true });
    assert.equal((await getJob(jobId)).state, 'cancelling');
  } finally {
    await rm(jobPath, { force: true });
    await rm(cancelPath, { force: true });
  }
});

test('musical metadata is included in the style prompt', () => {
  const song = normalizeSong({ ...basic, key: { tonic: 'Eb', mode: 'minor' },
    meter: { numerator: 6, denominator: 8 }, tempoBpm: 76 });
  const args = cliArgs(song, { modelDir: 'model', modelName: 'q4.gguf' }, 'out.wav');
  assert.ok(args.includes('style=English, chill soul, 76 BPM, key Eb minor, 6/8'));
});

test('batch rejects modes this headless runner cannot honor and expands requested takes', () => {
  for (const extra of [{ maxParallelGenerations: 2 }, { onError: 'pause' }, { retry: { maxAttempts: 2 } }]) {
    assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1, songs: [basic], ...extra })));
  }
  assert.equal(parseBatch(JSON.stringify({ schemaVersion: 1, songs: [basic] })).length, 1);
  assert.equal(parseBatch(JSON.stringify({ schemaVersion: 1, onError: 'continue', songs: [basic] })).length, 1);
  const takes = parseBatch(JSON.stringify({ schemaVersion: 1,
    defaults: { generations: 2 }, songs: [{ ...basic, seed: 0xffff_ffff }] }));
  assert.deepEqual(takes.map(song => song.generationIndex), [1, 2]);
  assert.deepEqual(takes.map(song => song.generationCount), [2, 2]);
  assert.deepEqual(takes.map(song => song.seed), [0xffff_ffff, 0]);
  assert.deepEqual(takes.map((song, index) => outputName(song, index)), [
    '01 - Soft Morning - Prise 01.wav', '01 - Soft Morning - Prise 02.wav',
  ]);
  for (const generations of [0, 1001, 1.5]) {
    assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1,
      songs: [{ ...basic, generations }] })), /Nombre de générations invalide/);
  }
  const tooManyTasks = Array.from({ length: 11 }, (_, index) => ({
    ...basic, id: String(index + 1), generations: 1000,
  }));
  assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1, songs: tooManyTasks })), /10 000 prises/);
  const atTaskLimit = parseBatch(JSON.stringify({ schemaVersion: 1,
    songs: tooManyTasks.slice(0, 10) }));
  assert.equal(atTaskLimit.length, 10_000);
});

test('batch prompt audit counts each title once regardless of take count', () => {
  const direction = {
    scene: 'rainy station platform', groove: 'broken shuffle rhythm', foreground: 'muted trumpet',
    harmony: 'open minor ninth chords', arrangement: 'solo piano then bass enters',
    motif: 'descending three note phrase',
  };
  const takes = parseBatch(JSON.stringify({ schemaVersion: 1,
    songs: [{ ...basic, generations: 3, creativeDirection: direction }] }));
  assert.equal(takes.length, 3);
  assert.equal(uniqueBatchSongs(takes).length, 1);
  assert.deepEqual(auditPromptDiversity(uniqueBatchSongs(takes)).exactDuplicates, []);
});

test('inference CPU threads use a bounded default and validate overrides', () => {
  assert.ok(inferenceThreads() >= 1 && inferenceThreads() <= 8);
  assert.equal(inferenceThreads('6'), 6);
  assert.throws(() => inferenceThreads('0'), /entre 1 et 64/);
  assert.throws(() => inferenceThreads('many'), /entre 1 et 64/);
});

test('GPU preflight enforces temperature, VRAM, and a conservative limit', () => {
  const telemetry = parseGpuTelemetry('NVIDIA GeForce RTX 4090, 48, 18000\n');
  assert.equal(telemetry.name, 'NVIDIA GeForce RTX 4090');
  assert.deepEqual(gpuLimits('yue2-3b-q4_0.gguf'), { maxTemperature: 80, minimumFreeMemoryMiB: 8192 });
  assert.deepEqual(gpuLimits('yue2-3b-q8_0.gguf'), { maxTemperature: 80, minimumFreeMemoryMiB: 12288 });
  assert.doesNotThrow(() => assertGpuSafe(telemetry, gpuLimits('q4')));
  assert.throws(() => assertGpuSafe({ ...telemetry, temperature: 80 }, gpuLimits('q4')), { code: 'GPU_SAFETY_STOP' });
  assert.throws(() => assertGpuSafe({ ...telemetry, freeMemoryMiB: 7000 }, gpuLimits('q4')), { code: 'GPU_MEMORY_LOW' });
  assert.throws(() => gpuLimits('q4', '90'), /entre 65 et 85/);
});

test('GPU lock rejects a concurrent job and releases for the next job', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'song-maker-lock-'));
  const lockPath = path.join(dir, 'gpu.lock');
  try {
    await acquireGpuLock('job-one', lockPath);
    await assert.rejects(acquireGpuLock('job-two', lockPath), /GPU est déjà occupé/);
    await releaseGpuLock('job-one', lockPath);
    assert.equal((await acquireGpuLock('job-two', lockPath)).jobId, 'job-two');
    await releaseGpuLock('job-two', lockPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('publishExclusive never replaces an existing export', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'song-maker-export-'));
  const temporary = path.join(dir, 'track.partial.wav');
  const destination = path.join(dir, 'track.wav');
  try {
    await writeFile(temporary, 'new audio');
    await writeFile(destination, 'existing audio');
    await assert.rejects(publishExclusive(temporary, destination), /Export déjà présent/);
    assert.equal(await readFile(destination, 'utf8'), 'existing audio');
    await writeFile(temporary, 'new audio');
    await rm(destination);
    await publishExclusive(temporary, destination);
    assert.equal(await readFile(destination, 'utf8'), 'new audio');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('exports stay in the declared workspace and safe file names', () => {
  assert.equal(insideWorkspace('audio'), path.join(workspaceRoot, 'audio'));
  assert.throws(() => insideWorkspace('..'));
  assert.equal(outputName(normalizeSong({ ...basic, title: 'Soft: Morning / Dawn' }), 0), '01 - Soft Morning  Dawn.wav');
});
