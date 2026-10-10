import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProject, deleteProject, getProject, listProjectVersions, listProjects, renameProject, updateProject } from '../src/projects.mjs';

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
