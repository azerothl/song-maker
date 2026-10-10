import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function smallPcmWav() {
  const data = Buffer.alloc(4800 * 2);
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
    schema: 'songmaker.score', schemaVersion: 1, id: 'score-v001', version: 1,
    voices: [{ id: 'piano', vst3Instrument: { pluginPath: 'C:/private/piano.vst3', pluginName: 'Private Piano',
      stateB64: 'private-plugin-state', parameters: { gain: 0.5 } },
      notes: [{ id: 'note-1', startTick: 0, durationTick: 480, pitch: 60, velocity: 90 }] }],
  }));
  const existingGeneration = path.join(projectFolder, 'generations', 'gen-001');
  await mkdir(existingGeneration, { recursive: true });
  await writeFile(path.join(existingGeneration, 'request.json'), JSON.stringify({
    id: 'gen-001', createdAt: '2026-10-10T00:30:00Z', seed: 8, cot: 'full', generationEngine: 'yue2',
  }));
  const existingAudio = smallPcmWav();
  await writeFile(path.join(existingGeneration, 'result.json'), JSON.stringify({
    state: 'generated', audio: { path: 'audio.wav', sha256: createHash('sha256').update(existingAudio).digest('hex') },
  }));
  await writeFile(path.join(existingGeneration, 'audio.wav'), existingAudio);
  const client = new Client({ name: 'song-maker-test', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [server],
    env: { ...process.env, SONG_MAKER_WORKSPACE_ROOT: process.cwd(),
      SONG_MAKER_DOCUMENTS_DIR: documentsRoot } });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(),
      ['add_library_track', 'add_project_midi_track', 'add_track_to_playlist', 'cancel_job', 'create_playlist', 'create_project',
        'delete_playlist', 'delete_project', 'edit_project_score', 'export_project_audio', 'get_project', 'get_project_mix',
        'get_project_score', 'gpu_status', 'job_status', 'list_library', 'list_project_versions', 'list_projects',
        'remove_library_track', 'remove_track_from_playlist', 'rename_project', 'rename_project_generation', 'resume_job',
        'runtime_status', 'start_batch', 'start_song', 'update_project', 'update_project_mix', 'use_project_generation',
        'use_project_mix', 'use_project_score', 'use_project_separation']);
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
    const mixState = JSON.parse(openedMix.content[0].text);
    assert.equal(mixState.mix.tracks[0].name, 'Piano');
    assert.match(mixState.mixRevision, /^[a-f0-9]{64}$/);
    const changedMix = await client.callTool({ name: 'update_project_mix', arguments: {
      projectId: 'project-001', expectedMixRevision: mixState.mixRevision,
      masterGainDb: -2, tracks: [{ id: 'piano', gainDb: -3, pan: 0.25, mute: true }],
    } });
    assert.equal(changedMix.isError, undefined);
    const changedMixState = JSON.parse(changedMix.content[0].text);
    assert.equal(changedMixState.mix.masterGainDb, -2);
    assert.equal(changedMixState.mix.tracks[0].gainDb, -3);
    assert.equal(changedMixState.mix.tracks[0].pan, 0.25);
    assert.equal(changedMixState.mix.tracks[0].mute, true);
    const addedMidi = await client.callTool({ name: 'add_project_midi_track', arguments: {
      projectId: 'project-001', expectedMixRevision: changedMixState.mixRevision, name: 'Piano MIDI',
    } });
    assert.equal(addedMidi.isError, undefined);
    const addedMidiState = JSON.parse(addedMidi.content[0].text);
    assert.match(addedMidiState.addedTrackIds[0], /^midi-/);
    assert.deepEqual(
      (({ role, name, gainDb, pan, mute, solo, clips }) => ({ role, name, gainDb, pan, mute, solo, clips }))(addedMidiState.mix.tracks.at(-1)),
      { role: 'midi', name: 'Piano MIDI', gainDb: 0, pan: 0, mute: false, solo: false, clips: [] },
    );
    const staleMix = await client.callTool({ name: 'update_project_mix', arguments: {
      projectId: 'project-001', expectedMixRevision: mixState.mixRevision, tracks: [{ id: 'piano', solo: true }],
    } });
    assert.equal(staleMix.isError, true);
    const openedScore = await client.callTool({ name: 'get_project_score', arguments: { projectId: 'project-001' } });
    assert.equal(openedScore.isError, undefined);
    const scoreState = JSON.parse(openedScore.content[0].text);
    assert.equal(scoreState.score.voices[0].notes[0].pitch, 60);
    assert.match(scoreState.scoreRevision, /^[a-f0-9]{64}$/);
    assert.equal('pluginPath' in scoreState.score.voices[0].vst3Instrument, false);
    assert.equal('stateB64' in scoreState.score.voices[0].vst3Instrument, false);
    const editedScore = await client.callTool({ name: 'edit_project_score', arguments: {
      projectId: 'project-001', expectedScoreRevision: scoreState.scoreRevision,
      edits: [
        { operation: 'add', voiceId: 'piano', note: { id: 'note-2', startTick: 480, durationTick: 240, pitch: 64, velocity: 75 } },
        { operation: 'update', voiceId: 'piano', noteId: 'note-1', changes: { pitch: 61, velocity: 92 } },
        { operation: 'delete', voiceId: 'piano', noteId: 'note-2' },
      ],
    } });
    assert.equal(editedScore.isError, undefined);
    const editedScoreState = JSON.parse(editedScore.content[0].text);
    assert.equal(editedScoreState.scoreId, 'score-v002');
    assert.equal(editedScoreState.active, true);
    assert.equal(editedScoreState.score.voices[0].notes.length, 1);
    assert.equal(editedScoreState.score.voices[0].notes[0].pitch, 61);
    assert.equal(editedScoreState.score.voices[0].notes[0].velocity, 92);
    assert.equal(editedScoreState.score.voices[0].vst3Instrument.pluginName, 'Private Piano');
    assert.equal(JSON.parse(await readFile(path.join(scoreFolder, 'score-v001.json'), 'utf8')).voices[0].notes[0].pitch, 60);
    const staleScore = await client.callTool({ name: 'edit_project_score', arguments: {
      projectId: 'project-001', expectedScoreRevision: scoreState.scoreRevision,
      edits: [{ operation: 'delete', voiceId: 'piano', noteId: 'note-1' }],
    } });
    assert.equal(staleScore.isError, true);
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

    const generationId = 'gen-002';
    const generationFolder = path.join(documentsRoot, 'profiles', 'profile-001', 'projects',
      createdProject.id, 'generations', generationId);
    await mkdir(generationFolder, { recursive: true });
    await writeFile(path.join(generationFolder, 'request.json'), JSON.stringify({ id: generationId }));
    const audio = smallPcmWav();
    const sha256 = createHash('sha256').update(audio).digest('hex');
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({
      state: 'generated', audio: { path: 'audio.wav', sha256 },
    }));
    await writeFile(path.join(generationFolder, 'audio.wav'), audio);
    const useGeneration = await client.callTool({ name: 'use_project_generation', arguments: {
      projectId: createdProject.id, generationId, expectedUpdatedAt: JSON.parse(updated.content[0].text).project.updatedAt,
    } });
    assert.equal(useGeneration.isError, undefined);
    const selectedProject = JSON.parse(useGeneration.content[0].text).project;
    assert.equal(selectedProject.activeGenerationId, generationId);
    assert.equal(selectedProject.activeSeparationId, null);
    assert.equal(selectedProject.activeMixId, null);
    const renamedGeneration = await client.callTool({ name: 'rename_project_generation', arguments: {
      projectId: createdProject.id, generationId, name: '  Prise retenue  ',
      expectedUpdatedAt: selectedProject.updatedAt,
    } });
    assert.equal(renamedGeneration.isError, undefined);
    const namedProject = JSON.parse(renamedGeneration.content[0].text).project;
    assert.equal(namedProject.generationNames[generationId], 'Prise retenue');
    const staleGenerationRename = await client.callTool({ name: 'rename_project_generation', arguments: {
      projectId: createdProject.id, generationId, name: 'Ancienne révision',
      expectedUpdatedAt: selectedProject.updatedAt,
    } });
    assert.equal(staleGenerationRename.isError, true);
    const createdProjectFolder = path.resolve(generationFolder, '..', '..');
    const separationFolder = path.join(createdProjectFolder, 'separations', 'sep-001');
    const mixesFolder = path.join(createdProjectFolder, 'mixes');
    const scoresFolder = path.join(createdProjectFolder, 'scores');
    await Promise.all([
      mkdir(separationFolder, { recursive: true }),
      mkdir(mixesFolder, { recursive: true }),
      mkdir(scoresFolder, { recursive: true }),
    ]);
    await writeFile(path.join(separationFolder, 'separation.json'), JSON.stringify({
      schema: 'songmaker.separation', schemaVersion: 1, generationId, family: 'htdemucs',
    }));
    await writeFile(path.join(mixesFolder, 'mix-v001.json'), JSON.stringify({
      schema: 'songmaker.mix', schemaVersion: 1, id: 'mix-v001', separationId: 'sep-001', tracks: [],
    }));
    await writeFile(path.join(mixesFolder, 'mix-v002.json'), JSON.stringify({
      schema: 'songmaker.mix', schemaVersion: 1, id: 'mix-v002', separationId: 'sep-001',
      tracks: [{ id: 'piano', role: 'user', name: 'Piano retouché', clips: [] }],
    }));
    await writeFile(path.join(scoresFolder, 'score-v001.json'), JSON.stringify({
      schema: 'songmaker.score', schemaVersion: 1, id: 'score-v001', voices: [],
    }));
    const selectedSeparation = await client.callTool({ name: 'use_project_separation', arguments: {
      projectId: createdProject.id, separationId: 'sep-001', expectedUpdatedAt: namedProject.updatedAt,
    } });
    assert.equal(selectedSeparation.isError, undefined);
    const separatedProject = JSON.parse(selectedSeparation.content[0].text).project;
    assert.equal(separatedProject.activeSeparationId, 'sep-001');
    assert.equal(separatedProject.activeMixId, 'mix-v001');
    const staleMixSelection = await client.callTool({ name: 'use_project_mix', arguments: {
      projectId: createdProject.id, mixId: 'mix-v002', expectedUpdatedAt: selectedProject.updatedAt,
    } });
    assert.equal(staleMixSelection.isError, true);
    const selectedMix = await client.callTool({ name: 'use_project_mix', arguments: {
      projectId: createdProject.id, mixId: 'mix-v002', expectedUpdatedAt: separatedProject.updatedAt,
    } });
    assert.equal(selectedMix.isError, undefined);
    const mixedProject = JSON.parse(selectedMix.content[0].text).project;
    assert.equal(mixedProject.activeMixId, 'mix-v002');
    assert.equal(mixedProject.activeSeparationId, 'sep-001');
    assert.equal(JSON.parse(selectedMix.content[0].text).mix.tracks[0].name, 'Piano retouché');
    const selectedScore = await client.callTool({ name: 'use_project_score', arguments: {
      projectId: createdProject.id, scoreId: 'score-v001', expectedUpdatedAt: mixedProject.updatedAt,
    } });
    assert.equal(selectedScore.isError, undefined);
    const scoredProject = JSON.parse(selectedScore.content[0].text).project;
    assert.equal(scoredProject.activeScoreId, 'score-v001');
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
      projectId: createdProject.id, expectedUpdatedAt: scoredProject.updatedAt,
    } });
    assert.equal(unconfirmedDelete.isError, true);
    const deleted = await client.callTool({ name: 'delete_project', arguments: {
      projectId: createdProject.id, expectedUpdatedAt: scoredProject.updatedAt,
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
