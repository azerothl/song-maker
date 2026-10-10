import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { activeProfileContext } from './projects.mjs';

const YUE2_MODELS = [
  { id: 'q4', file: 'yue2-3b-q4_0.gguf', bytes: 2_665_632_320 },
  { id: 'q8', file: 'yue2-3b-q8_0.gguf', bytes: 4_264_186_432 },
];
const YUE2_COMMON = [
  { id: 'vae', file: 'yue2-vae-f16.gguf', bytes: 265_218_656 },
  { id: 'sidecar:yue2-model-config.json', file: 'sidecars/yue2-model-config.json', bytes: 959 },
  { id: 'sidecar:yue2-generation-config.json', file: 'sidecars/yue2-generation-config.json', bytes: 466 },
  { id: 'sidecar:yue2-qwen.tiktoken', file: 'sidecars/yue2-qwen.tiktoken', bytes: 2_561_218 },
  { id: 'sidecar:yue2-vae-config.json', file: 'sidecars/yue2-vae-config.json', bytes: 1_378 },
];
const SEPARATORS = [
  { id: 'htdemucs', file: 'htdemucs/htdemucs-q8_0.gguf', bytes: 61_940_768 },
  { id: 'bs_roformer', file: 'bs_roformer/bs-roformer-ep368-q8_0.gguf', bytes: 172_532_256 },
  { id: 'mel_band_roformer', file: 'mel_band_roformer/mel-band-roformer-q8_0.gguf', bytes: 251_748_928 },
];
const ACE_STEP = {
  id: 'ace_step',
  file: 'models/ACE-Step1.5-GGUF/turbo/ace-step-1.5-turbo-bf16.gguf',
  bytes: 10_090_398_272,
};

function defaultCacheDirectory(env) {
  if (process.platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'song-maker');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'song-maker');
  }
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'song-maker');
}

async function readSettings(filePath, label) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw new Error(`Lecture des réglages ${label} impossible.`);
  }
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error(`Les réglages ${label} sont invalides.`);
  }
}

async function exactFile(cacheDirectory, relativePath, expectedBytes) {
  try {
    const metadata = await stat(path.join(cacheDirectory, 'models', relativePath));
    return metadata.isFile() && metadata.size === expectedBytes;
  } catch {
    return false;
  }
}

async function inspectModel(cacheDirectory, model) {
  const checks = await Promise.all([
    exactFile(cacheDirectory, `Yue2-3B-GGUF/${model.file}`, model.bytes),
    ...YUE2_COMMON.map(item => exactFile(cacheDirectory, `Yue2-3B-GGUF/${item.file}`, item.bytes)),
  ]);
  const commonMissing = YUE2_COMMON.filter((_item, index) => !checks[index + 1]).map(item => item.id);
  return {
    id: model.id,
    file: model.file,
    installed: checks.every(Boolean),
    missingComponents: [
      ...(checks[0] ? [] : [model.file]),
      ...commonMissing,
    ],
  };
}

export async function listLocalResources({ env = process.env } = {}) {
  const context = await activeProfileContext(env);
  const globalSettings = await readSettings(path.join(context.documentsDirectory, 'settings.json'), 'globaux');
  const profileSettingsPath = path.join(context.profileDirectory, 'profile-settings.json');
  const profileSettings = context.profileId
    ? await readSettings(profileSettingsPath, 'du profil actif')
    : globalSettings;
  const configuredCache = typeof globalSettings.cacheDir === 'string' ? globalSettings.cacheDir.trim() : '';
  const cacheDirectory = configuredCache ? path.resolve(configuredCache) : defaultCacheDirectory(env);

  const configuredModel = typeof globalSettings.modelGguf === 'string' ? globalSettings.modelGguf : '';
  const configuredPack = typeof globalSettings.modelPack === 'string' ? globalSettings.modelPack.toLowerCase() : '';
  const selectedYuE2Model = configuredModel === YUE2_MODELS[0].file ? 'q4'
    : configuredModel === YUE2_MODELS[1].file ? 'q8'
      : (!configuredModel && ['q4', 'q8'].includes(configuredPack) ? configuredPack : null);
  const yue2Models = await Promise.all(YUE2_MODELS.map(model => inspectModel(cacheDirectory, model)));
  const selectedSeparator = typeof profileSettings.stemSeparator === 'string' ? profileSettings.stemSeparator : 'htdemucs';
  const separators = await Promise.all(SEPARATORS.map(async separator => ({
    id: separator.id,
    selected: selectedSeparator === separator.id,
    installed: await exactFile(cacheDirectory, separator.file, separator.bytes),
    licenseAccepted: profileSettings.acceptedSeparatorLicenses?.[separator.id] === true,
  })));
  const aceStepInstalled = await exactFile(cacheDirectory, ACE_STEP.file.replace(/^models\//, ''), ACE_STEP.bytes);
  const selectedEngine = typeof profileSettings.generationEngine === 'string'
    ? profileSettings.generationEngine
    : 'yue2';

  return {
    profileId: context.profileId,
    selectedEngine,
    localYue2Enabled: profileSettings.localYue2Enabled !== false,
    selectedYuE2Model,
    selectedSeparator,
    licenses: {
      yue2Accepted: profileSettings.yue2LicenseAccepted === true,
      aceStepAccepted: profileSettings.aceStepLicenseAccepted === true,
      aceStepLegoAccepted: profileSettings.aceStepLegoLicenseAccepted === true,
      ccByNcAccepted: profileSettings.ccByNcAccepted === true,
    },
    mcpGenerationEngine: 'yue2',
    mcpUsesActiveAppProfile: false,
    engines: [
      {
        id: 'yue2',
        selected: selectedEngine === 'yue2',
        mcpGenerationSupported: true,
        models: yue2Models.map(model => ({ ...model, selected: model.id === selectedYuE2Model })),
      },
      {
        id: ACE_STEP.id,
        selected: selectedEngine === ACE_STEP.id,
        installed: aceStepInstalled,
        licenseAccepted: profileSettings.aceStepLicenseAccepted === true,
        mcpGenerationSupported: false,
      },
    ],
    separators,
    selectionAndInstallationViaMcp: 'unavailable',
  };
}
