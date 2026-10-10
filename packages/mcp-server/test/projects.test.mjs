import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProject, deleteProject, getProject, getProjectMix, getProjectScore, listProjectVersions, listProjects, renameProject, updateProject, updateProjectMix, useProjectGeneration, useProjectScore, useProjectSeparation } from '../src/projects.mjs';

function smallPcmWav() {
  const frames = 800;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(frames * 2, 40);
  return wav;
}

test('project tools read the active profile and hide lyrics from list results', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-projects-'));
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-002', 'projects', 'project-001');
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(projectFolder, { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-002', profiles: [{ id: 'profile-002', name: 'Hobby', kind: 'hobby' }],
    }));
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
      id: 'project-001', title: 'Blue Hour', createdAt: '2026-10-09T00:00:00Z',
      updatedAt: '2026-10-10T00:00:00Z', style: 'Jazz', lyrics: 'Private verse',
      activeMixId: 'mix-001',
    }));

    const listed = await listProjects({ env });
    assert.equal(listed.profileId, 'profile-002');
    assert.equal(listed.projects.length, 1);
    assert.equal(listed.projects[0].activeMixId, 'mix-001');
    assert.equal('lyrics' in listed.projects[0], false);
    assert.equal((await listProjects({ query: 'missing', env })).projects.length, 0);
    assert.equal((await getProject({ projectId: 'project-001', env })).project.lyrics, 'Private verse');
    await assert.rejects(getProject({ projectId: '../outside', env }), /Identifiant de projet invalide/);
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('project tools use the legacy folder when the manifest has no active profile', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-legacy-projects-'));
  const projectFolder = path.join(documentsRoot, 'projects', 'project-legacy');
  try {
    await mkdir(projectFolder, { recursive: true });
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
      id: 'project-legacy', title: 'Legacy project',
    }));
    const listed = await listProjects({ env: { SONG_MAKER_DOCUMENTS_DIR: documentsRoot } });
    assert.equal(listed.profileId, null);
    assert.equal(listed.projects[0].title, 'Legacy project');
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('project version listing returns safe generation, separation, mix, and score metadata', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-versions-'));
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-versions', 'projects', 'project-001');
  const generationFolder = path.join(projectFolder, 'generations', 'gen-001');
  const separationFolder = path.join(projectFolder, 'separations', 'sep-001');
  const mixesFolder = path.join(projectFolder, 'mixes');
  const scoresFolder = path.join(projectFolder, 'scores');
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await Promise.all([
      mkdir(generationFolder, { recursive: true }),
      mkdir(separationFolder, { recursive: true }),
      mkdir(mixesFolder, { recursive: true }),
      mkdir(scoresFolder, { recursive: true }),
    ]);
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-versions', profiles: [{ id: 'profile-versions', name: 'Hobby', kind: 'hobby' }],
    }));
    await writeFile(path.join(generationFolder, 'request.json'), JSON.stringify({
      id: 'gen-001', createdAt: '2026-10-09T23:00:00Z', seed: 42, cot: 'full', generationEngine: 'ace_step',
    }));
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({ state: 'generated' }));
    await writeFile(path.join(generationFolder, 'audio.wav'), 'placeholder audio');
    await writeFile(path.join(generationFolder, 'score.abc'), 'X:1');
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
      id: 'project-001', title: 'Night Sketch', updatedAt: '2026-10-10T00:00:00Z',
      activeGenerationId: 'gen-001', generationNames: { 'gen-001': 'Version gardée' },
      activeSeparationId: 'sep-001', activeMixId: 'mix-v002', activeScoreId: 'score-v001',
      lyrics: 'Private lyrics',
    }));
    await writeFile(path.join(separationFolder, 'separation.json'), JSON.stringify({
      id: 'sep-001', family: 'htdemucs', createdAt: '2026-10-09T23:10:00Z', warnings: ['rôle indisponible'],
    }));
    await writeFile(path.join(separationFolder, 'job.json'), JSON.stringify({ generationId: 'gen-001' }));
    await writeFile(path.join(mixesFolder, 'mix-v001.json'), JSON.stringify({
      id: 'mix-v001', separationId: 'sep-001', createdAt: '2026-10-09T23:11:00Z', tracks: [], masterGainDb: 0,
    }));
    await writeFile(path.join(mixesFolder, 'mix-v002.json'), JSON.stringify({
      id: 'mix-v002', separationId: 'sep-001', createdAt: '2026-10-09T23:12:00Z',
      tracks: [{ id: 'voice' }], masterGainDb: -2,
    }));
    await writeFile(path.join(scoresFolder, 'score-v001.json'), JSON.stringify({
      id: 'score-v001', version: 2, source: 'manual', parentScoreId: 'score-v000',
      branchName: 'Refrain', createdAt: '2026-10-09T23:13:00Z', voices: [{ notes: [{}, {}] }],
    }));

    const listed = await listProjectVersions({ projectId: 'project-001', env });
    assert.equal(listed.profileId, 'profile-versions');
    assert.equal(listed.activeGenerationId, 'gen-001');
    assert.equal(listed.activeSeparationId, 'sep-001');
    assert.equal(listed.activeMixId, 'mix-v002');
    assert.equal(listed.activeScoreId, 'score-v001');
    assert.equal(listed.generations.length, 1);
    assert.deepEqual(listed.generations[0], {
      id: 'gen-001', name: 'Version gardée', createdAt: '2026-10-09T23:00:00Z',
      seed: 42, cot: 'full', engineId: 'ace_step_1_5', state: 'generated', active: true,
      parentGenerationId: null, hasScore: true, audioAvailable: true,
      audioPath: 'generations/gen-001/audio.wav',
    });
    assert.deepEqual(listed.separations, [{
      id: 'sep-001', mixId: 'mix-v001', createdAt: '2026-10-09T23:10:00Z', active: true,
      generationId: 'gen-001', family: 'htdemucs', warnings: ['rôle indisponible'],
    }]);
    assert.deepEqual(listed.mixVersions, [{
      id: 'mix-v002', separationId: 'sep-001', createdAt: '2026-10-09T23:12:00Z',
      active: true, trackCount: 1, masterGainDb: -2,
    }]);
    assert.deepEqual(listed.scores, [{
      id: 'score-v001', parentScoreId: 'score-v000', branchName: 'Refrain', version: 2,
      source: 'manual', noteCount: 2, createdAt: '2026-10-09T23:13:00Z', active: true,
    }]);
    assert.equal(JSON.stringify(listed).includes('Private lyrics'), false);
    assert.equal(JSON.stringify(listed).includes(projectFolder), false);
    await assert.rejects(listProjectVersions({ projectId: '../outside', env }), /Identifiant de projet invalide/);
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('MCP reads mix and score documents while hiding host-specific plugin and audio paths', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-documents-'));
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-documents', 'projects', 'project-001');
  const mixesFolder = path.join(projectFolder, 'mixes');
  const separationFolder = path.join(projectFolder, 'separations', 'sep-001');
  const scoresFolder = path.join(projectFolder, 'scores');
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await Promise.all([
      mkdir(mixesFolder, { recursive: true }),
      mkdir(separationFolder, { recursive: true }),
      mkdir(scoresFolder, { recursive: true }),
    ]);
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-documents', profiles: [{ id: 'profile-documents', name: 'Hobby', kind: 'hobby' }],
    }));
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
      schema: 'songmaker.project', schemaVersion: 1, id: 'project-001', title: 'Open the mix',
      updatedAt: '2026-10-10T00:00:00.000Z', activeMixId: 'mix-v002', activeSeparationId: null,
      activeScoreId: null,
    }));
    await writeFile(path.join(separationFolder, 'separation.json'), JSON.stringify({
      schema: 'songmaker.separation', schemaVersion: 1, generationId: 'gen-001', family: 'htdemucs',
    }));
    await writeFile(path.join(mixesFolder, 'mix-v002.json'), JSON.stringify({
      schema: 'songmaker.mix', schemaVersion: 1, id: 'mix-v002', separationId: 'sep-001',
      masterGainDb: -2, tracks: [{
        id: 'vocals', role: 'vocals', name: 'Vocals', gainDb: -1, pan: 0, mute: false, solo: false,
        locked: false, aiSeparated: true,
        clips: [
          { id: 'clip-relative', sourcePath: 'separations/sep-001/vocals.wav', startMs: 0, durationMs: 1000 },
          { id: 'clip-host', sourcePath: 'D:\\private\\audio\\take.wav', startMs: 1000, durationMs: 500 },
          { id: 'clip-escape', sourcePath: '../../outside.wav', startMs: 1500, durationMs: 500 },
        ],
        experimentalVst3Insert: { pluginPath: 'C:\\VST\\private.vst3', factoryPresent: true, stateB64: 'opaque' },
      }],
      vst3MasterInsert: {
        pluginPath: 'C:\\VST\\master.vst3', pluginName: 'Master Plug', enabled: true,
        parameters: { '7': 0.5 }, stateB64: 'opaque-master-state',
      },
    }));
    await writeFile(path.join(scoresFolder, 'score-v001.json'), JSON.stringify({
      schema: 'songmaker.score', schemaVersion: 1, id: 'score-v001', version: 1,
      voices: [{ id: 'voice-1', name: 'Piano', notes: [{ pitch: 60, startBeat: 0, durationBeats: 1 }] }],
    }));

    const mixResult = await getProjectMix({ projectId: 'project-001', env });
    assert.equal(mixResult.active, true);
    assert.equal(mixResult.mix.tracks[0].clips[0].sourcePath, 'separations/sep-001/vocals.wav');
    assert.equal(mixResult.mix.tracks[0].clips[1].sourcePath, null);
    assert.equal(mixResult.mix.tracks[0].clips[1].sourcePathIsExternal, true);
    assert.equal(mixResult.mix.tracks[0].clips[2].sourcePath, null);
    assert.equal(mixResult.mix.tracks[0].experimentalVst3Insert.factoryPresent, true);
    assert.equal('pluginPath' in mixResult.mix.tracks[0].experimentalVst3Insert, false);
    assert.equal('stateB64' in mixResult.mix.tracks[0].experimentalVst3Insert, false);
    assert.deepEqual(mixResult.mix.vst3MasterInsert, {
      pluginName: 'Master Plug', enabled: true, parameters: { '7': 0.5 },
    });
    assert.equal(JSON.stringify(mixResult).includes('C:\\\\VST'), false);
    assert.equal(JSON.stringify(mixResult).includes('opaque-master-state'), false);
    assert.equal(JSON.stringify(mixResult).includes('D:\\\\private'), false);

    const selectedSeparation = await useProjectSeparation({
      projectId: 'project-001', separationId: 'sep-001',
      expectedUpdatedAt: '2026-10-10T00:00:00.000Z', env,
    });
    assert.equal(selectedSeparation.project.activeSeparationId, 'sep-001');
    assert.equal(selectedSeparation.project.activeMixId, 'mix-v002');
    assert.equal(selectedSeparation.mix.id, 'mix-v002');
    await assert.rejects(useProjectSeparation({
      projectId: 'project-001', separationId: 'sep-001',
      expectedUpdatedAt: '2026-10-10T00:00:00.000Z', env,
    }), /projet a changé/);

    const scoreResult = await getProjectScore({ projectId: 'project-001', scoreId: 'score-v001', env });
    assert.equal(scoreResult.active, false);
    assert.equal(scoreResult.score.voices[0].notes[0].pitch, 60);
    const selectedScore = await useProjectScore({
      projectId: 'project-001', scoreId: 'score-v001',
      expectedUpdatedAt: selectedSeparation.project.updatedAt, env,
    });
    assert.equal(selectedScore.project.activeScoreId, 'score-v001');
    assert.equal(selectedScore.score.voices[0].notes[0].pitch, 60);
    await assert.rejects(getProjectMix({ projectId: 'project-001', mixId: '../outside', env }), /Identifiant de mix invalide/);
    await assert.rejects(getProjectScore({ projectId: 'project-001', scoreId: 'score-v999', env }), /introuvable/);
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('MCP updates active mix levels and track controls with a current mix revision', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-update-mix-'));
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-mix', 'projects', 'project-mix');
  const mixesFolder = path.join(projectFolder, 'mixes');
  const mixPath = path.join(mixesFolder, 'mix-v001.json');
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(mixesFolder, { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({ activeProfileId: 'profile-mix' }));
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
      schema: 'songmaker.project', schemaVersion: 1, id: 'project-mix', title: 'Mix controls',
      updatedAt: '2026-10-10T00:00:00.000Z', activeMixId: 'mix-v001',
    }));
    await writeFile(mixPath, JSON.stringify({
      schema: 'songmaker.mix', schemaVersion: 1, id: 'mix-v001', separationId: '',
      sampleRate: 48000, masterGainDb: 0, peakCeilingDb: -1,
      vst3MasterInsert: { pluginPath: 'C:/private/plugin.vst3', pluginName: 'Private plugin', enabled: true },
      tracks: [
        { id: 'voice', role: 'vocal', name: 'Voice', gainDb: 0, pan: 0, mute: false, solo: false,
          locked: false, aiSeparated: false, clips: [], experimentalVst3Insert: null },
        { id: 'drums', role: 'drums', name: 'Drums', gainDb: -2, pan: 0.1, mute: false, solo: false,
          locked: false, aiSeparated: false, clips: [], experimentalVst3Insert: null },
      ],
      tempoMap: [], timeSignatures: [], markers: [],
    }));

    const initial = await getProjectMix({ projectId: 'project-mix', env });
    assert.match(initial.mixRevision, /^[a-f0-9]{64}$/);
    assert.equal(initial.mix.vst3MasterInsert.pluginName, 'Private plugin');
    assert.equal('pluginPath' in initial.mix.vst3MasterInsert, false);

    const updated = await updateProjectMix({
      projectId: 'project-mix', expectedMixRevision: initial.mixRevision, masterGainDb: -3.5,
      tracks: [{ id: 'voice', gainDb: -4, pan: -0.25, mute: true }], env,
    });
    assert.notEqual(updated.mixRevision, initial.mixRevision);
    assert.equal(updated.mix.masterGainDb, -3.5);
    assert.deepEqual(
      (({ gainDb, pan, mute, solo }) => ({ gainDb, pan, mute, solo }))(updated.mix.tracks[0]),
      { gainDb: -4, pan: -0.25, mute: true, solo: false },
    );
    assert.deepEqual(
      (({ gainDb, pan, mute, solo }) => ({ gainDb, pan, mute, solo }))(updated.mix.tracks[1]),
      { gainDb: -2, pan: 0.1, mute: false, solo: false },
    );
    const stored = JSON.parse(await readFile(mixPath, 'utf8'));
    assert.equal(stored.vst3MasterInsert.pluginPath, 'C:/private/plugin.vst3');

    await assert.rejects(updateProjectMix({
      projectId: 'project-mix', expectedMixRevision: initial.mixRevision, tracks: [{ id: 'voice', mute: false }], env,
    }), /Le mix a changé/);
    await assert.rejects(updateProjectMix({
      projectId: 'project-mix', expectedMixRevision: updated.mixRevision, mixId: 'mix-v002',
      masterGainDb: 0, env,
    }), /Seul le mix actif/);
    await assert.rejects(updateProjectMix({
      projectId: 'project-mix', expectedMixRevision: updated.mixRevision,
      tracks: [{ id: 'missing', solo: true }], env,
    }), /Piste introuvable/);
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('MCP project creation and rename follow Song Maker title and stale-write rules', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-write-'));
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(path.join(documentsRoot, 'profiles', 'profile-003'), { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-003', profiles: [{ id: 'profile-003', name: 'Studio', kind: 'hobby' }],
    }));

    const created = await createProject({ title: '  New track  ', env });
    assert.equal(created.profileId, 'profile-003');
    assert.equal(created.project.title, 'New track');
    assert.equal(created.project.schema, 'songmaker.project');
    assert.equal(created.project.schemaVersion, 1);
    assert.equal((await listProjects({ env })).projects[0].title, 'New track');

    await assert.rejects(renameProject({
      projectId: created.project.id, title: 'Invalid/', expectedUpdatedAt: created.project.updatedAt, env,
    }), /Caractère interdit/);
    const renamed = await renameProject({
      projectId: created.project.id, title: '  Renamed  ',
      expectedUpdatedAt: created.project.updatedAt, env,
    });
    assert.equal(renamed.project.title, 'Renamed');
    assert.notEqual(renamed.project.updatedAt, created.project.updatedAt);

    const updated = await updateProject({
      projectId: created.project.id,
      expectedUpdatedAt: renamed.project.updatedAt,
      style: '  Dream pop  ', lyrics: 'A quiet night', cot: 'melody',
      targetDurationSec: 210, tempoBpm: 112,
      key: { tonic: 'Ab', mode: 'minor' }, meter: { numerator: 6, denominator: 8 }, env,
    });
    assert.equal(updated.project.title, 'Renamed');
    assert.equal(updated.project.style, 'Dream pop');
    assert.equal(updated.project.lyrics, 'A quiet night');
    assert.equal(updated.project.cot, 'melody');
    assert.equal(updated.project.targetDurationSec, 210);
    assert.deepEqual(updated.project.key, { tonic: 'Ab', mode: 'minor' });
    await assert.rejects(updateProject({
      projectId: created.project.id, expectedUpdatedAt: updated.project.updatedAt,
      meter: { numerator: 5, denominator: 4 }, env,
    }), /Métrique autorisée/);
    await assert.rejects(renameProject({
      projectId: created.project.id, title: 'Stale write',
      expectedUpdatedAt: renamed.project.updatedAt, env,
    }), /projet a changé/);
    assert.equal((await getProject({ projectId: created.project.id, env })).project.title, 'Renamed');
    assert.equal((await getProject({ projectId: created.project.id, env })).project.style, 'Dream pop');
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('MCP can select only a published generation using the current project revision', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-use-generation-'));
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-use', 'projects', 'project-001');
  const generationFolder = path.join(projectFolder, 'generations', 'gen-001');
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(generationFolder, { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-use', profiles: [{ id: 'profile-use', name: 'Hobby', kind: 'hobby' }],
    }));
    const project = {
      schema: 'songmaker.project', schemaVersion: 1, id: 'project-001', title: 'Restore a take',
      updatedAt: '2026-10-09T00:00:00.000Z', activeGenerationId: 'gen-000',
      activeSeparationId: 'sep-001', activeMixId: 'mix-v001', activeScoreId: 'score-v001',
    };
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify(project));
    await writeFile(path.join(generationFolder, 'request.json'), JSON.stringify({ id: 'gen-001' }));
    const audio = smallPcmWav();
    const sha256 = createHash('sha256').update(audio).digest('hex');
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({
      state: 'generated', audio: { path: 'audio.wav', sha256 },
    }));
    await writeFile(path.join(generationFolder, 'audio.wav'), audio);

    await assert.rejects(useProjectGeneration({
      projectId: project.id, generationId: 'gen-001', expectedUpdatedAt: 'stale', env,
    }), /projet a changé/);
    await assert.rejects(useProjectGeneration({
      projectId: project.id, generationId: 'gen-002', expectedUpdatedAt: project.updatedAt, env,
    }), /introuvable/);
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({
      state: 'generated', audio: { path: 'audio.wav', sha256: '0'.repeat(64) },
    }));
    await assert.rejects(useProjectGeneration({
      projectId: project.id, generationId: 'gen-001', expectedUpdatedAt: project.updatedAt, env,
    }), /changé ou est incomplet/);
    await writeFile(path.join(generationFolder, 'result.json'), JSON.stringify({
      state: 'generated', audio: { path: 'audio.wav', sha256 },
    }));

    const used = await useProjectGeneration({
      projectId: project.id, generationId: 'gen-001', expectedUpdatedAt: project.updatedAt, env,
    });
    assert.equal(used.project.activeGenerationId, 'gen-001');
    assert.equal(used.project.activeSeparationId, null);
    assert.equal(used.project.activeMixId, null);
    assert.equal(used.project.activeScoreId, 'score-v001');
    assert.notEqual(used.project.updatedAt, project.updatedAt);
    assert.equal((await getProject({ projectId: project.id, env })).project.activeGenerationId, 'gen-001');
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});

test('project deletion requires confirmation and the current project revision', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-project-delete-'));
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  try {
    await mkdir(path.join(documentsRoot, 'profiles', 'profile-delete'), { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-delete', profiles: [{ id: 'profile-delete', name: 'Test', kind: 'hobby' }],
    }));
    const created = await createProject({ title: 'Temporary project', env });
    const args = { projectId: created.project.id, expectedUpdatedAt: created.project.updatedAt, env };

    await assert.rejects(deleteProject({ ...args, confirm: false }), /confirm=true/);
    await assert.rejects(deleteProject({ ...args, confirm: true, expectedUpdatedAt: 'old-revision' }), /projet a changé/);
    assert.equal((await getProject({ projectId: created.project.id, env })).project.title, 'Temporary project');

    const result = await deleteProject({ ...args, confirm: true });
    assert.equal(result.deleted, true);
    assert.equal(result.project.id, created.project.id);
    assert.equal((await listProjects({ env })).projects.length, 0);
    await assert.rejects(getProject({ projectId: created.project.id, env }), /Projet introuvable/);
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});
