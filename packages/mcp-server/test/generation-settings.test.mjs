import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { activateGenerationSettings } from '../src/generation-settings.mjs';
import { generationSettingsRevision, readSongMakerRuntimeSettings } from '../src/song-maker-settings.mjs';

async function createProfile(t) {
  const documentsDirectory = await mkdtemp(path.join(os.tmpdir(), 'song-maker-settings-'));
  const profileDirectory = path.join(documentsDirectory, 'profiles', 'profile-activation');
  await mkdir(profileDirectory, { recursive: true });
  const globalSettings = {
    cacheDir: path.join(documentsDirectory, 'cache'),
    modelPack: 'q4',
    modelGguf: 'yue2-3b-q4_0.gguf',
    keepGlobalValue: 'preserved',
  };
  const profileSettings = {
    generationEngine: 'yue2',
    localYue2Enabled: true,
    yue2LicenseAccepted: true,
    keepProfileValue: 'preserved',
  };
  await Promise.all([
    writeFile(path.join(documentsDirectory, 'profiles.json'), JSON.stringify({
      activeProfileId: 'profile-activation',
      profiles: [{ id: 'profile-activation', name: 'Test', kind: 'hobby' }],
    })),
    writeFile(path.join(documentsDirectory, 'settings.json'), JSON.stringify(globalSettings)),
    writeFile(path.join(profileDirectory, 'profile-settings.json'), JSON.stringify(profileSettings)),
  ]);
  t.after(() => rm(documentsDirectory, { recursive: true, force: true }));
  const env = { ...process.env, SONG_MAKER_DOCUMENTS_DIR: documentsDirectory };
  const settingsRevision = generationSettingsRevision(readSongMakerRuntimeSettings(env));
  return { documentsDirectory, profileDirectory, globalSettings, profileSettings, env, settingsRevision };
}

function inventory(profileId, { q4 = false, q8 = false, aceStepInstalled = false, aceStepLicensed = false,
  yue2Enabled = true, yue2Licensed = true } = {}) {
  return {
    profileId,
    localYue2Enabled: yue2Enabled,
    licenses: { yue2Accepted: yue2Licensed },
    engines: [
      { id: 'yue2', models: [{ id: 'q4', installed: q4 }, { id: 'q8', installed: q8 }] },
      { id: 'ace_step', installed: aceStepInstalled, licenseAccepted: aceStepLicensed },
    ],
  };
}

test('activation requires a closed app confirmation and the current settings revision', async t => {
  const fixture = await createProfile(t);
  const getResourceInventory = async () => inventory('profile-activation', { q4: true });

  await assert.rejects(activateGenerationSettings({
    engineId: 'yue2', modelId: 'q4', expectedSettingsRevision: fixture.settingsRevision,
    confirmAppClosed: false, env: fixture.env, getResourceInventory,
  }), /Ferme Song Maker/);
  await assert.rejects(activateGenerationSettings({
    engineId: 'yue2', modelId: 'q4', expectedSettingsRevision: '0'.repeat(64),
    confirmAppClosed: true, env: fixture.env, getResourceInventory,
  }), /ont changé/);
  assert.equal(await readFile(path.join(fixture.documentsDirectory, 'settings.json'), 'utf8'), JSON.stringify(fixture.globalSettings));
});

test('activation selects an installed YuE2 model and persists the pinned model identity', async t => {
  const fixture = await createProfile(t);
  const result = await activateGenerationSettings({
    engineId: 'yue2', modelId: 'q8', expectedSettingsRevision: fixture.settingsRevision,
    confirmAppClosed: true, env: fixture.env,
    getResourceInventory: async () => inventory('profile-activation', { q8: true }),
  });
  const globalSettings = JSON.parse(await readFile(path.join(fixture.documentsDirectory, 'settings.json'), 'utf8'));
  const profileSettings = JSON.parse(await readFile(path.join(fixture.profileDirectory, 'profile-settings.json'), 'utf8'));

  assert.equal(result.changed, true);
  assert.equal(result.restartRequired, true);
  assert.deepEqual(result.selected, { engineId: 'yue2', modelId: 'q8' });
  assert.match(result.settingsRevision, /^[a-f0-9]{64}$/);
  assert.equal(globalSettings.modelPack, 'q8');
  assert.equal(globalSettings.modelGguf, 'yue2-3b-q8_0.gguf');
  assert.equal(globalSettings.modelSha256, 'f3a9e3b197bfd05aa4ae6ab2d4b93f6d57c8cc0ea39a4af7d151f58697c7cfb6');
  assert.equal(globalSettings.keepGlobalValue, 'preserved');
  assert.equal(profileSettings.generationEngine, 'yue2');
  assert.equal(profileSettings.keepProfileValue, 'preserved');
  await assert.rejects(readFile(path.join(fixture.documentsDirectory, '.mcp-generation-settings.lock')), { code: 'ENOENT' });
});

test('activation refuses missing models, ACE-Step weights, or ACE-Step consent', async t => {
  const fixture = await createProfile(t);
  await assert.rejects(activateGenerationSettings({
    engineId: 'yue2', modelId: 'q8', expectedSettingsRevision: fixture.settingsRevision,
    confirmAppClosed: true, env: fixture.env,
    getResourceInventory: async () => inventory('profile-activation'),
  }), /doivent être installés/);
  await assert.rejects(activateGenerationSettings({
    engineId: 'ace_step', expectedSettingsRevision: fixture.settingsRevision,
    confirmAppClosed: true, env: fixture.env,
    getResourceInventory: async () => inventory('profile-activation', { aceStepInstalled: true }),
  }), /accepte la licence/);
  await assert.rejects(activateGenerationSettings({
    engineId: 'ace_step', expectedSettingsRevision: fixture.settingsRevision,
    confirmAppClosed: true, env: fixture.env,
    getResourceInventory: async () => inventory('profile-activation', { aceStepLicensed: true }),
  }), /Installe ACE-Step/);
});

test('activation selects installed ACE-Step for the app without changing YuE2 model settings', async t => {
  const fixture = await createProfile(t);
  const result = await activateGenerationSettings({
    engineId: 'ace_step', expectedSettingsRevision: fixture.settingsRevision,
    confirmAppClosed: true, env: fixture.env,
    getResourceInventory: async () => inventory('profile-activation', { aceStepInstalled: true, aceStepLicensed: true }),
  });
  const globalSettings = JSON.parse(await readFile(path.join(fixture.documentsDirectory, 'settings.json'), 'utf8'));
  const profileSettings = JSON.parse(await readFile(path.join(fixture.profileDirectory, 'profile-settings.json'), 'utf8'));

  assert.deepEqual(result.selected, { engineId: 'ace_step', modelId: null });
  assert.equal(result.restartRequired, true);
  assert.deepEqual(globalSettings, fixture.globalSettings);
  assert.equal(profileSettings.generationEngine, 'ace_step');
  assert.equal(profileSettings.keepProfileValue, 'preserved');
});
