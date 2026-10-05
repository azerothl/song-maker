import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { cliArgs, acquireGpuLock, insideWorkspace, normalizeSong, outputName, parseBatch,
  publishExclusive, releaseGpuLock, semanticBudget, workspaceRoot } from '../src/runtime.mjs';

const basic = { id: '01', title: 'Soft Morning', style: 'chill soul', lyrics: '[Verse]\nA quiet room', seed: 42 };

test('batch defaults feed YuE2 arguments and output names', () => {
  const [song] = parseBatch(JSON.stringify({ schemaVersion: 1,
    defaults: { targetDurationSec: 360, singingLanguage: 'en', preferFullLyrics: true }, songs: [basic] }));
  assert.equal(song.duration, 360);
  assert.equal(outputName(song, 0), '01 - Soft Morning.wav');
  const args = cliArgs(song, { modelDir: 'model', modelName: 'yue2-3b-q4_0.gguf' }, 'out.wav');
  assert.ok(args.includes('yue2.model_gguf=yue2-3b-q4_0.gguf'));
  assert.ok(args.includes('style=English, chill soul'));
  assert.deepEqual(semanticBudget(song), [9000, 11250]);
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
