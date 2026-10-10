import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP exposes the headless tools over stdio', async () => {
  const server = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-mcp-profile-'));
  const projectFolder = path.join(documentsRoot, 'profiles', 'profile-001', 'projects', 'project-001');
  await mkdir(projectFolder, { recursive: true });
  await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
    activeProfileId: 'profile-001', profiles: [{ id: 'profile-001', name: 'Test', kind: 'hobby' }],
  }));
  await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
    id: 'project-001', title: 'Piste de test', createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T01:00:00Z', style: 'Jazz discret', lyrics: 'Couplet local',
    activeGenerationId: 'gen-001', activeMixId: 'mix-001',
  }));
  const client = new Client({ name: 'song-maker-test', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [server],
    env: { ...process.env, SONG_MAKER_WORKSPACE_ROOT: process.cwd(),
      SONG_MAKER_DOCUMENTS_DIR: documentsRoot } });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(),
      ['cancel_job', 'get_project', 'gpu_status', 'job_status', 'list_projects',
        'resume_job', 'runtime_status', 'start_batch', 'start_song']);
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
    const invalid = await client.callTool({ name: 'get_project', arguments: { projectId: '../outside' } });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    await rm(documentsRoot, { recursive: true, force: true });
  }
});
