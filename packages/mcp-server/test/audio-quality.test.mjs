import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { inspectWav } from '../src/audio-quality.mjs';

function pcm16Wav(samples, sampleRate = 8000) {
  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
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
  wav.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) => wav.writeInt16LE(sample, 44 + index * 2));
  return wav;
}

test('audio review detects silence, dropouts, and clipped samples', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'song-maker-quality-'));
  const file = path.join(dir, 'silent.wav');
  try {
    await writeFile(file, pcm16Wav(new Array(8000 * 4).fill(0)));
    const quiet = await inspectWav(file);
    assert.equal(quiet.durationSec, 4);
    assert.ok(quiet.warnings.includes('near_silence'));
    assert.ok(quiet.warnings.includes('dropout_suspected'));

    await writeFile(file, pcm16Wav(new Array(8000 * 4).fill(32767)));
    const clipped = await inspectWav(file);
    assert.ok(clipped.warnings.includes('clipping'));

    await writeFile(file, pcm16Wav(new Array(8000 * 4).fill(6553)));
    const normal = await inspectWav(file);
    assert.deepEqual(normal.warnings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
