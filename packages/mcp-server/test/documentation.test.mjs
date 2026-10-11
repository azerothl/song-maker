import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSource = readFileSync(path.join(packageRoot, 'src/server.mjs'), 'utf8');
const readme = readFileSync(path.join(packageRoot, 'README.md'), 'utf8');
const matrix = readFileSync(path.join(packageRoot, '../../docs/mcp-capability-matrix.md'), 'utf8');
const registeredTools = [...serverSource.matchAll(/registerTool\('([^']+)'/g)]
  .map(match => match[1]);
const markdownCode = String.fromCharCode(96);

test('the MCP capability matrix documents every registered tool', () => {
  assert.ok(registeredTools.length > 0);
  for (const name of registeredTools) {
    const rowPrefix = `| ${markdownCode}${name}${markdownCode} |`;
    assert.ok(matrix.split(/\r?\n/).some(line => line.startsWith(rowPrefix)), `${name} is missing from the matrix`);
  }
});

test('the MCP user guide documents every playlist operation', () => {
  for (const name of [
    'list_library',
    'create_playlist',
    'delete_playlist',
    'add_library_track',
    'remove_library_track',
    'add_track_to_playlist',
    'remove_track_from_playlist',
  ]) {
    assert.ok(readme.includes(`${markdownCode}${name}${markdownCode}`), `${name} is missing from the README`);
  }
});

test('the MCP user guide documents importing a completed generation into a project', () => {
  assert.ok(readme.includes(`${markdownCode}import_job_audio_track${markdownCode}`));
  assert.match(readme, /not a new entry in the YuE2 generation history|pas une nouvelle entrée dans l’historique des générations YuE2/);
});
