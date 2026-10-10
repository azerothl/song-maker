import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { acquireGpuLock, assertGpuSafe, assertRequestedDuration, auditPromptDiversity, cancelJob, cliArgs, cliPlanArgs,
  fitSongPlan, getJob, gpuLimits, inferenceThreads, insideWorkspace, normalizeSong, outputName, parseBatch,
  parseGpuTelemetry, plansDuration, publishExclusive, releaseGpuLock, runtimeStatus, scoreFromTaskResult,
  semanticBudget, serverPlanRequest, serverSongRequest, wavDurationMs, workspaceRoot } from '../src/runtime.mjs';

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

test('instrumental plans are generated alone, then rendered from the fitted ABC', () => {
  const runtime = { modelDir: 'model', modelName: 'q4.gguf' };
  const song = normalizeSong({ ...basic, lyrics: '', instrumentalMode: true, targetDurationSec: 210 });
  assert.equal(plansDuration(song), true);
  assert.equal(plansDuration({ ...song, cot: 'off' }), false);
  assert.equal(plansDuration(normalizeSong(basic)), false);

  const planArgs = cliPlanArgs(song, runtime, 'plan-dir');
  assert.ok(!planArgs.includes('--out'));
  assert.deepEqual(planArgs.slice(-4), ['--request-option', 'stop_after=abc', '--out-dir', 'plan-dir']);
  const renderArgs = cliArgs(song, runtime, 'out.wav', { abcFile: 'fitted.abc' });
  assert.equal(renderArgs[renderArgs.indexOf('abc_file=fitted.abc') - 1], '--request-option');
  assert.ok(!cliArgs(song, runtime, 'out.wav').some(arg => arg.startsWith('abc_file=')));

  const plan = serverPlanRequest(song).request;
  assert.deepEqual(Object.keys(plan.options).sort(), ['cot', 'stop_after', 'style']);
  assert.equal(plan.options.stop_after, 'abc');
  assert.equal(serverSongRequest(song, { abc: 'X:1' }).request.options.abc, 'X:1');
  assert.equal(serverSongRequest(song).request.options.abc, undefined);
});

test('the plan is read from the score artifact and fitted to the fixed duration', () => {
  const abc = ['X:1', 'M:4/4', 'L:1/32', 'Q:1/4=90', 'K:C', '% intro', 'V: Vocal', 'z32|z32|z32|z32|',
    '% verse', 'V: Vocal', 'c32|d32|e32|f32|', '% outro', 'V: Vocal', 'c32|z32|'].join('\n');
  const result = { artifacts: [{ id: 'score', kind: 'custom', payload: Buffer.from(abc).toString('base64'),
    meta: { format: 'abc', extension: 'abc' } }], timing: { wall_ms: 4269 } };
  assert.equal(scoreFromTaskResult(result), abc);
  assert.equal(scoreFromTaskResult({ artifacts: [] }), '');

  const song = normalizeSong({ ...basic, lyrics: '', instrumentalMode: true, targetDurationSec: 60 });
  const fitted = fitSongPlan(song, abc);
  assert.equal(fitted.report.action, 'extended');
  assert.equal(fitted.report.planSec, 26.7);
  assert.ok(fitted.report.fittedSec >= 62);
  assert.equal(fitted.warning, null);

  const missing = fitSongPlan(song, '');
  assert.equal(missing.abc, null);
  assert.equal(missing.report.action, 'missing');
  assert.match(missing.warning, /durée n’a pas été ajustée/);
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

test('Q4 is selected by default; Q8 requires an explicit choice', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'song-maker-runtime-'));
  const previousCache = process.env.SONG_MAKER_CACHE;
  const previousModel = process.env.SONG_MAKER_MODEL;
  const cache = path.join(dir, 'cache');
  const binaries = path.join(cache, 'binaries', 'v0.8.2', 'windows-cuda12.4');
  const modelDir = path.join(cache, 'models', 'Yue2-3B-GGUF');
  const files = [
    path.join(binaries, 'audiocpp_cli.exe'),
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
    process.env.SONG_MAKER_CACHE = cache;
    delete process.env.SONG_MAKER_MODEL;
    assert.equal(runtimeStatus().modelName, 'yue2-3b-q4_0.gguf');
    process.env.SONG_MAKER_MODEL = 'q8';
    assert.equal(runtimeStatus().modelName, 'yue2-3b-q8_0.gguf');
  } finally {
    if (previousCache === undefined) delete process.env.SONG_MAKER_CACHE;
    else process.env.SONG_MAKER_CACHE = previousCache;
    if (previousModel === undefined) delete process.env.SONG_MAKER_MODEL;
    else process.env.SONG_MAKER_MODEL = previousModel;
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

test('batch rejects modes this headless runner cannot honor', () => {
  for (const extra of [{ maxParallelGenerations: 2 }, { onError: 'pause' }, { retry: { maxAttempts: 2 } }]) {
    assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1, songs: [basic], ...extra })));
  }
  assert.equal(parseBatch(JSON.stringify({ schemaVersion: 1, songs: [basic] })).length, 1);
  assert.equal(parseBatch(JSON.stringify({ schemaVersion: 1, onError: 'continue', songs: [basic] })).length, 1);
  assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1,
    defaults: { generations: 2 }, songs: [basic] })));
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
