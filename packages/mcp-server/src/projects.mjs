import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const GENERATION_ID_PATTERN = /^gen-[0-9]+$/;
const SEPARATION_ID_PATTERN = /^sep-[0-9]+$/;
const MIX_ID_PATTERN = /^mix-v[0-9]+$/;
const SCORE_ID_PATTERN = /^score-v[0-9]+$/;

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

export async function userLibraryStore(env = process.env) {
  const store = await projectStore(env);
  const profileRoot = path.dirname(store.root);
  return {
    profileId: store.profileId,
    projectsRoot: store.root,
    profileRoot,
    filePath: path.join(profileRoot, 'user-library.json'),
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

async function regularFileInside(directory, filename) {
  const candidate = path.join(directory, filename);
  let info;
  try {
    info = await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) return false;
  const canonical = await realpath(candidate);
  return isWithin(directory, canonical);
}

async function readJsonInside(directory, filename, label) {
  if (!await regularFileInside(directory, filename)) return null;
  return readJson(path.join(directory, filename), label);
}

async function projectSubdirectory(projectDirectory, name) {
  const candidate = path.join(projectDirectory, name);
  let info;
  try {
    info = await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`Le dossier ${name} du projet est invalide.`);
  }
  const canonical = await realpath(candidate);
  if (!isWithin(projectDirectory, canonical)) {
    throw new Error(`Le dossier ${name} se trouve hors du projet Song Maker.`);
  }
  return canonical;
}

async function fileModifiedAt(directory, filename) {
  if (!await regularFileInside(directory, filename)) return null;
  try {
    return (await stat(path.join(directory, filename))).mtime.toISOString();
  } catch {
    return null;
  }
}

function generationEngineId(request) {
  const explicit = request?.model?.engineId;
  if (typeof explicit === 'string' && explicit) return explicit;
  switch (request?.generationEngine || 'yue2') {
    case 'ace_step': return 'ace_step_1_5';
    case 'ace_step_lego': return 'ace_step_lego';
    default: return 'yue2_3b';
  }
}

/** Read generation, separation, mix, and score version summaries for a project. */
export async function listProjectVersions({ projectId, env = process.env } = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }

  const canonicalGenerations = await projectSubdirectory(canonicalFolder, 'generations');
  const generations = [];
  let skippedInvalid = 0;
  if (canonicalGenerations) {
    const entries = await readdir(canonicalGenerations, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || !GENERATION_ID_PATTERN.test(entry.name)) continue;
      const versionDirectory = path.join(canonicalGenerations, entry.name);
      try {
        const directoryInfo = await lstat(versionDirectory);
        const canonicalVersion = await realpath(versionDirectory);
        if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || !isWithin(canonicalGenerations, canonicalVersion)) {
          skippedInvalid += 1;
          continue;
        }
        const request = await readJsonInside(canonicalVersion, 'request.json', 'request.json');
        if (!request || request.id !== entry.name) {
          skippedInvalid += 1;
          continue;
        }
        const result = await readJsonInside(canonicalVersion, 'result.json', 'result.json');
        const job = result ? null : await readJsonInside(canonicalVersion, 'job.json', 'job.json');
        const state = typeof result?.state === 'string'
          ? result.state
          : typeof job?.state === 'string' ? job.state : 'interrupted';
        const audioAvailable = state === 'generated' && await regularFileInside(canonicalVersion, 'audio.wav');
        const generationName = Object.hasOwn(project.generationNames ?? {}, entry.name)
          ? project.generationNames[entry.name]
          : null;
        generations.push({
          id: entry.name,
          name: typeof generationName === 'string' ? generationName : null,
          createdAt: typeof request.createdAt === 'string' ? request.createdAt : null,
          seed: Number.isSafeInteger(request.seed) ? request.seed : null,
          cot: typeof request.cot === 'string' ? request.cot : null,
          engineId: generationEngineId(request),
          state,
          active: project.activeGenerationId === entry.name,
          parentGenerationId: typeof request.parentGenerationId === 'string' ? request.parentGenerationId : null,
          hasScore: await regularFileInside(canonicalVersion, 'score.abc'),
          audioAvailable,
          audioPath: audioAvailable ? `generations/${entry.name}/audio.wav` : null,
        });
      } catch {
        skippedInvalid += 1;
      }
    }
  }

  const mixesDirectory = await projectSubdirectory(canonicalFolder, 'mixes');
  const allMixes = [];
  if (mixesDirectory) {
    const entries = await readdir(mixesDirectory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const match = /^(mix-v[0-9]+)\.json$/.exec(entry.name);
      if (!entry.isFile() || !match || !MIX_ID_PATTERN.test(match[1])) continue;
      try {
        const mix = await readJsonInside(mixesDirectory, entry.name, entry.name);
        if (!mix || mix.id !== match[1]) {
          skippedInvalid += 1;
          continue;
        }
        const createdAt = [mix.updatedAt, mix.createdAt].find(value => typeof value === 'string')
          ?? await fileModifiedAt(mixesDirectory, entry.name);
        allMixes.push({
          id: mix.id,
          separationId: typeof mix.separationId === 'string' ? mix.separationId : '',
          createdAt,
          active: project.activeMixId === mix.id,
          trackCount: Array.isArray(mix.tracks) ? mix.tracks.length : 0,
          masterGainDb: Number.isFinite(mix.masterGainDb) ? mix.masterGainDb : null,
        });
      } catch {
        skippedInvalid += 1;
      }
    }
  }
  const mixesBySeparation = new Map();
  for (const mix of allMixes) {
    const rows = mixesBySeparation.get(mix.separationId) ?? [];
    rows.push(mix);
    mixesBySeparation.set(mix.separationId, rows);
  }
  const mixVersions = [];
  const initialMixBySeparation = new Map();
  for (const rows of mixesBySeparation.values()) {
    rows.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id.localeCompare(b.id));
    if (rows.length > 0 && rows[0].separationId) initialMixBySeparation.set(rows[0].separationId, rows[0]);
    mixVersions.push(...rows.slice(1));
  }
  mixVersions.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id.localeCompare(b.id));

  const separations = [];
  const separationsDirectory = await projectSubdirectory(canonicalFolder, 'separations');
  if (separationsDirectory) {
    const entries = await readdir(separationsDirectory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory() || !SEPARATION_ID_PATTERN.test(entry.name)) continue;
      const versionDirectory = path.join(separationsDirectory, entry.name);
      try {
        const directoryInfo = await lstat(versionDirectory);
        const canonicalVersion = await realpath(versionDirectory);
        if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory() || !isWithin(separationsDirectory, canonicalVersion)) {
          skippedInvalid += 1;
          continue;
        }
        const manifest = await readJsonInside(canonicalVersion, 'separation.json', 'separation.json');
        if (!manifest) {
          skippedInvalid += 1;
          continue;
        }
        const job = await readJsonInside(canonicalVersion, 'job.json', 'job.json');
        const associatedMix = initialMixBySeparation.get(entry.name);
        const createdAt = [manifest.updatedAt, manifest.createdAt].find(value => typeof value === 'string')
          ?? await fileModifiedAt(canonicalVersion, 'separation.json');
        separations.push({
          id: entry.name,
          mixId: associatedMix?.id ?? null,
          createdAt,
          active: project.activeSeparationId === entry.name,
          generationId: typeof job?.generationId === 'string' ? job.generationId : null,
          family: typeof manifest.family === 'string' ? manifest.family : null,
          warnings: Array.isArray(manifest.warnings) ? manifest.warnings.filter(value => typeof value === 'string') : [],
        });
      } catch {
        skippedInvalid += 1;
      }
    }
  }

  const scores = [];
  const scoresDirectory = await projectSubdirectory(canonicalFolder, 'scores');
  if (scoresDirectory) {
    const entries = await readdir(scoresDirectory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const match = /^(score-v[0-9]+)\.json$/.exec(entry.name);
      if (!entry.isFile() || !match || !SCORE_ID_PATTERN.test(match[1])) continue;
      try {
        const score = await readJsonInside(scoresDirectory, entry.name, entry.name);
        if (!score || score.id !== match[1]) {
          skippedInvalid += 1;
          continue;
        }
        const voices = Array.isArray(score.voices) ? score.voices : [];
        const noteCount = voices.reduce((count, voice) => count + (voice && Array.isArray(voice.notes) ? voice.notes.length : 0), 0);
        scores.push({
          id: score.id,
          parentScoreId: typeof score.parentScoreId === 'string' ? score.parentScoreId : null,
          branchName: typeof score.branchName === 'string' ? score.branchName : null,
          version: Number.isSafeInteger(score.version) ? score.version : 1,
          source: typeof score.source === 'string' ? score.source : 'manual',
          noteCount,
          createdAt: [score.createdAt, await fileModifiedAt(scoresDirectory, entry.name)].find(value => typeof value === 'string') ?? null,
          active: project.activeScoreId === score.id,
        });
      } catch {
        skippedInvalid += 1;
      }
    }
  }

  return {
    profileId: store.profileId,
    projectId,
    projectUpdatedAt: project.updatedAt ?? null,
    activeGenerationId: project.activeGenerationId ?? null,
    activeSeparationId: project.activeSeparationId ?? null,
    activeMixId: project.activeMixId ?? null,
    activeScoreId: project.activeScoreId ?? null,
    generations,
    separations,
    mixVersions,
    scores,
    skippedInvalid,
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

function validateDraftProject(project) {
  validateTitle(project.title);
  if (!['full', 'melody', 'off'].includes(project.cot)) {
    throw new Error('cot doit être full, melody ou off.');
  }
  const duration = project.targetDurationSec;
  if (!Number.isInteger(duration) || duration < 30 || duration > 360 || duration % 30 !== 0) {
    throw new Error('Durée cible : 30 à 360 s, par pas de 30.');
  }
  if (typeof project.lyrics !== 'string' || [...project.lyrics].length > 4000) {
    throw new Error('Les paroles sont limitées à 4000 caractères.');
  }
  if (!project.instrumentalMode && typeof project.singingLanguage === 'string' &&
      project.singingLanguage.trim() && [...project.singingLanguage.trim()].length > 40) {
    throw new Error('Langue du chant : 1 à 40 caractères.');
  }
  if (project.tempoBpm !== null && project.tempoBpm !== undefined &&
      (!Number.isInteger(project.tempoBpm) || project.tempoBpm < 40 || project.tempoBpm > 220)) {
    throw new Error('Tempo : entier 40 à 220.');
  }
  if (project.key !== null && project.key !== undefined) {
    if (!['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].includes(project.key.tonic)) {
      throw new Error(`Tonique invalide : ${project.key.tonic}`);
    }
    if (project.key.mode !== 'major' && project.key.mode !== 'minor') {
      throw new Error('Mode invalide (major|minor).');
    }
  }
  if (project.meter !== null && project.meter !== undefined &&
      ![[4, 4], [3, 4], [6, 8], [2, 4]].some(([numerator, denominator]) =>
        project.meter.numerator === numerator && project.meter.denominator === denominator)) {
    throw new Error('Métrique autorisée : 4/4, 3/4, 6/8, 2/4.');
  }
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

export async function updateProject({ projectId, expectedUpdatedAt, env = process.env, ...changes } = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de le modifier.');
  }
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }

  const updated = { ...project };
  if (Object.hasOwn(changes, 'title')) updated.title = validateTitle(changes.title);
  if (Object.hasOwn(changes, 'style')) {
    if (typeof changes.style !== 'string') throw new Error('style doit être une chaîne.');
    updated.style = changes.style.trim();
  }
  if (Object.hasOwn(changes, 'lyrics')) updated.lyrics = changes.lyrics;
  if (Object.hasOwn(changes, 'cot')) updated.cot = changes.cot;
  if (Object.hasOwn(changes, 'targetDurationSec')) updated.targetDurationSec = changes.targetDurationSec;
  if (Object.hasOwn(changes, 'preferFullLyrics')) updated.preferFullLyrics = changes.preferFullLyrics;
  if (Object.hasOwn(changes, 'instrumentalMode')) updated.instrumentalMode = changes.instrumentalMode;
  if (Object.hasOwn(changes, 'singingLanguage')) {
    if (changes.singingLanguage === null || changes.singingLanguage.trim() === '') delete updated.singingLanguage;
    else updated.singingLanguage = changes.singingLanguage.trim();
  }
  if (Object.hasOwn(changes, 'tempoBpm')) {
    if (changes.tempoBpm === null) delete updated.tempoBpm;
    else updated.tempoBpm = changes.tempoBpm;
  }
  if (Object.hasOwn(changes, 'key')) {
    if (changes.key === null) delete updated.key;
    else updated.key = changes.key;
  }
  if (Object.hasOwn(changes, 'meter')) {
    if (changes.meter === null) delete updated.meter;
    else updated.meter = changes.meter;
  }

  updated.lyrics ??= '';
  updated.cot ??= 'full';
  updated.targetDurationSec ??= 180;
  updated.preferFullLyrics ??= true;
  updated.instrumentalMode ??= false;
  updated.style ??= '';
  validateDraftProject(updated);

  const folder = path.join(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const canonicalFolder = await realpath(folder);
  if (!isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet se trouve hors du profil Song Maker actif.');
  }
  const now = Date.now();
  const previous = Date.parse(project.updatedAt);
  updated.updatedAt = new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString();
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated };
}

export async function deleteProject({ projectId, expectedUpdatedAt, confirm, env = process.env } = {}) {
  if (confirm !== true) throw new Error('Confirme la suppression du projet avec confirm=true.');
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de le supprimer.');
  }
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune suppression effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }

  const folder = path.join(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const canonicalFolder = await realpath(folder);
  const folderInfo = await lstat(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }

  // Recheck the revision immediately before removal so stale MCP clients cannot
  // erase a project that was edited after their last read.
  const latestProject = await readProjectAt(store.root, projectId);
  if (latestProject.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const latestFolderInfo = await lstat(folder);
  const latestCanonicalFolder = await realpath(folder);
  if (latestFolderInfo.isSymbolicLink() || !latestFolderInfo.isDirectory() ||
      !isWithin(canonicalRoot, latestCanonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }

  await rm(folder, { recursive: true, force: false });
  return {
    profileId: store.profileId,
    deleted: true,
    project: { id: project.id, title: project.title, updatedAt: project.updatedAt },
  };
}
