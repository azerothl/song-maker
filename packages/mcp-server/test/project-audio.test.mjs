import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { exportProjectAudio } from '../src/project-audio.mjs';
import { createProject } from '../src/projects.mjs';

function smallPcmWav() {
  const data = Buffer.alloc(8);
  data.writeInt16LE(1200, 0);
  data.writeInt16LE(-900, 2);
  data.writeInt16LE(700, 4);
  data.writeInt16LE(-500, 6);
  const wav = Buffer.alloc(44 + data.length);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(48_000, 24);
  wav.writeUInt32LE(192_000, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);
  return wav;
}

test('project audio export copies a finished profile WAV into the workspace without overwriting', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-audio-'));
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'song-maker-mcp-audio-workspace-'));
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(path.join(documentsRoot, 'profiles', 'profile-audio'), { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-audio', profiles: [{ id: 'profile-audio', name: 'Test', kind: 'hobby' }],
    }));
    const { project } = await createProject({ title: 'Blue Hour', env });
    const generationFolder = path.join(documentsRoot, 'profiles', 'profile-audio', 'projects', project.id,
      'generations', 'gen-7');
    await mkdir(generationFolder, { recursive: true });
    await writeFile(path.join(generationFolder, 'request.json'), JSON.stringify({ id: 'gen-7' }));
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({ state: 'generated' }));
    const wav = smallPcmWav();
    await writeFile(path.join(generationFolder, 'audio.wav'), wav);

    const exported = await exportProjectAudio({
      projectId: project.id,
      generationId: 'gen-7',
      outputDirectory: 'exports',
      workspace,
      env,
    });
    assert.equal(exported.profileId, 'profile-audio');
    assert.equal(exported.projectId, project.id);
    assert.equal(exported.generationId, 'gen-7');
    assert.equal(exported.format, 'wav');
    assert.equal(exported.bytes, wav.length);
    assert.equal(exported.audio.sampleRateHz, 48_000);
    assert.equal(exported.audio.channels, 2);
    assert.deepEqual(await readFile(exported.path), wav);

    await assert.rejects(exportProjectAudio({
      projectId: project.id,
      generationId: 'gen-7',
      outputDirectory: 'exports',
      fileName: path.basename(exported.path),
      workspace,
      env,
    }), /Export déjà présent/);
    assert.deepEqual(await readFile(exported.path), wav);
  } finally {
    await Promise.all([
      rm(documentsRoot, { recursive: true, force: true }),
      rm(workspace, { recursive: true, force: true }),
    ]);
  }
});

test('project audio export refuses unfinished generations, unsafe names, and paths outside the workspace', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-audio-guards-'));
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'song-maker-mcp-audio-workspace-'));
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(path.join(documentsRoot, 'profiles', 'profile-audio'), { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-audio', profiles: [{ id: 'profile-audio', name: 'Test', kind: 'hobby' }],
    }));
    const { project } = await createProject({ title: 'Unfinished', env });
    const generationFolder = path.join(documentsRoot, 'profiles', 'profile-audio', 'projects', project.id,
      'generations', 'gen-8');
    await mkdir(generationFolder, { recursive: true });
    await writeFile(path.join(generationFolder, 'request.json'), JSON.stringify({ id: 'gen-8' }));
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({ state: 'running' }));
    await writeFile(path.join(generationFolder, 'audio.wav'), smallPcmWav());

    const base = { projectId: project.id, generationId: 'gen-8', env, workspace };
    await assert.rejects(exportProjectAudio({ ...base, outputDirectory: 'exports' }), /pas publiée/);
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({ state: 'generated' }));
    await assert.rejects(exportProjectAudio({
      ...base, generationId: 'gen-8', outputDirectory: 'exports', fileName: '../escape.wav',
    }), /nom de fichier WAV simple/);
    await assert.rejects(exportProjectAudio({
      ...base, generationId: 'gen-8', outputDirectory: path.dirname(workspace),
    }), /SONG_MAKER_WORKSPACE_ROOT/);
  } finally {
    await Promise.all([
      rm(documentsRoot, { recursive: true, force: true }),
      rm(workspace, { recursive: true, force: true }),
    ]);
  }
});
