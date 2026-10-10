import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

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

  return [...new Set(documents.filter(Boolean).map((directory) =>
    path.join(path.resolve(directory), 'Song Maker'),
  ))];
}

function hasSongMakerData(directory) {
  return existsSync(path.join(directory, 'profiles.json')) ||
    existsSync(path.join(directory, 'projects'));
}

function documentsRoot(env = process.env) {
  const candidates = documentsCandidates(env);
  return candidates.find(hasSongMakerData) || candidates[0];
}

async function readJson(filePath, label) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Lecture ${label} impossible : ${error?.message || error}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} est invalide : ${error?.message || error}`);
  }
}

async function projectStore(env = process.env) {
  const directory = documentsRoot(env);
  const manifest = await readJson(path.join(directory, 'profiles.json'), 'profiles.json');
  const profileId = manifest?.activeProfileId ?? null;
  if (profileId !== null && (typeof profileId !== 'string' || !PROFILE_ID_PATTERN.test(profileId))) {
    throw new Error('Le profil actif de Song Maker est invalide.');
  }
  return {
    profileId,
    root: profileId
      ? path.join(directory, 'profiles', profileId, 'projects')
      : path.join(directory, 'projects'),
  };
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function readProjectAt(root, id, { missingAsError = true } = {}) {
  if (!PROJECT_ID_PATTERN.test(id)) throw new Error('Identifiant de projet invalide.');
  let canonicalRoot;
  try {
    canonicalRoot = await realpath(root);
  } catch (error) {
    if (error?.code === 'ENOENT' && !missingAsError) return null;
    if (error?.code === 'ENOENT') throw new Error(`Projet introuvable : ${id}`);
    throw new Error(`Accès aux projets Song Maker impossible : ${error?.message || error}`);
  }

  const folder = path.join(root, id);
  let canonicalFolder;
  try {
    canonicalFolder = await realpath(folder);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (missingAsError) throw new Error(`Projet introuvable : ${id}`);
      return null;
    }
    throw new Error(`Lecture du projet impossible : ${error?.message || error}`);
  }
  if (!isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet se trouve hors du profil Song Maker actif.');
  }

  const file = path.join(canonicalFolder, 'project.json');
  let canonicalFile;
  try {
    canonicalFile = await realpath(file);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      if (missingAsError) throw new Error(`Fiche du projet introuvable : ${id}`);
      return null;
    }
    throw new Error(`Lecture du projet impossible : ${error?.message || error}`);
  }
  if (!isWithin(canonicalFolder, canonicalFile)) {
    throw new Error('La fiche projet se trouve hors de son dossier Song Maker.');
  }

  const project = await readJson(canonicalFile, 'project.json');
  if (!project || project.id !== id || typeof project.title !== 'string') {
    if (missingAsError) throw new Error(`Fiche de projet Song Maker invalide : ${id}`);
    return null;
  }
  return project;
}

export async function listProjects({ query, env = process.env } = {}) {
  const store = await projectStore(env);
  let entries;
  try {
    entries = await readdir(store.root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { profileId: store.profileId, projects: [], skippedInvalid: 0 };
    }
    throw new Error(`Liste des projets Song Maker impossible : ${error?.message || error}`);
  }

  const needle = query?.trim().toLocaleLowerCase();
  const projects = [];
  let skippedInvalid = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !PROJECT_ID_PATTERN.test(entry.name)) continue;
    let project;
    try {
      project = await readProjectAt(store.root, entry.name, { missingAsError: false });
    } catch {
      project = null;
    }
    if (!project) {
      skippedInvalid += 1;
      continue;
    }
    if (needle && !project.title.toLocaleLowerCase().includes(needle)) continue;
    projects.push({
      id: project.id,
      title: project.title,
      createdAt: project.createdAt ?? null,
      updatedAt: project.updatedAt ?? null,
      activeGenerationId: project.activeGenerationId ?? null,
      activeSeparationId: project.activeSeparationId ?? null,
      activeMixId: project.activeMixId ?? null,
      activeScoreId: project.activeScoreId ?? null,
    });
  }
  projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return { profileId: store.profileId, projects, skippedInvalid };
}

export async function getProject({ projectId, env = process.env } = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  return {
    profileId: store.profileId,
    project: {
      id: project.id,
      title: project.title,
      createdAt: project.createdAt ?? null,
      updatedAt: project.updatedAt ?? null,
      style: project.style ?? '',
      lyrics: project.lyrics ?? '',
      cot: project.cot ?? null,
      targetDurationSec: project.targetDurationSec ?? null,
      instrumentalMode: project.instrumentalMode ?? false,
      tempoBpm: project.tempoBpm ?? null,
      key: project.key ?? null,
      meter: project.meter ?? null,
      activeGenerationId: project.activeGenerationId ?? null,
      activeSeparationId: project.activeSeparationId ?? null,
      activeMixId: project.activeMixId ?? null,
      activeScoreId: project.activeScoreId ?? null,
      generationNames: project.generationNames ?? {},
    },
  };
}

function validateTitle(title) {
  if (typeof title !== 'string') throw new Error('Le titre est obligatoire (1 à 120 caractères).');
  const value = title.trim();
  if (!value || [...value].length > 120) {
    throw new Error('Le titre est obligatoire (1 à 120 caractères).');
  }
  if (value.endsWith('.')) throw new Error('Le titre ne doit pas se terminer par un point.');
  for (const character of value) {
    if ('/\\:*?"<>|'.includes(character)) {
      throw new Error(`Caractère interdit dans le titre : ${character}`);
    }
  }
  return value;
}

async function writeProjectAtomically(folder, project) {
  const file = path.join(folder, 'project.json');
  const temp = path.join(folder, `.project-${randomUUID()}.tmp`);
  try {
    await writeFile(temp, `${JSON.stringify(project, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

export async function createProject({ title, env = process.env } = {}) {
  const cleanTitle = validateTitle(title);
  const store = await projectStore(env);
  await mkdir(store.root, { recursive: true });
  const canonicalRoot = await realpath(store.root);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const id = randomUUID();
    const folder = path.join(store.root, id);
    try {
      await mkdir(folder);
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw new Error(`Création du projet impossible : ${error?.message || error}`);
    }
    try {
      const canonicalFolder = await realpath(folder);
      if (!isWithin(canonicalRoot, canonicalFolder)) {
        throw new Error('Le dossier du projet se trouve hors du profil Song Maker actif.');
      }
      for (const child of ['generations', 'separations', 'mixes', 'exports', 'scores']) {
        await mkdir(path.join(folder, child));
      }
      const now = new Date().toISOString();
      const project = {
        schema: 'songmaker.project',
        schemaVersion: 1,
        id,
        title: cleanTitle,
        createdAt: now,
        updatedAt: now,
        sampleRate: 48000,
        channels: 2,
        bitDepth: 24,
        style: '',
        lyrics: '',
        cot: 'full',
        targetDurationSec: 180,
        preferFullLyrics: true,
        instrumentalMode: false,
      };
      await writeFile(path.join(folder, 'project.json'), `${JSON.stringify(project, null, 2)}\n`, {
        encoding: 'utf8', flag: 'wx',
      });
      return { profileId: store.profileId, project };
    } catch (error) {
      await rm(folder, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  throw new Error('Création du projet impossible : identifiant déjà utilisé. Réessaie.');
}

export async function renameProject({ projectId, title, expectedUpdatedAt, env = process.env } = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de le renommer.');
  }
  const cleanTitle = validateTitle(title);
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const folder = path.join(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const canonicalFolder = await realpath(folder);
  if (!isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet se trouve hors du profil Song Maker actif.');
  }
  const now = Date.now();
  const previous = Date.parse(project.updatedAt);
  const updatedAt = new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString();
  const updated = { ...project, title: cleanTitle, updatedAt };
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated };
}
