import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listLocalResources } from '../src/resources.mjs';

test('local resource inventory reads the active profile, reports incomplete packs, and hides paths', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-resource-docs-'));
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-resource-cache-'));
  try {
    await mkdir(path.join(documentsRoot, 'profiles', 'profile-003'), { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-003', profiles: [{ id: 'profile-003', name: 'Test', kind: 'hobby' }],
    }));
    await writeFile(path.join(documentsRoot, 'settings.json'), JSON.stringify({
      cacheDir: cacheRoot, modelPack: 'q4', modelGguf: 'yue2-3b-q4_0.gguf',
    }));
    await writeFile(path.join(documentsRoot, 'profiles', 'profile-003', 'profile-settings.json'), JSON.stringify({
      generationEngine: 'ace_step', stemSeparator: 'bs_roformer', localYue2Enabled: true,
      yue2LicenseAccepted: true, aceStepLicenseAccepted: false,
      acceptedSeparatorLicenses: { bs_roformer: true },
    }));
    const partialModel = path.join(cacheRoot, 'models', 'Yue2-3B-GGUF');
    await mkdir(partialModel, { recursive: true });
    await writeFile(path.join(partialModel, 'yue2-3b-q4_0.gguf'), 'partial');

    const inventory = await listLocalResources({ env: { SONG_MAKER_DOCUMENTS_DIR: documentsRoot } });
    assert.equal(inventory.profileId, 'profile-003');
    assert.equal(inventory.selectedEngine, 'ace_step');
    assert.equal(inventory.selectedYuE2Model, 'q4');
    assert.equal(inventory.engines[0].models[0].selected, true);
    assert.equal(inventory.engines[0].models[0].installed, false);
    assert.ok(inventory.engines[0].models[0].missingComponents.includes('yue2-3b-q4_0.gguf'));
    assert.ok(inventory.engines[0].models[0].missingComponents.includes('sidecar:yue2-model-config.json'));
    assert.equal(inventory.engines[1].selected, true);
    assert.equal(inventory.engines[1].mcpGenerationSupported, false);
    assert.equal(inventory.mcpGenerationEngine, 'yue2');
    assert.equal(inventory.mcpUsesActiveAppProfile, false);
    assert.equal(inventory.separators.find(item => item.id === 'bs_roformer').licenseAccepted, true);
    assert.equal(inventory.selectionAndInstallationViaMcp, 'unavailable');
    const serialized = JSON.stringify(inventory);
    assert.equal(serialized.includes(documentsRoot), false);
    assert.equal(serialized.includes(cacheRoot), false);
  } finally {
    await Promise.all([
      rm(documentsRoot, { recursive: true, force: true }),
      rm(cacheRoot, { recursive: true, force: true }),
    ]);
  }
});
