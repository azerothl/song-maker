import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('MCP exposes the headless tools over stdio', async () => {
  const server = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
  const client = new Client({ name: 'song-maker-test', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [server],
    env: { ...process.env, SONG_MAKER_WORKSPACE_ROOT: process.cwd() } });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(tool => tool.name).sort(),
      ['gpu_status', 'job_status', 'resume_job', 'runtime_status', 'start_batch', 'start_song']);
    const status = await client.callTool({ name: 'runtime_status', arguments: {} });
    assert.equal(status.isError, undefined);
    assert.equal(typeof JSON.parse(status.content[0].text).ready, 'boolean');
  } finally {
    await client.close();
  }
});
