import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

test('MCP exposes the headless tools over stdio', async () => {
  const server = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-mcp-profile-'));
  const exportDirectory = `.test-mcp-export-${process.pid}`;
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-001', 'projects', 'project-001');
  const mixFolder = path.join(projectFolder, 'mixes');
  const scoreFolder = path.join(projectFolder, 'scores');
  await Promise.all([mkdir(mixFolder, { recursive: true }), mkdir(scoreFolder, { recursive: true })]);
  await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
    activeProfileId: 'profile-001', profiles: [{ id: 'profile-001', name: 'Test', kind: 'hobby' }],
  }));
  await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
    id: 'project-001', title: 'Piste de test', createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T01:00:00Z', style: 'Jazz discret', lyrics: 'Couplet local',
    activeGenerationId: 'gen-001', generationNames: { 'gen-001': 'Prise retenue' }, activeMixId: 'mix-v001',
    activeScoreId: 'score-v001',
  }));
  await writeFile(path.join(mixFolder, 'mix-v001.json'), JSON.stringify({
    schema: 'songmaker.mix', schemaVersion: 1, id: 'mix-v001', separationId: 'sep-001',
    masterGainDb: 0, tracks: [{ id: 'piano', role: 'user', name: 'Piano', clips: [] }],
  }));
  await writeFile(path.join(scoreFolder, 'score-v001.json'), JSON.stringify({
    schema: 'songmaker.score', schemaVersion: 1, id: 'score-v001', voices: [{ id: 'piano', notes: [{ pitch: 60 }] }],
  }));
  const existingGeneration = path.join(projectFolder, 'generations', 'gen-001');
  await mkdir(existingGeneration, { recursive: true });
  await writeFile(path.join(existingGeneration, 'request.json'), JSON.stringify({
    id: 'gen-001', createdAt: '2026-10-10T00:30:00Z', seed: 8, cot: 'full', generationEngine: 'yue2',
  }));
  await writeFile(path.join(existingGeneration, 'result.json'), JSON.stringify({ state: 'generated' }));
  await writeFile(path.join(existingGeneration, 'audio.wav'), smallPcmWav());
  const client = new Client({ name: 'song-maker-test', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [server],
    env: { ...process.env, SONG_MAKER_WORKSPACE_ROOT: process.cwd(),
      SONG_MAKER_DOCUMENTS_DIR: documentsRoot } });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(),
      ['add_library_track', 'add_track_to_playlist', 'cancel_job', 'create_playlist', 'create_project',
        'delete_playlist', 'delete_project', 'export_project_audio', 'get_project', 'get_project_mix',
        'get_project_score', 'gpu_status', 'job_status', 'list_library', 'list_project_versions', 'list_projects',
        'remove_library_track', 'remove_track_from_playlist', 'rename_project', 'resume_job',
        'runtime_status', 'start_batch', 'start_song', 'update_project']);
    const status = await client.callTool({ name: 'runtime_status', arguments: {} });
    assert.equal(status.isError, undefined);
    assert.equal(typeof JSON.parse(status.content[0].text).ready, 'boolean');
    const listed = await client.callTool({ name: 'list_projects', arguments: { query: 'test' } });
    assert.equal(listed.isError, undefined);
    const list = JSON.parse(listed.content[0].text);
    assert.equal(list.profileId, 'profile-001');
    assert.equal(list.projects[0].title, 'Piste de test');
    assert.equal('lyrics' in list.projects[0], false);
    const opened = await client.callTool({ name: 'get_project', arguments: { projectId: 'project-001' } });
    assert.equal(opened.isError, undefined);
    assert.equal(JSON.parse(opened.content[0].text).project.lyrics, 'Couplet local');
    const versions = await client.callTool({ name: 'list_project_versions', arguments: { projectId: 'project-001' } });
    assert.equal(versions.isError, undefined);
    const versionList = JSON.parse(versions.content[0].text);
    assert.equal(versionList.generations[0].id, 'gen-001');
    assert.equal(versionList.generations[0].active, true);
    assert.equal(versionList.generations[0].name, 'Prise retenue');
    assert.equal(versionList.generations[0].audioPath, 'generations/gen-001/audio.wav');
    const openedMix = await client.callTool({ name: 'get_project_mix', arguments: { projectId: 'project-001' } });
    assert.equal(openedMix.isError, undefined);
    assert.equal(JSON.parse(openedMix.content[0].text).mix.tracks[0].name, 'Piano');
    const openedScore = await client.callTool({ name: 'get_project_score', arguments: { projectId: 'project-001' } });
    assert.equal(openedScore.isError, undefined);
    assert.equal(JSON.parse(openedScore.content[0].text).score.voices[0].notes[0].pitch, 60);
    const exportedAudio = await client.callTool({ name: 'export_project_audio', arguments: {
      projectId: 'project-001', generationId: 'gen-001', outputDirectory: exportDirectory,
    } });
    assert.equal(exportedAudio.isError, undefined);
    const exportResult = JSON.parse(exportedAudio.content[0].text);
    assert.equal(exportResult.format, 'wav');
    assert.equal(exportResult.audio.sampleRateHz, 48_000);
    assert.deepEqual(await readFile(exportResult.path), smallPcmWav());
    const invalid = await client.callTool({ name: 'get_project', arguments: { projectId: '../outside' } });
    assert.equal(invalid.isError, true);
    const created = await client.callTool({ name: 'create_project', arguments: { title: 'MCP created' } });
    assert.equal(created.isError, undefined);
    const createdProject = JSON.parse(created.content[0].text).project;
    assert.equal(createdProject.title, 'MCP created');
    const renamed = await client.callTool({ name: 'rename_project', arguments: {
      projectId: createdProject.id, title: 'MCP renamed', expectedUpdatedAt: createdProject.updatedAt,
    } });
    assert.equal(renamed.isError, undefined);
    const renamedProject = JSON.parse(renamed.content[0].text).project;
    assert.equal(renamedProject.title, 'MCP renamed');
    const updated = await client.callTool({ name: 'update_project', arguments: {
      projectId: createdProject.id, expectedUpdatedAt: renamedProject.updatedAt,
      style: 'Ambient piano', lyrics: 'A small beginning', cot: 'melody', tempoBpm: 88,
    } });
    assert.equal(updated.isError, undefined);
    assert.equal(JSON.parse(updated.content[0].text).project.style, 'Ambient piano');

    const generationId = 'gen-client-001';
    const generationFolder = path.join(documentsRoot, 'profiles', 'profile-001', 'projects',
      createdProject.id, 'generations', generationId);
    await mkdir(generationFolder, { recursive: true });
    await writeFile(path.join(generationFolder, 'request.json'), JSON.stringify({ id: generationId }));
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({ state: 'generated' }));
    await writeFile(path.join(generationFolder, 'audio.wav'), smallPcmWav());
    const addedTrack = await client.callTool({ name: 'add_library_track', arguments: {
      projectId: createdProject.id, generationId, expectedUpdatedAt: null,
    } });
    assert.equal(addedTrack.isError, undefined);
    const library = JSON.parse(addedTrack.content[0].text);
    assert.equal(library.tracks.length, 1);
    const playlistResult = await client.callTool({ name: 'create_playlist', arguments: {
      title: 'Client playlist', expectedUpdatedAt: library.updatedAt,
    } });
    assert.equal(playlistResult.isError, undefined);
    const playlistState = JSON.parse(playlistResult.content[0].text);
    assert.equal(playlistState.playlists[0].title, 'Client playlist');
    const unconfirmedDelete = await client.callTool({ name: 'delete_project', arguments: {
      projectId: createdProject.id, expectedUpdatedAt: JSON.parse(updated.content[0].text).project.updatedAt,
    } });
    assert.equal(unconfirmedDelete.isError, true);
    const deleted = await client.callTool({ name: 'delete_project', arguments: {
      projectId: createdProject.id, expectedUpdatedAt: JSON.parse(updated.content[0].text).project.updatedAt,
      confirm: true,
    } });
    assert.equal(deleted.isError, undefined);
    const deletion = JSON.parse(deleted.content[0].text);
    assert.equal(deletion.deleted, true);
    assert.equal(deletion.removedLibraryTracks, 1);
    const remainingLibrary = await client.callTool({ name: 'list_library', arguments: {} });
    assert.equal(JSON.parse(remainingLibrary.content[0].text).tracks.length, 0);
    assert.equal(JSON.parse(remainingLibrary.content[0].text).playlists.length, 1);
  } finally {
    await client.close();
    await rm(documentsRoot, { recursive: true, force: true });
    await rm(path.join(process.cwd(), exportDirectory), { recursive: true, force: true });
  }
});
