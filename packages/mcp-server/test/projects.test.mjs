import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { getProject, listProjects } from '../src/projects.mjs';

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
