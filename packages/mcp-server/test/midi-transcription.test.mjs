import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildMinimalMidi } from '@song-maker/score-engine';
import { transcribeAudioToMidi } from '../src/midi-transcription.mjs';

const midi = Buffer.from(buildMinimalMidi({
  ppq: 480,
  tempoBpm: 88,
  notes: [
    { startTick: 0, durationTick: 240, pitch: 64, velocity: 90 },
    { startTick: 240, durationTick: 240, pitch: 67, velocity: 80 },
  ],
}));

async function makeWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'song-maker-midi-'));
  await mkdir(path.join(workspace, 'audio'));
  await writeFile(path.join(workspace, 'audio', 'take.wav'), Buffer.from('audio fixture'));
  return workspace;
}

function fakeTranscriber({ output = midi, stdout = { model: 'C:/models/basicpitch.onnx', backend: 'onnx' } } = {}) {
  return async (_executable, _script, _source, destination) => {
    if (output) await writeFile(destination, output);
    return JSON.stringify(stdout);
  };
}

test('transcribes a workspace audio file and publishes validated MIDI metadata', async () => {
  const workspace = await makeWorkspace();
  try {
    const result = await transcribeAudioToMidi({
      sourcePath: 'audio/take.wav', outputDirectory: 'exports', workspace,
      pythonResolver: async () => 'python-test', transcriber: fakeTranscriber(),
    });
    assert.equal(result.sourcePath, 'audio/take.wav');
    assert.equal(result.midiPath, 'exports/take.mid');
    assert.equal(result.noteCount, 2);
    assert.equal(result.midiTrackCount, 1);
    assert.equal(result.model, 'basicpitch.onnx');
    assert.equal(result.backend, 'onnx');
    assert.equal(result.bytes, midi.length);
    assert.equal(await readFile(path.join(workspace, result.midiPath)).then(bytes => bytes.equals(midi)), true);
    assert.deepEqual(await readdir(path.join(workspace, 'exports')), ['take.mid']);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('rejects audio or output paths outside the configured workspace', async () => {
  const workspace = await makeWorkspace();
  const outside = path.join(path.dirname(workspace), 'outside.wav');
  await writeFile(outside, 'audio');
  const transcriber = fakeTranscriber();
  try {
    await assert.rejects(transcribeAudioToMidi({
      sourcePath: outside, outputDirectory: 'exports', workspace,
      pythonResolver: async () => 'python-test', transcriber,
    }), /doit rester dans SONG_MAKER_WORKSPACE_ROOT/);
    await assert.rejects(transcribeAudioToMidi({
      sourcePath: 'audio/take.wav', outputDirectory: path.dirname(workspace), workspace,
      pythonResolver: async () => 'python-test', transcriber,
    }), /doit rester dans SONG_MAKER_WORKSPACE_ROOT/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});

test('refuses an existing export without starting transcription', async () => {
  const workspace = await makeWorkspace();
  const exports = path.join(workspace, 'exports');
  await mkdir(exports);
  await writeFile(path.join(exports, 'existing.mid'), 'keep this');
  let called = false;
  try {
    await assert.rejects(transcribeAudioToMidi({
      sourcePath: 'audio/take.wav', outputDirectory: 'exports', fileName: 'existing.mid', workspace,
      pythonResolver: async () => 'python-test',
      transcriber: async () => { called = true; return ''; },
    }), /Export déjà présent/);
    assert.equal(called, false);
    assert.equal(await readFile(path.join(exports, 'existing.mid'), 'utf8'), 'keep this');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('does not publish invalid MIDI or report a successful transcription without ONNX metadata', async () => {
  const workspace = await makeWorkspace();
  try {
    await assert.rejects(transcribeAudioToMidi({
      sourcePath: 'audio/take.wav', outputDirectory: 'exports', fileName: 'invalid.mid', workspace,
      pythonResolver: async () => 'python-test', transcriber: fakeTranscriber({ output: Buffer.from('not midi') }),
    }), /vide, invalide|format MIDI/);
    await assert.rejects(transcribeAudioToMidi({
      sourcePath: 'audio/take.wav', outputDirectory: 'exports', fileName: 'non-onnx.mid', workspace,
      pythonResolver: async () => 'python-test', transcriber: fakeTranscriber({ stdout: { model: 'basicpitch.tflite' } }),
    }), /modèle ONNX/);
    assert.deepEqual(await readdir(path.join(workspace, 'exports')), []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
