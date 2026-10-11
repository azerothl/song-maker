import { randomUUID } from 'node:crypto';
import { open, lstat, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { listLocalResources } from './resources.mjs';
import { generationSettingsRevision, readSongMakerRuntimeSettings } from './song-maker-settings.mjs';
import { YUE2_MODELS } from './yue2-assets.mjs';

const SETTINGS_FILE = 'settings.json';
const PROFILE_SETTINGS_FILE = 'profile-settings.json';
const LOCK_FILE = '.mcp-generation-settings.lock';
const MODEL_BY_ID = new Map(YUE2_MODELS.map(model => [model.id, model]));

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function parseObject(text, label) {
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`Les réglages ${label} sont invalides.`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Les réglages ${label} sont invalides.`);
  }
  return value;
}

async function readSettingsFile(filePath, documentsDirectory, label) {
  let stat;
  try { stat = await lstat(filePath); }
  catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Le fichier ${label} est absent. Ouvre Song Maker puis réessaie.`);
    throw new Error(`Lecture du fichier ${label} impossible.`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Le fichier ${label} doit être un fichier local.`);
  const [root, canonicalFile] = await Promise.all([realpath(documentsDirectory), realpath(filePath)]);
  if (!isWithin(root, canonicalFile)) throw new Error(`Le fichier ${label} se trouve hors du dossier Song Maker.`);
  const text = await readFile(canonicalFile, 'utf8');
  return { text, value: parseObject(text, label), canonicalPath: canonicalFile };
}

async function readActivationState(env) {
  const settings = readSongMakerRuntimeSettings(env);
  if (!settings.profileId || !settings.profileDirectory) {
    throw new Error('Sélectionne un profil dans Song Maker avant d’activer ses réglages via MCP.');
  }
  let documentsDirectory;
  try { documentsDirectory = await realpath(path.resolve(settings.documentsDirectory)); }
  catch { throw new Error('Le dossier de données Song Maker est inaccessible.'); }
  const globalPath = path.join(documentsDirectory, SETTINGS_FILE);
  const profilePath = path.join(documentsDirectory, 'profiles', settings.profileId, PROFILE_SETTINGS_FILE);
  const [globalFile, profileFile] = await Promise.all([
    readSettingsFile(globalPath, documentsDirectory, 'généraux'),
    readSettingsFile(profilePath, documentsDirectory, 'du profil actif'),
  ]);
  return {
    settings: {
      ...settings,
      globalSettings: globalFile.value,
      profileSettings: profileFile.value,
    },
    documentsDirectory,
    globalPath: globalFile.canonicalPath,
    profilePath: profileFile.canonicalPath,
    globalText: globalFile.text,
    profileText: profileFile.text,
  };
}

function pidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code !== 'ESRCH'; }
}

async function acquireSettingsLock(lockPath) {
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }), 'utf8');
        await handle.sync();
      } catch (error) {
        await handle.close().catch(() => {});
        await unlink(lockPath).catch(() => {});
        throw error;
      }
      return { handle, token };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new Error(`Verrouillage des réglages impossible : ${error?.message || error}`);
      let owner;
      try {
        const stat = await lstat(lockPath);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Le verrou des réglages est invalide.');
        owner = JSON.parse(await readFile(lockPath, 'utf8'));
      } catch (readError) {
        if (readError?.code === 'ENOENT') continue;
        throw new Error('Le verrou des réglages est illisible ; ne le supprime pas pendant une opération MCP.');
      }
      if (!Number.isInteger(owner?.pid) || typeof owner.token !== 'string') {
        throw new Error('Le verrou des réglages est illisible ; ne le supprime pas pendant une opération MCP.');
      }
      if (pidIsAlive(owner.pid)) throw new Error('Une autre opération MCP modifie déjà les réglages Song Maker.');
      throw new Error('Un verrou MCP orphelin bloque les réglages. Vérifie que tous les clients MCP Song Maker sont fermés, puis supprime le fichier .mcp-generation-settings.lock dans Documents/Song Maker avant de réessayer.');
    }
  }
  throw new Error('Un ancien verrou MCP empêche encore la modification. Vérifie que les clients MCP sont fermés puis réessaie.');
}

async function writeTemporaryJson(targetPath, value) {
  const temporaryPath = path.join(path.dirname(targetPath), `.mcp-settings-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
  await handle.close();
  return temporaryPath;
}

async function restoreOriginal(targetPath, originalText) {
  if (originalText === null) {
    await unlink(targetPath).catch(error => { if (error?.code !== 'ENOENT') throw error; });
    return;
  }
  const temporaryPath = path.join(path.dirname(targetPath), `.mcp-settings-rollback-${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(originalText, 'utf8');
    await handle.sync();
  } finally {
    await handle.close().catch(() => {});
  }
  try { await rename(temporaryPath, targetPath); }
  finally { await unlink(temporaryPath).catch(() => {}); }
}

async function commitSettingsWrites(writes) {
  const temporaries = [];
  const committed = [];
  try {
    for (const write of writes) {
      const temporaryPath = await writeTemporaryJson(write.path, write.value);
      temporaries.push(temporaryPath);
      write.temporaryPath = temporaryPath;
    }
    for (const write of writes) {
      await rename(write.temporaryPath, write.path);
      committed.push(write);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const write of committed.reverse()) {
      try { await restoreOriginal(write.path, write.originalText); }
      catch (rollbackError) { rollbackErrors.push(rollbackError); }
    }
    const rollbackStatus = rollbackErrors.length === 0
      ? 'Les fichiers déjà modifiés ont été restaurés.'
      : `La restauration est incomplète (${rollbackErrors.map(item => item?.message || item).join('; ')}).`;
    throw new Error(`Écriture des réglages interrompue. ${rollbackStatus} ${error?.message || error}`);
  } finally {
    await Promise.all(temporaries.map(file => unlink(file).catch(() => {})));
  }
}

function assertActivationAvailable(engineId, modelId, inventory) {
  if (engineId === 'yue2') {
    if (!MODEL_BY_ID.has(modelId)) throw new Error('Choisis explicitement le modèle YuE2 Q4 ou Q8.');
    if (inventory.localYue2Enabled !== true) throw new Error('Active YuE2 dans le profil Song Maker avant de le sélectionner via MCP.');
    if (inventory.licenses?.yue2Accepted !== true) throw new Error('Lis et accepte la licence YuE2 dans Song Maker avant de sélectionner ce moteur.');
    const engine = inventory.engines.find(item => item.id === 'yue2');
    const model = engine?.models.find(item => item.id === modelId);
    if (!model?.installed) throw new Error(`Le modèle YuE2 ${modelId.toUpperCase()} et ses composants doivent être installés avant activation.`);
    return;
  }
  if (engineId === 'ace_step') {
    if (modelId !== undefined) throw new Error('ACE-Step utilise son modèle Turbo installé ; modelId ne s’applique qu’à YuE2.');
    const engine = inventory.engines.find(item => item.id === 'ace_step');
    if (!engine?.licenseAccepted) throw new Error('Lis et accepte la licence ACE-Step dans Song Maker avant de sélectionner ce moteur.');
    if (!engine?.installed) throw new Error('Installe ACE-Step 1.5 Turbo depuis les paramètres Song Maker avant de sélectionner ce moteur.');
    return;
  }
  throw new Error('Moteur global indisponible via MCP. Choisis YuE2 ou ACE-Step. ACE-Step Lego reste un outil d’ajout de piste, pas un moteur global.');
}

export async function activateGenerationSettings({
  engineId,
  modelId,
  expectedSettingsRevision,
  confirmAppClosed,
  env = process.env,
  getResourceInventory = listLocalResources,
} = {}) {
  if (confirmAppClosed !== true) throw new Error('Ferme Song Maker puis confirme confirmAppClosed=true avant de modifier ses réglages globaux.');
  if (!/^[0-9a-f]{64}$/.test(expectedSettingsRevision || '')) {
    throw new Error('expectedSettingsRevision doit venir de list_local_resources.settingsRevision.');
  }
  const initial = await readActivationState(env);
  if (generationSettingsRevision(initial.settings) !== expectedSettingsRevision) {
    throw new Error('Les réglages Song Maker ont changé. Relis list_local_resources avant de réessayer.');
  }
  const lockPath = path.join(initial.documentsDirectory, LOCK_FILE);
  const lock = await acquireSettingsLock(lockPath);
  try {
    const current = await readActivationState(env);
    if (current.settings.profileId !== initial.settings.profileId ||
        generationSettingsRevision(current.settings) !== expectedSettingsRevision) {
      throw new Error('Le profil ou ses réglages ont changé. Relis list_local_resources avant de réessayer.');
    }
    const inventory = await getResourceInventory({ env });
    if (inventory.profileId !== current.settings.profileId) {
      throw new Error('Le profil actif a changé pendant la lecture des ressources. Relis list_local_resources avant de réessayer.');
    }
    assertActivationAvailable(engineId, modelId, inventory);

    const previous = {
      engineId: current.settings.selectedEngine,
      modelId: current.settings.appModelId,
    };
    const profileSettings = { ...current.settings.profileSettings, generationEngine: engineId };
    const globalSettings = { ...current.settings.globalSettings };
    if (engineId === 'yue2') {
      const model = MODEL_BY_ID.get(modelId);
      globalSettings.modelPack = model.id;
      globalSettings.modelGguf = model.file;
      globalSettings.modelSha256 = model.sha256;
    }

    const unchanged = JSON.stringify(profileSettings) === JSON.stringify(current.settings.profileSettings) &&
      JSON.stringify(globalSettings) === JSON.stringify(current.settings.globalSettings);
    if (unchanged) {
      return {
        profileId: current.settings.profileId,
        previous,
        selected: { engineId, modelId: engineId === 'yue2' ? modelId : null },
        settingsRevision: expectedSettingsRevision,
        changed: false,
        restartRequired: false,
        resourceInstallationViaMcp: 'unavailable',
      };
    }

    const beforeCommit = await readActivationState(env);
    if (beforeCommit.settings.profileId !== current.settings.profileId ||
        generationSettingsRevision(beforeCommit.settings) !== expectedSettingsRevision) {
      throw new Error('Les réglages Song Maker ont changé pendant la préparation. Relis list_local_resources avant de réessayer.');
    }
    await commitSettingsWrites([
      { path: current.profilePath, value: profileSettings, originalText: current.profileText },
      { path: current.globalPath, value: globalSettings, originalText: current.globalText },
    ]);

    const verified = await readActivationState(env);
    const actualModel = verified.settings.appModelId;
    if (verified.settings.profileId !== current.settings.profileId || verified.settings.selectedEngine !== engineId ||
        (engineId === 'yue2' && actualModel !== modelId)) {
      try {
        await commitSettingsWrites([
          { path: current.profilePath, value: current.settings.profileSettings, originalText: current.profileText },
          { path: current.globalPath, value: current.settings.globalSettings, originalText: current.globalText },
        ]);
      } catch (rollbackError) {
        throw new Error(`La relecture des réglages activés a échoué et leur restauration est incomplète : ${rollbackError?.message || rollbackError}`);
      }
      throw new Error('La relecture des réglages activés a échoué ; les valeurs précédentes ont été restaurées.');
    }
    return {
      profileId: verified.settings.profileId,
      previous,
      selected: { engineId, modelId: engineId === 'yue2' ? modelId : null },
      settingsRevision: generationSettingsRevision(verified.settings),
      changed: true,
      restartRequired: true,
      resourceInstallationViaMcp: 'unavailable',
    };
  } finally {
    await lock.handle.close().catch(() => {});
    try {
      const owner = JSON.parse(await readFile(lockPath, 'utf8'));
      if (owner.token === lock.token) await unlink(lockPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw new Error('Impossible de libérer le verrou des réglages MCP.');
    }
  }
}
