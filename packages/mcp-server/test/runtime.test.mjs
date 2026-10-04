import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { cliArgs, insideWorkspace, normalizeSong, outputName, parseBatch, semanticBudget, workspaceRoot } from '../src/runtime.mjs';

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
  for (const extra of [{ maxParallelGenerations: 2 }, { onError: 'continue' }, { retry: { maxAttempts: 2 } }]) {
    assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1, songs: [basic], ...extra })));
  }
  assert.throws(() => parseBatch(JSON.stringify({ schemaVersion: 1,
    defaults: { generations: 2 }, songs: [basic] })));
});

test('exports stay in the declared workspace and safe file names', () => {
  assert.equal(insideWorkspace('audio'), path.join(workspaceRoot, 'audio'));
  assert.throws(() => insideWorkspace('..'));
  assert.equal(outputName(normalizeSong({ ...basic, title: 'Soft: Morning / Dawn' }), 0), '01 - Soft Morning  Dawn.wav');
});
