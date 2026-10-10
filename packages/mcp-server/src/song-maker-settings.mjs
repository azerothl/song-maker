import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { YUE2_MODELS } from './yue2-assets.mjs';

const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const MODEL_FILES = new Map([
  ...YUE2_MODELS.flatMap(model => [[model.id, model.file], [model.file, model.file]]),
]);

function documentsCandidates(env) {
  if (env.SONG_MAKER_DOCUMENTS_DIR?.trim()) {
    return [path.resolve(env.SONG_MAKER_DOCUMENTS_DIR.trim())];
  }

  const home = os.homedir();
  const windowsHome = env.USERPROFILE || home;
  const documents = process.platform === 'win32'
    ? [
        path.join(windowsHome, 'Documents'),
        env.OneDrive ? path.join(env.OneDrive, 'Documents') : null,
        env.OneDriveConsumer ? path.join(env.OneDriveConsumer, 'Documents') : null,
        env.OneDriveCommercial ? path.join(env.OneDriveCommercial, 'Documents') : null,
        path.join(home, 'Documents'),
      ]
    : [env.XDG_DOCUMENTS_DIR, path.join(home, 'Documents')];

  return [...new Set(documents.filter(Boolean).map(directory =>
    path.join(path.resolve(directory), 'Song Maker'),
  ))];
}

function songMakerDocumentsDirectory(env) {
  const candidates = documentsCandidates(env);
  return candidates.find(directory =>
    existsSync(path.join(directory, 'profiles.json')) ||
    existsSync(path.join(directory, 'projects')),
  ) || candidates[0];
}

function readObject(filePath, label) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw new Error(`Lecture des réglages Song Maker (${label}) impossible.`);
  }
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    throw new Error(`Les réglages Song Maker (${label}) sont invalides.`);
  }
}

function defaultCacheDirectory(env) {
  if (process.platform === 'win32') {
    return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'song-maker');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'song-maker');
  }
  return path.join(env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'song-maker');
}

function modelIdFromValue(value) {
  if (typeof value !== 'string') return null;
  return MODEL_FILES.get(path.basename(value).toLowerCase()) === MODEL_FILES.get('q4')
    ? 'q4'
    : MODEL_FILES.get(path.basename(value).toLowerCase()) === MODEL_FILES.get('q8')
      ? 'q8'
      : null;
}

export function readSongMakerRuntimeSettings(env = process.env) {
  const documentsDirectory = songMakerDocumentsDirectory(env);
  const globalSettings = readObject(path.join(documentsDirectory, 'settings.json'), 'généraux');
  const manifest = readObject(path.join(documentsDirectory, 'profiles.json'), 'profils');
  const profileId = manifest.activeProfileId ?? null;
  if (profileId !== null && (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId))) {
    throw new Error('Le profil actif de Song Maker est invalide.');
  }
  const profileDirectory = profileId
    ? path.join(documentsDirectory, 'profiles', profileId)
    : null;
  const profileSettings = profileDirectory
    ? readObject(path.join(profileDirectory, 'profile-settings.json'), 'du profil actif')
    : globalSettings;

  const configuredAppModelId = modelIdFromValue(globalSettings.modelGguf) ||
    modelIdFromValue(globalSettings.modelPack);
  const appModelId = configuredAppModelId || 'q4';
  const explicitModel = typeof env.SONG_MAKER_MODEL === 'string'
    ? env.SONG_MAKER_MODEL.trim().toLowerCase()
    : '';
  const requestedModelId = explicitModel
    ? (MODEL_FILES.has(explicitModel) ? modelIdFromValue(explicitModel) : null)
    : appModelId;
  const cacheOverride = typeof env.SONG_MAKER_CACHE === 'string'
    ? env.SONG_MAKER_CACHE.trim()
    : '';
  const configuredCache = typeof globalSettings.cacheDir === 'string'
    ? globalSettings.cacheDir.trim()
    : '';

  return {
    documentsDirectory,
    profileId,
    profileDirectory,
    globalSettings,
    profileSettings,
    cacheDirectory: path.resolve(cacheOverride || configuredCache || defaultCacheDirectory(env)),
    appModelId,
    modelId: requestedModelId,
    modelFile: requestedModelId ? MODEL_FILES.get(requestedModelId) : null,
    modelSource: explicitModel ? 'environment' : configuredAppModelId ? 'song-maker-settings' : 'default',
    selectedEngine: typeof profileSettings.generationEngine === 'string'
      ? profileSettings.generationEngine
      : 'yue2',
    localYue2Enabled: profileSettings.localYue2Enabled !== false,
    yue2LicenseAccepted: profileSettings.yue2LicenseAccepted === true,
  };
}
