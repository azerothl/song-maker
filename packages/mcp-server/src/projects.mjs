import { createReadStream, existsSync } from 'node:fs';
import { link, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { wavDurationMs } from './runtime.mjs';

const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROFILE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const GENERATION_ID_PATTERN = /^gen-[0-9]+$/;
const SEPARATION_ID_PATTERN = /^sep-[0-9]+$/;
const MIX_ID_PATTERN = /^mix-v[0-9]+$/;
const SCORE_ID_PATTERN = /^score-v[0-9]+$/;
const MAX_PROJECT_DOCUMENT_BYTES = 8 * 1024 * 1024;

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

/** Resolve one published generation WAV from the active Song Maker profile. */
export async function resolveGeneratedAudio({ projectId, generationId, env = process.env } = {}) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('Identifiant de projet invalide.');
  }
  if (typeof generationId !== 'string' || !GENERATION_ID_PATTERN.test(generationId)) {
    throw new Error('Identifiant de prise invalide.');
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const projectFolder = path.join(store.root, projectId);
  const projectInfo = await lstat(projectFolder);
  const canonicalProject = await realpath(projectFolder);
  if (projectInfo.isSymbolicLink() || !projectInfo.isDirectory() || !isWithin(canonicalRoot, canonicalProject)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }

  const generations = await projectSubdirectory(canonicalProject, 'generations');
  if (!generations) throw new Error(`Prise introuvable : ${generationId}`);
  const generationFolder = path.join(generations, generationId);
  const generationInfo = await lstat(generationFolder).catch(error => {
    if (error?.code === 'ENOENT') throw new Error(`Prise introuvable : ${generationId}`);
    throw error;
  });
  const canonicalGeneration = await realpath(generationFolder);
  if (generationInfo.isSymbolicLink() || !generationInfo.isDirectory() || !isWithin(generations, canonicalGeneration)) {
    throw new Error('Le dossier de la prise est invalide.');
  }

  const request = await readJsonInside(canonicalGeneration, 'request.json', 'request.json');
  const result = await readJsonInside(canonicalGeneration, 'result.json', 'result.json');
  if (!request || request.id !== generationId || result?.state !== 'generated' ||
      result.audio?.path !== 'audio.wav' || !/^[a-f0-9]{64}$/.test(result.audio?.sha256 ?? '')) {
    throw new Error('Cette prise n’est pas publiée comme une génération terminée.');
  }
  if (!await regularFileInside(canonicalGeneration, 'audio.wav')) {
    throw new Error('Le WAV de cette prise est introuvable ou invalide.');
  }
  const audioPath = await realpath(path.join(canonicalGeneration, 'audio.wav'));
  let durationMs;
  try {
    durationMs = await wavDurationMs(audioPath);
  } catch {
    throw new Error('Le fichier audio de cette prise est illisible ou vide.');
  }
  if (!durationMs || await sha256File(audioPath) !== result.audio.sha256) {
    throw new Error('Le fichier audio de cette prise a changé ou est incomplet.');
  }

  return {
    profileId: store.profileId,
    projectId,
    projectTitle: project.title,
    generationId,
    generationName: typeof project.generationNames?.[generationId] === 'string'
      ? project.generationNames[generationId]
      : null,
    audioPath,
  };
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
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

async function readBoundedJsonInside(directory, filename, label, maxBytes = MAX_PROJECT_DOCUMENT_BYTES) {
  const candidate = path.join(directory, filename);
  let info;
  try {
    info = await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Lecture ${label} impossible : ${error?.message || error}`);
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} est invalide ou se trouve hors du projet Song Maker.`);
  }
  if (info.size > maxBytes) {
    throw new Error(`${label} dépasse la taille maximale de lecture (${maxBytes} octets).`);
  }
  const canonical = await realpath(candidate);
  if (!isWithin(directory, canonical)) {
    throw new Error(`${label} se trouve hors du projet Song Maker.`);
  }
  return readJson(canonical, label);
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

/** Read one saved mix without exposing local plugin paths or opaque plugin state. */
export async function getProjectMix({ projectId, mixId, env = process.env } = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  const selectedMixId = mixId ?? project.activeMixId;
  if (typeof selectedMixId !== 'string' || !MIX_ID_PATTERN.test(selectedMixId)) {
    throw new Error('Identifiant de mix invalide ou aucun mix actif.');
  }

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const mixesDirectory = await projectSubdirectory(canonicalFolder, 'mixes');
  if (!mixesDirectory) throw new Error(`Mix introuvable : ${selectedMixId}`);
  const mix = await readBoundedJsonInside(mixesDirectory, `${selectedMixId}.json`, `${selectedMixId}.json`);
  if (!mix || mix.id !== selectedMixId) throw new Error(`Mix introuvable ou invalide : ${selectedMixId}`);
  if ((mix.schema !== undefined && mix.schema !== 'songmaker.mix') ||
      (mix.schemaVersion !== undefined && mix.schemaVersion !== 1)) {
    throw new Error('Version de mix non prise en charge.');
  }
  if (!Array.isArray(mix.tracks) || mix.tracks.some(track => !track || typeof track !== 'object' || Array.isArray(track) ||
      (track.clips !== undefined && !Array.isArray(track.clips)))) {
    throw new Error('Document de mix invalide : pistes ou clips mal formés.');
  }

  const safeMix = {
    ...mix,
    tracks: Array.isArray(mix.tracks) ? mix.tracks.map(track => ({
      ...track,
      clips: Array.isArray(track.clips) ? track.clips.map(clip => {
        const sourcePath = typeof clip?.sourcePath === 'string' ? clip.sourcePath : '';
        const normalized = sourcePath.replaceAll('\\', '/');
        const absolute = path.isAbsolute(sourcePath) || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//');
        const resolved = absolute ? null : path.resolve(canonicalFolder, sourcePath);
        const safeRelative = resolved && isWithin(canonicalFolder, resolved)
          ? path.relative(canonicalFolder, resolved).split(path.sep).join('/')
          : null;
        return {
          ...clip,
          sourcePath: safeRelative,
          sourcePathIsExternal: safeRelative === null,
        };
      }) : [],
      experimentalVst3Insert: track.experimentalVst3Insert ? {
        factoryPresent: track.experimentalVst3Insert.factoryPresent === true,
      } : null,
    })) : [],
    vst3MasterInsert: mix.vst3MasterInsert ? {
      pluginName: typeof mix.vst3MasterInsert.pluginName === 'string' ? mix.vst3MasterInsert.pluginName : '',
      enabled: mix.vst3MasterInsert.enabled === true,
      parameters: mix.vst3MasterInsert.parameters && typeof mix.vst3MasterInsert.parameters === 'object'
        && !Array.isArray(mix.vst3MasterInsert.parameters)
        ? mix.vst3MasterInsert.parameters
        : {},
    } : null,
  };
  return {
    profileId: store.profileId,
    projectId,
    projectTitle: project.title,
    mixId: selectedMixId,
    mixRevision: createHash('sha256').update(JSON.stringify(mix)).digest('hex'),
    active: project.activeMixId === selectedMixId,
    mix: safeMix,
  };
}

/** Update active mix controls and arrangement metadata using an optimistic mix revision. */
export async function updateProjectMix({
  projectId, mixId, expectedMixRevision, masterGainDb, tracks, addMidiTracks, tempoMap, markers,
  env = process.env,
} = {}) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('Identifiant de projet invalide.');
  }
  if (typeof expectedMixRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedMixRevision)) {
    throw new Error('expectedMixRevision doit venir de get_project_mix.');
  }
  if (masterGainDb === undefined && (!Array.isArray(tracks) || tracks.length === 0) &&
      (!Array.isArray(addMidiTracks) || addMidiTracks.length === 0) && tempoMap === undefined && markers === undefined) {
    throw new Error('Indique au moins un réglage de mix à modifier.');
  }
  if (masterGainDb !== undefined && (!Number.isFinite(masterGainDb) || masterGainDb < -24 || masterGainDb > 12)) {
    throw new Error('Le gain master doit être compris entre -24 et +12 dB.');
  }
  if (tracks !== undefined && !Array.isArray(tracks)) {
    throw new Error('Les réglages de pistes doivent être une liste.');
  }
  if (addMidiTracks !== undefined && !Array.isArray(addMidiTracks)) {
    throw new Error('Les nouvelles pistes MIDI doivent être une liste.');
  }
  if (tempoMap !== undefined && !Array.isArray(tempoMap)) {
    throw new Error('La carte de tempo doit être une liste.');
  }
  if (tempoMap?.length > 512) throw new Error('La carte de tempo peut contenir au maximum 512 événements.');
  if (markers !== undefined && !Array.isArray(markers)) {
    throw new Error('Les repères doivent être une liste.');
  }
  if (markers?.length > 512) throw new Error('La liste peut contenir au maximum 512 repères.');
  const tempoEvents = (tempoMap ?? []).map(event => {
    if (!event || !Number.isSafeInteger(event.startMs) || event.startMs < 0 ||
        !Number.isInteger(event.quarterBpm) || event.quarterBpm < 1 || event.quarterBpm > 400) {
      throw new Error('Chaque changement de tempo doit avoir une position positive ou nulle et un tempo entier entre 1 et 400 BPM.');
    }
    return { startMs: event.startMs, quarterBpm: event.quarterBpm };
  });
  if (tempoMap !== undefined) {
    if (tempoEvents.length === 0 || !tempoEvents.some(event => event.startMs === 0)) {
      throw new Error('La carte de tempo doit conserver un tempo de départ à 0 ms.');
    }
    if (new Set(tempoEvents.map(event => event.startMs)).size !== tempoEvents.length) {
      throw new Error('Deux changements de tempo ne peuvent pas partager la même position.');
    }
    tempoEvents.sort((a, b) => a.startMs - b.startMs);
  }
  const markerKinds = new Set(['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'outro', 'other']);
  const sectionMarkers = (markers ?? []).map(marker => {
    const id = typeof marker?.id === 'string' ? marker.id.trim() : '';
    const name = typeof marker?.name === 'string' ? marker.name.trim() : '';
    if (!id || id.length > 128 || !name || name.length > 120 || !markerKinds.has(marker?.kind) ||
        !Number.isSafeInteger(marker?.startMs) || marker.startMs < 0) {
      throw new Error('Chaque repère doit avoir un identifiant, un nom, un type valide et une position positive ou nulle.');
    }
    return { id, name, kind: marker.kind, startMs: marker.startMs };
  });
  if (markers !== undefined) {
    if (new Set(sectionMarkers.map(marker => marker.id)).size !== sectionMarkers.length) {
      throw new Error('Identifiant de repère répété.');
    }
    sectionMarkers.sort((a, b) => a.startMs - b.startMs);
  }
  const midiTrackSpecs = (addMidiTracks ?? []).map(item => {
    const clean = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!clean || clean.length > 120) throw new Error('Le nom de piste MIDI doit contenir de 1 à 120 caractères.');
    const id = item?.id === undefined ? `midi-${randomUUID()}` : item.id;
    if (typeof id !== 'string' || !id.trim() || id.trim().length > 128) {
      throw new Error('Identifiant de piste MIDI invalide.');
    }
    return { id: id.trim(), name: clean };
  });
  if (midiTrackSpecs.length > 32) throw new Error('Tu peux ajouter au maximum 32 pistes MIDI à la fois.');
  if (new Set(midiTrackSpecs.map(track => track.id)).size !== midiTrackSpecs.length) {
    throw new Error('Identifiant de piste MIDI répété.');
  }

  const seenTrackIds = new Set();
  for (const update of tracks ?? []) {
    if (!update || typeof update.id !== 'string' || !update.id.trim() || seenTrackIds.has(update.id)) {
      throw new Error('Identifiant de piste invalide ou répété.');
    }
    seenTrackIds.add(update.id);
    const hasControl = ['gainDb', 'pan', 'mute', 'solo'].some(key => update[key] !== undefined);
    if (!hasControl) throw new Error(`Aucun réglage fourni pour la piste ${update.id}.`);
    if (update.gainDb !== undefined && (!Number.isFinite(update.gainDb) || update.gainDb < -24 || update.gainDb > 12)) {
      throw new Error(`Le gain de la piste ${update.id} doit être compris entre -24 et +12 dB.`);
    }
    if (update.pan !== undefined && (!Number.isFinite(update.pan) || update.pan < -1 || update.pan > 1)) {
      throw new Error(`Le panoramique de la piste ${update.id} doit être compris entre -1 et +1.`);
    }
    for (const key of ['mute', 'solo']) {
      if (update[key] !== undefined && typeof update[key] !== 'boolean') {
        throw new Error(`Le réglage ${key} de la piste ${update.id} doit être un booléen.`);
      }
    }
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  const selectedMixId = mixId ?? project.activeMixId;
  if (typeof selectedMixId !== 'string' || !MIX_ID_PATTERN.test(selectedMixId)) {
    throw new Error('Aucun mix actif à modifier.');
  }
  if (selectedMixId !== project.activeMixId) {
    throw new Error('Seul le mix actif peut être modifié ; les anciennes versions restent intactes.');
  }

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const mixesDirectory = await projectSubdirectory(canonicalFolder, 'mixes');
  if (!mixesDirectory) throw new Error(`Mix introuvable : ${selectedMixId}`);
  const mixFileName = `${selectedMixId}.json`;
  const mixPath = path.join(mixesDirectory, mixFileName);

  const addedTrackIds = [];
  await withMixLock(mixPath, async () => {
    const latestProject = await readProjectAt(store.root, projectId);
    if (latestProject.activeMixId !== selectedMixId) {
      throw new Error('Le mix actif a changé. Relis le projet avant de réessayer.');
    }
    const current = await readBoundedJsonInside(mixesDirectory, mixFileName, mixFileName);
    if (!current || current.id !== selectedMixId || !Array.isArray(current.tracks)) {
      throw new Error(`Mix introuvable ou invalide : ${selectedMixId}`);
    }
    if ((current.schema !== undefined && current.schema !== 'songmaker.mix') ||
        (current.schemaVersion !== undefined && current.schemaVersion !== 1)) {
      throw new Error('Version de mix non prise en charge.');
    }
    if (current.tracks.some(track => !track || typeof track !== 'object' || Array.isArray(track) ||
        typeof track.id !== 'string' || (track.clips !== undefined && !Array.isArray(track.clips)))) {
      throw new Error('Document de mix invalide : pistes ou clips mal formés.');
    }
    const currentRevision = createHash('sha256').update(JSON.stringify(current)).digest('hex');
    if (currentRevision !== expectedMixRevision) {
      throw new Error('Le mix a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
    }

    const next = structuredClone(current);
    if (masterGainDb !== undefined) next.masterGainDb = masterGainDb;
    if (tempoMap !== undefined) next.tempoMap = tempoEvents;
    if (markers !== undefined) next.markers = sectionMarkers;
    for (const update of tracks ?? []) {
      const track = next.tracks.find(item => item.id === update.id);
      if (!track) throw new Error(`Piste introuvable dans le mix actif : ${update.id}`);
      for (const key of ['gainDb', 'pan', 'mute', 'solo']) {
        if (update[key] !== undefined) track[key] = update[key];
      }
    }
    const existingTrackIds = [];
    for (const { id, name } of midiTrackSpecs) {
      const existing = next.tracks.find(track => track.id === id);
      if (existing) {
        if (existing.role !== 'midi') throw new Error(`La voix MIDI ${id} est déjà utilisée par une autre piste.`);
        existingTrackIds.push(id);
        continue;
      }
      next.tracks.push({
        id, role: 'midi', name, gainDb: 0, pan: 0, mute: false, solo: false,
        locked: false, aiSeparated: false, clips: [], experimentalVst3Insert: null,
      });
      addedTrackIds.push(id);
    }
    if (masterGainDb !== undefined || tempoMap !== undefined || markers !== undefined ||
        (tracks ?? []).length > 0 || addedTrackIds.length > 0) {
      await writeJsonAtomically(mixPath, next, `.mix-${randomUUID()}.tmp`);
    }
  });

  const updated = await getProjectMix({ projectId, mixId: selectedMixId, env });
  return addMidiTracks?.length
    ? { ...updated, addedTrackIds, existingTrackIds: updated.mix.tracks
      .filter(track => midiTrackSpecs.some(spec => spec.id === track.id) && !addedTrackIds.includes(track.id))
      .map(track => track.id) }
    : updated;
}

async function withMixLock(mixPath, callback) {
  const lockPath = `${mixPath}.mcp.lock`;
  let locked = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(lockPath, `pid=${process.pid} time=${new Date().toISOString()}\n`, {
        encoding: 'utf8', flag: 'wx',
      });
      locked = true;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new Error(`Verrouillage du mix impossible : ${error?.message || error}`);
      let stale = false;
      try { stale = Date.now() - (await stat(lockPath)).mtimeMs > 300_000; }
      catch (statError) { if (statError?.code !== 'ENOENT') throw statError; }
      if (stale && attempt === 0) {
        await rm(lockPath, { force: true });
        continue;
      }
      throw new Error('Le mix est en cours de modification. Réessaie dans un instant.');
    }
  }
  if (!locked) throw new Error('Le mix est en cours de modification. Réessaie dans un instant.');
  try { return await callback(); }
  finally { await rm(lockPath, { force: true }).catch(() => {}); }
}

/** Read one saved score document from the active Song Maker profile. */
export async function getProjectScore({ projectId, scoreId, env = process.env } = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  const selectedScoreId = scoreId ?? project.activeScoreId;
  if (typeof selectedScoreId !== 'string' || !SCORE_ID_PATTERN.test(selectedScoreId)) {
    throw new Error('Identifiant de partition invalide ou aucune partition active.');
  }

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const scoresDirectory = await projectSubdirectory(canonicalFolder, 'scores');
  if (!scoresDirectory) throw new Error(`Partition introuvable : ${selectedScoreId}`);
  const score = await readBoundedJsonInside(scoresDirectory, `${selectedScoreId}.json`, `${selectedScoreId}.json`);
  if (!score || score.id !== selectedScoreId) throw new Error(`Partition introuvable ou invalide : ${selectedScoreId}`);
  if ((score.schema !== undefined && score.schema !== 'songmaker.score') ||
      (score.schemaVersion !== undefined && score.schemaVersion !== 1)) {
    throw new Error('Version de partition non prise en charge.');
  }
  const safeScore = structuredClone(score);
  if (Array.isArray(safeScore.voices)) {
    for (const voice of safeScore.voices) {
      if (voice && typeof voice === 'object' && voice.vst3Instrument) {
        voice.vst3Instrument = {
          pluginName: typeof voice.vst3Instrument.pluginName === 'string' ? voice.vst3Instrument.pluginName : '',
          parameters: voice.vst3Instrument.parameters && typeof voice.vst3Instrument.parameters === 'object'
            && !Array.isArray(voice.vst3Instrument.parameters)
            ? voice.vst3Instrument.parameters
            : {},
        };
      }
    }
  }
  return {
    profileId: store.profileId,
    projectId,
    projectTitle: project.title,
    scoreId: selectedScoreId,
    scoreRevision: createHash('sha256').update(JSON.stringify(score)).digest('hex'),
    active: project.activeScoreId === selectedScoreId,
    score: safeScore,
  };
}

/** Add the mix lane that corresponds to an existing voice in the active score. */
export async function addProjectMidiTrack({
  projectId, voiceId, expectedScoreRevision, expectedMixRevision, env = process.env,
} = {}) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('Identifiant de projet invalide.');
  }
  if (typeof voiceId !== 'string' || !voiceId.trim() || voiceId.trim().length > 128) {
    throw new Error('Identifiant de voix MIDI invalide.');
  }
  if (typeof expectedScoreRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedScoreRevision)) {
    throw new Error('expectedScoreRevision doit venir de get_project_score.');
  }

  const store = await projectStore(env);
  const scoreSnapshot = await getProjectScore({ projectId, env });
  if (scoreSnapshot.scoreRevision !== expectedScoreRevision) {
    throw new Error('La partition a changé depuis sa dernière lecture. Relis-la avant de réessayer.');
  }
  const scoreVoice = scoreSnapshot.score.voices?.find(voice => voice?.id === voiceId.trim());
  if (!scoreVoice) throw new Error(`Voix introuvable dans la partition active : ${voiceId}`);
  const name = typeof scoreVoice.name === 'string' ? scoreVoice.name.trim() : '';
  if (!name || name.length > 120) throw new Error(`Nom de voix invalide dans la partition : ${voiceId}`);

  const project = await readProjectAt(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const scoresDirectory = await projectSubdirectory(canonicalFolder, 'scores');
  if (!scoresDirectory || project.activeScoreId !== scoreSnapshot.scoreId) {
    throw new Error('La partition active a changé. Relis le projet avant de réessayer.');
  }
  const scorePath = path.join(scoresDirectory, `${scoreSnapshot.scoreId}.json`);

  return withScoreLock(scorePath, async () => {
    const latestProject = await readProjectAt(store.root, projectId);
    if (latestProject.activeScoreId !== scoreSnapshot.scoreId) {
      throw new Error('La partition active a changé. Relis le projet avant de réessayer.');
    }
    const currentScore = await readBoundedJsonInside(
      scoresDirectory, `${scoreSnapshot.scoreId}.json`, `${scoreSnapshot.scoreId}.json`,
    );
    if (!currentScore || createHash('sha256').update(JSON.stringify(currentScore)).digest('hex') !== expectedScoreRevision) {
      throw new Error('La partition a changé depuis sa dernière lecture. Relis-la avant de réessayer.');
    }
    const currentVoice = currentScore.voices?.find(voice => voice?.id === voiceId.trim());
    if (!currentVoice) throw new Error(`Voix introuvable dans la partition active : ${voiceId}`);
    const currentName = typeof currentVoice.name === 'string' ? currentVoice.name.trim() : '';
    if (!currentName || currentName.length > 120) throw new Error(`Nom de voix invalide dans la partition : ${voiceId}`);
    return updateProjectMix({
      projectId,
      expectedMixRevision,
      addMidiTracks: [{ id: voiceId.trim(), name: currentName }],
      env,
    });
  });
}

async function withProjectLock(projectDirectory, callback) {
  const lockPath = path.join(projectDirectory, '.mcp-midi-create.lock');
  let locked = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(lockPath, `pid=${process.pid} time=${new Date().toISOString()}\n`, { encoding: 'utf8', flag: 'wx' });
      locked = true;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new Error(`Verrouillage du projet impossible : ${error?.message || error}`);
      let stale = false;
      try { stale = Date.now() - (await stat(lockPath)).mtimeMs > 300_000; }
      catch (statError) { if (statError?.code !== 'ENOENT') throw statError; }
      if (stale && attempt === 0) { await rm(lockPath, { force: true }); continue; }
      throw new Error('Une création de piste MIDI est déjà en cours. Réessaie dans un instant.');
    }
  }
  if (!locked) throw new Error('Impossible de verrouiller le projet pour créer une piste MIDI.');
  try { return await callback(); }
  finally { await rm(lockPath, { force: true }).catch(() => {}); }
}

async function nextVersionId(directory, prefix) {
  const pattern = new RegExp(`^${prefix}-v([0-9]+)\\.json$`);
  const names = (await readdir(directory)).map(name => pattern.exec(name)).filter(Boolean)
    .map(match => Number(match[1])).filter(Number.isSafeInteger);
  return `${prefix}-v${String(Math.max(0, ...names) + 1).padStart(3, '0')}`;
}

async function ensureActiveMidiDocuments({ projectId, voiceId, name, env }) {
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if ((project.schema !== undefined && project.schema !== 'songmaker.project') ||
      (project.schemaVersion !== undefined && project.schemaVersion !== 1)) {
    throw new Error('Version de projet non prise en charge ; aucune partition ni aucun mix créés.');
  }
  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  for (const [directoryName, activeId, pattern] of [
    ['scores', project.activeScoreId, SCORE_ID_PATTERN],
    ['mixes', project.activeMixId, MIX_ID_PATTERN],
  ]) {
    if (activeId != null && (typeof activeId !== 'string' || !pattern.test(activeId))) {
      throw new Error(`Référence de ${directoryName === 'scores' ? 'partition' : 'mix'} invalide dans le projet.`);
    }
  }

  const directories = {};
  for (const name of ['scores', 'mixes']) {
    let directory = await projectSubdirectory(canonicalFolder, name);
    if (!directory) {
      await mkdir(path.join(canonicalFolder, name), { recursive: true });
      directory = await realpath(path.join(canonicalFolder, name));
    }
    directories[name] = directory;
  }

  const updated = { ...project };
  let changed = false;
  let createdScoreWithVoice = false;
  if (project.activeScoreId == null) {
    const scoreId = await nextVersionId(directories.scores, 'score');
    const tempoBpm = Number.isInteger(project.tempoBpm) && project.tempoBpm >= 20 && project.tempoBpm <= 300
      ? project.tempoBpm : 120;
    const key = project.key && typeof project.key.tonic === 'string' && typeof project.key.mode === 'string'
      ? project.key : { tonic: 'C', mode: 'major' };
    const meter = project.meter && Number.isInteger(project.meter.numerator) && Number.isInteger(project.meter.denominator)
      ? project.meter : { numerator: 4, denominator: 4 };
    const score = {
      schema: 'songmaker.score', schemaVersion: 1, id: scoreId, version: 2, ppq: 960,
      tempoMap: [{ tick: 0, quarterBpm: tempoBpm }],
      timeSignatures: [{ tick: 0, numerator: meter.numerator, denominator: meter.denominator }],
      keySignatures: [{ tick: 0, tonic: key.tonic, mode: key.mode }],
      sections: [],
      voices: [{ id: voiceId, name, role: 'other', notes: [], abcVoice: 'Ins' }],
      chordEvents: [], lyricAnchors: [], source: 'manual', parentScoreId: null, branchName: 'main',
    };
    await writeJsonExclusive(path.join(directories.scores, `${scoreId}.json`), score, `.score-${randomUUID()}.tmp`);
    updated.activeScoreId = scoreId;
    changed = true;
    createdScoreWithVoice = true;
  }

  if (project.activeMixId == null) {
    const mixId = await nextVersionId(directories.mixes, 'mix');
    const mix = {
      schema: 'songmaker.mix', schemaVersion: 1, id: mixId, separationId: '', sampleRate: 48_000,
      masterGainDb: 0, peakCeilingDb: -1, tracks: [], vst3MasterInsert: null,
      tempoMap: [], timeSignatures: [], markers: [],
    };
    await writeJsonExclusive(path.join(directories.mixes, `${mixId}.json`), mix, `.mix-${randomUUID()}.tmp`);
    updated.activeMixId = mixId;
    changed = true;
  }

  if (changed) {
    const previous = Date.parse(project.updatedAt);
    const now = Date.now();
    updated.updatedAt = new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString();
    const latest = await readProjectAt(store.root, projectId);
    if (latest.updatedAt !== project.updatedAt || latest.activeScoreId !== project.activeScoreId ||
        latest.activeMixId !== project.activeMixId) {
      throw new Error('Le projet a changé pendant la création de la partition ou du mix. Relis-le avant de réessayer.');
    }
    await writeProjectAtomically(canonicalFolder, updated);
  }

  return { project: updated, createdScoreWithVoice };
}

/** Create a MIDI score voice and its matching mix lane with a retry-safe request key. */
export async function createProjectMidiTrack({
  projectId, name, idempotencyKey, expectedScoreRevision, expectedMixRevision, env = process.env,
} = {}) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('Identifiant de projet invalide.');
  }
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(idempotencyKey)) {
    throw new Error('idempotencyKey doit contenir de 1 à 96 lettres, chiffres, tirets ou tirets bas.');
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.trim().length > 120)) {
    throw new Error('Le nom de piste MIDI doit contenir de 1 à 120 caractères.');
  }
  for (const [value, field] of [[expectedScoreRevision, 'expectedScoreRevision'], [expectedMixRevision, 'expectedMixRevision']]) {
    if (value !== undefined && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
      throw new Error(`${field} doit être une révision renvoyée par Song Maker.`);
    }
  }

  const voiceId = `mcp-midi-${idempotencyKey}`;
  const store = await projectStore(env);
  await readProjectAt(store.root, projectId);
  const canonicalRoot = await realpath(store.root);
  const initialFolder = path.join(store.root, projectId);
  const canonicalFolder = await realpath(initialFolder);
  const folderInfo = await lstat(initialFolder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  return withProjectLock(canonicalFolder, async () => {
    const project = await readProjectAt(store.root, projectId);
    const hadActiveScore = project.activeScoreId != null;
    const hadActiveMix = project.activeMixId != null;
    let scoreSnapshot = hadActiveScore ? await getProjectScore({ projectId, env }) : null;
    let mixSnapshot = hadActiveMix ? await getProjectMix({ projectId, env }) : null;
    const requestedName = name?.trim();
    const existingVoice = scoreSnapshot?.score.voices?.find(voice => voice?.id === voiceId);
    const retrying = Boolean(existingVoice);
    const midiTrackCount = (mixSnapshot?.mix.tracks ?? []).filter(track => track?.role === 'midi').length;
    let trackName = requestedName || existingVoice?.name?.trim() || `Instrument MIDI ${midiTrackCount + 1}`;
    let created = false;

    if (existingVoice) {
      if (existingVoice.role !== 'other' || existingVoice.abcVoice !== 'Ins' ||
          !Array.isArray(existingVoice.notes) || existingVoice.notes.length !== 0 ||
          typeof existingVoice.name !== 'string' || !existingVoice.name.trim() ||
          (requestedName && existingVoice.name.trim() !== requestedName)) {
        throw new Error('Cette idempotencyKey est déjà associée à une autre voix MIDI. Utilise une nouvelle clé.');
      }
      trackName = existingVoice.name.trim();
    } else {
      if (hadActiveScore && scoreSnapshot.scoreRevision !== expectedScoreRevision) {
        throw new Error('La partition a changé depuis sa dernière lecture. Relis-la avant de créer la piste.');
      }
      if (!hadActiveScore && expectedScoreRevision !== undefined) {
        throw new Error('Aucune partition active à comparer ; omets expectedScoreRevision pour créer la première piste.');
      }
      if (hadActiveMix && mixSnapshot.mixRevision !== expectedMixRevision) {
        throw new Error('Le mix a changé depuis sa dernière lecture. Relis-le avant de créer la piste.');
      }
      if (!hadActiveMix && expectedMixRevision !== undefined) {
        throw new Error('Aucun mix actif à comparer ; omets expectedMixRevision pour créer la première piste.');
      }
    }

    const { createdScoreWithVoice } = await ensureActiveMidiDocuments({ projectId, voiceId, name: trackName, env });
    created = createdScoreWithVoice;
    scoreSnapshot = await getProjectScore({ projectId, env });
    mixSnapshot = await getProjectMix({ projectId, env });

    const currentVoice = scoreSnapshot.score.voices?.find(voice => voice?.id === voiceId);
    if (currentVoice) {
      if (currentVoice.role !== 'other' || currentVoice.abcVoice !== 'Ins' ||
          !Array.isArray(currentVoice.notes) || currentVoice.notes.length !== 0 ||
          typeof currentVoice.name !== 'string' || !currentVoice.name.trim() ||
          (requestedName && currentVoice.name.trim() !== requestedName)) {
        throw new Error('Cette idempotencyKey est déjà associée à une autre voix MIDI. Utilise une nouvelle clé.');
      }
      trackName = currentVoice.name.trim();
    } else {
      scoreSnapshot = await editProjectScore({
        projectId,
        expectedScoreRevision: scoreSnapshot.scoreRevision,
        edits: [{ operation: 'add_voice', voice: { id: voiceId, name: trackName } }],
        env,
      });
      created = true;
    }

    const existingTrack = mixSnapshot.mix.tracks?.find(track => track?.id === voiceId);
    if (existingTrack) {
      if (existingTrack.role !== 'midi' || existingTrack.name !== trackName) {
        throw new Error('Une piste incompatible utilise déjà l’identifiant de cette voix MIDI.');
      }
      return { projectId, voiceId, name: trackName, created: created || !retrying, linked: true,
        score: scoreSnapshot, mix: mixSnapshot };
    }

    try {
      const mix = await addProjectMidiTrack({
        projectId,
        voiceId,
        expectedScoreRevision: scoreSnapshot.scoreRevision,
        expectedMixRevision: mixSnapshot.mixRevision,
        env,
      });
      return { projectId, voiceId, name: trackName, created: created || !retrying, linked: true,
        score: scoreSnapshot, mix };
    } catch (error) {
      if (created || !retrying) {
        return {
          projectId, voiceId, name: trackName, created: true, linked: false, score: scoreSnapshot,
          warning: `La voix ${voiceId} est enregistrée dans la partition, mais sa piste n’a pas pu rejoindre le mix : ${error?.message || error}. Relis le mix puis appelle add_project_midi_track pour la relier.`,
        };
      }
      throw error;
    }
  });
}

/** Apply bounded MIDI note edits as a new immutable Song Maker score version. */
export async function editProjectScore({ projectId, expectedScoreRevision, edits, env = process.env } = {}) {
  if (typeof projectId !== 'string' || !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('Identifiant de projet invalide.');
  }
  if (typeof expectedScoreRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedScoreRevision)) {
    throw new Error('expectedScoreRevision doit venir de get_project_score.');
  }
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > 512) {
    throw new Error('Fournis de 1 à 512 modifications de notes MIDI.');
  }
  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  const scoreId = project.activeScoreId;
  if (typeof scoreId !== 'string' || !SCORE_ID_PATTERN.test(scoreId)) {
    throw new Error('Aucune partition active à modifier.');
  }
  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const scoresDirectory = await projectSubdirectory(canonicalFolder, 'scores');
  if (!scoresDirectory) throw new Error(`Partition introuvable : ${scoreId}`);
  const scorePath = path.join(scoresDirectory, `${scoreId}.json`);

  let savedScoreId = null;
  await withScoreLock(scorePath, async () => {
    const latestProject = await readProjectAt(store.root, projectId);
    if (latestProject.activeScoreId !== scoreId) {
      throw new Error('La partition active a changé. Relis le projet avant de réessayer.');
    }
    const current = await readBoundedJsonInside(scoresDirectory, `${scoreId}.json`, `${scoreId}.json`);
    if (!current || current.id !== scoreId || !Array.isArray(current.voices)) {
      throw new Error(`Partition introuvable ou invalide : ${scoreId}`);
    }
    if ((current.schema !== undefined && current.schema !== 'songmaker.score') ||
        (current.schemaVersion !== undefined && current.schemaVersion !== 1)) {
      throw new Error('Version de partition non prise en charge.');
    }
    if (createHash('sha256').update(JSON.stringify(current)).digest('hex') !== expectedScoreRevision) {
      throw new Error('La partition a changé depuis sa dernière lecture. Relis-la avant de réessayer.');
    }

    const next = structuredClone(current);
    for (const edit of edits) {
      if (!edit || typeof edit !== 'object' || !['add', 'update', 'delete', 'add_voice'].includes(edit.operation)) {
        throw new Error('Modification de note invalide : opération ou voix manquante.');
      }
      if (edit.operation === 'add_voice') {
        const voice = edit.voice;
        if (!voice || typeof voice !== 'object' || Array.isArray(voice) ||
            typeof voice.id !== 'string' || !/^mcp-midi-[A-Za-z0-9_-]{1,96}$/.test(voice.id) ||
            typeof voice.name !== 'string' || !voice.name.trim() || voice.name.trim().length > 120 ||
            Object.keys(voice).some(key => !['id', 'name'].includes(key))) {
          throw new Error('Nouvelle voix MIDI invalide.');
        }
        if (next.voices.some(item => item?.id === voice.id)) {
          throw new Error(`La voix existe déjà dans la partition : ${voice.id}`);
        }
        next.voices.push({ id: voice.id, name: voice.name.trim(), role: 'other', notes: [], abcVoice: 'Ins' });
        continue;
      }
      if (typeof edit.voiceId !== 'string' || !edit.voiceId.trim()) {
        throw new Error('Modification de note invalide : opération ou voix manquante.');
      }
      const voice = next.voices.find(item => item && item.id === edit.voiceId);
      if (!voice || !Array.isArray(voice.notes)) throw new Error(`Voix introuvable dans la partition : ${edit.voiceId}`);
      if (edit.operation === 'add') {
        const note = edit.note;
        if (!isValidMidiNote(note) || next.voices.some(item => item?.notes?.some(existing => existing?.id === note.id))) {
          throw new Error('La nouvelle note doit avoir un identifiant unique, un départ positif, une durée valide et des valeurs MIDI dans les bornes.');
        }
        voice.notes.push(structuredClone(note));
      } else {
        if (typeof edit.noteId !== 'string' || !edit.noteId.trim()) throw new Error('Identifiant de note requis.');
        const index = voice.notes.findIndex(note => note?.id === edit.noteId);
        if (index < 0) throw new Error(`Note introuvable dans la voix ${edit.voiceId} : ${edit.noteId}`);
        if (edit.operation === 'delete') {
          voice.notes.splice(index, 1);
          for (const anchor of next.lyricAnchors ?? []) {
            if (Array.isArray(anchor?.noteIds)) anchor.noteIds = anchor.noteIds.filter(id => id !== edit.noteId);
          }
        } else {
          const changes = edit.changes;
          if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
              Object.keys(changes).length === 0 || Object.keys(changes).some(key => !['startTick', 'durationTick', 'pitch', 'velocity'].includes(key))) {
            throw new Error('Une modification doit contenir au moins un champ MIDI autorisé.');
          }
          const updatedNote = { ...voice.notes[index], ...changes };
          if (!isValidMidiNote(updatedNote)) throw new Error('Départ, durée, hauteur ou vélocité MIDI hors limites.');
          voice.notes[index] = updatedNote;
        }
      }
    }

    next.schema = 'songmaker.score';
    next.schemaVersion = 1;
    next.parentScoreId = scoreId;
    next.version = (Number.isSafeInteger(current.version) && current.version > 0 ? current.version : 1) + 1;
    const latest = await readProjectAt(store.root, projectId);
    if (latest.activeScoreId !== scoreId || latestProject.updatedAt !== project.updatedAt) {
      throw new Error('Le projet a changé pendant la modification. Relis-le avant de réessayer.');
    }
    let savedVersion = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const names = (await readdir(scoresDirectory)).map(name => /^score-v([0-9]+)\.json$/.exec(name))
        .filter(Boolean).map(match => Number(match[1])).filter(Number.isSafeInteger);
      const nextNumber = Math.max(0, ...names) + 1;
      savedScoreId = `score-v${String(nextNumber).padStart(3, '0')}`;
      next.id = savedScoreId;
      try {
        await writeJsonExclusive(
          path.join(scoresDirectory, `${savedScoreId}.json`), next, `.score-${randomUUID()}.tmp`,
        );
        savedVersion = true;
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST' || attempt === 2) {
          throw new Error(`Écriture de la nouvelle version de partition impossible : ${error?.message || error}`);
        }
      }
    }
    if (!savedVersion) throw new Error('Impossible de créer une version de partition sans écraser une version existante.');
    const finalProject = await readProjectAt(store.root, projectId);
    if (finalProject.activeScoreId !== scoreId || finalProject.updatedAt !== project.updatedAt) {
      throw new Error('Le projet a changé pendant la création de la version. Relis-le avant de réessayer.');
    }
    const previous = Date.parse(finalProject.updatedAt);
    const now = Date.now();
    const updatedProject = {
      ...finalProject,
      activeScoreId: savedScoreId,
      updatedAt: new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString(),
    };
    await writeProjectAtomically(canonicalFolder, updatedProject);
  });

  return getProjectScore({ projectId, scoreId: savedScoreId, env });
}

function isValidMidiNote(note) {
  return note && typeof note === 'object' && !Array.isArray(note) &&
    typeof note.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(note.id) &&
    Number.isSafeInteger(note.startTick) && note.startTick >= 0 && note.startTick <= 10_000_000 &&
    Number.isSafeInteger(note.durationTick) && note.durationTick >= 1 && note.durationTick <= 10_000_000 &&
    Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127 &&
    Number.isInteger(note.velocity) && note.velocity >= 1 && note.velocity <= 127 &&
    (note.tieStart === undefined || typeof note.tieStart === 'boolean') &&
    (note.tieEnd === undefined || typeof note.tieEnd === 'boolean') &&
    Object.keys(note).every(key => ['id', 'startTick', 'durationTick', 'pitch', 'velocity', 'tieStart', 'tieEnd'].includes(key));
}

async function withScoreLock(scorePath, callback) {
  const lockPath = `${scorePath}.mcp.lock`;
  let locked = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await writeFile(lockPath, `pid=${process.pid} time=${new Date().toISOString()}\n`, { encoding: 'utf8', flag: 'wx' });
      locked = true;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new Error(`Verrouillage de la partition impossible : ${error?.message || error}`);
      let stale = false;
      try { stale = Date.now() - (await stat(lockPath)).mtimeMs > 300_000; }
      catch (statError) { if (statError?.code !== 'ENOENT') throw statError; }
      if (stale && attempt === 0) { await rm(lockPath, { force: true }); continue; }
      throw new Error('La partition est en cours de modification. Réessaie dans un instant.');
    }
  }
  if (!locked) throw new Error('La partition est en cours de modification. Réessaie dans un instant.');
  try { return await callback(); }
  finally { await rm(lockPath, { force: true }).catch(() => {}); }
}

/** Select one already-published generation as the active project version. */
export async function useProjectGeneration({
  projectId, generationId, expectedUpdatedAt, env = process.env,
} = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof generationId !== 'string' || !GENERATION_ID_PATTERN.test(generationId)) {
    throw new Error('Identifiant de prise invalide.');
  }
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de sélectionner une prise.');
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }

  const published = await resolveGeneratedAudio({ projectId, generationId, env });
  if (published.profileId !== store.profileId) {
    throw new Error('Le profil actif a changé pendant la sélection. Relis le projet avant de réessayer.');
  }
  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }

  const latest = await readProjectAt(store.root, projectId);
  if (latest.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const previous = Date.parse(latest.updatedAt);
  const now = Date.now();
  const updated = {
    ...latest,
    activeGenerationId: generationId,
    activeSeparationId: null,
    activeMixId: null,
    updatedAt: new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString(),
  };
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated };
}

/** Rename a generation in the active profile's project metadata. */
export async function renameProjectGeneration({
  projectId, generationId, name, expectedUpdatedAt, env = process.env,
} = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof generationId !== 'string' || !GENERATION_ID_PATTERN.test(generationId)) {
    throw new Error('Identifiant de prise invalide.');
  }
  if (typeof name !== 'string') throw new Error('Le nom de la prise doit être une chaîne.');
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de renommer une prise.');
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const generations = await projectSubdirectory(canonicalFolder, 'generations');
  if (!generations) throw new Error(`Génération introuvable : ${generationId}`);
  const generationFolder = path.join(generations, generationId);
  const generationInfo = await lstat(generationFolder).catch(error => {
    if (error?.code === 'ENOENT') throw new Error(`Génération introuvable : ${generationId}`);
    throw error;
  });
  const canonicalGeneration = await realpath(generationFolder);
  if (generationInfo.isSymbolicLink() || !generationInfo.isDirectory() ||
      !isWithin(generations, canonicalGeneration)) {
    throw new Error('Le dossier de la génération est invalide ou se trouve hors du projet.');
  }
  const request = await readJsonInside(canonicalGeneration, 'request.json', 'request.json');
  if (!request || request.id !== generationId) throw new Error(`Génération introuvable ou invalide : ${generationId}`);

  const latest = await readProjectAt(store.root, projectId);
  if (latest.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const generationNames = latest.generationNames && typeof latest.generationNames === 'object' &&
    !Array.isArray(latest.generationNames) ? { ...latest.generationNames } : {};
  const trimmed = name.trim();
  if (trimmed) generationNames[generationId] = trimmed;
  else delete generationNames[generationId];

  const previous = Date.parse(latest.updatedAt);
  const now = Date.now();
  const updated = {
    ...latest,
    generationNames,
    updatedAt: new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString(),
  };
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated };
}

/** Activate a saved separation and its associated initial mix. */
export async function useProjectSeparation({
  projectId, separationId, expectedUpdatedAt, env = process.env,
} = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof separationId !== 'string' || !SEPARATION_ID_PATTERN.test(separationId)) {
    throw new Error('Identifiant de séparation invalide.');
  }
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de sélectionner une séparation.');
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }

  const versions = await listProjectVersions({ projectId, env });
  if (versions.profileId !== store.profileId) {
    throw new Error('Le profil actif a changé pendant la sélection. Relis le projet avant de réessayer.');
  }
  const separation = versions.separations.find(item => item.id === separationId);
  if (!separation) throw new Error(`Séparation introuvable ou invalide : ${separationId}`);
  if (!separation.mixId) throw new Error(`Mix associé introuvable pour ${separationId}`);
  const selected = await getProjectMix({ projectId, mixId: separation.mixId, env });
  if (selected.profileId !== store.profileId || selected.mix.separationId !== separationId) {
    throw new Error(`Mix associé introuvable ou invalide pour ${separationId}`);
  }

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const latest = await readProjectAt(store.root, projectId);
  if (latest.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const previous = Date.parse(latest.updatedAt);
  const now = Date.now();
  const updated = {
    ...latest,
    activeSeparationId: separationId,
    activeMixId: selected.mixId,
    updatedAt: new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString(),
  };
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated, mix: selected.mix };
}

/** Select a saved mix and keep its associated separation selection in sync. */
export async function useProjectMix({
  projectId, mixId, expectedUpdatedAt, env = process.env,
} = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof mixId !== 'string' || !MIX_ID_PATTERN.test(mixId)) {
    throw new Error('Identifiant de mix invalide.');
  }
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de sélectionner un mix.');
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }

  const selected = await getProjectMix({ projectId, mixId, env });
  if (selected.profileId !== store.profileId) {
    throw new Error('Le profil actif a changé pendant la sélection. Relis le projet avant de réessayer.');
  }
  const versions = await listProjectVersions({ projectId, env });
  if (versions.profileId !== store.profileId) {
    throw new Error('Le profil actif a changé pendant la sélection. Relis le projet avant de réessayer.');
  }
  const associatedSeparation = versions.separations.find(item =>
    item.id === selected.mix.separationId,
  );

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const latest = await readProjectAt(store.root, projectId);
  if (latest.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const previous = Date.parse(latest.updatedAt);
  const now = Date.now();
  const updated = {
    ...latest,
    activeMixId: mixId,
    activeSeparationId: associatedSeparation?.id ?? null,
    updatedAt: new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString(),
  };
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated, mix: selected.mix };
}

/** Select a saved score version as the active project score. */
export async function useProjectScore({
  projectId, scoreId, expectedUpdatedAt, env = process.env,
} = {}) {
  if (typeof projectId !== 'string') throw new Error('Identifiant de projet requis.');
  if (typeof scoreId !== 'string' || !SCORE_ID_PATTERN.test(scoreId)) {
    throw new Error('Identifiant de partition invalide.');
  }
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim()) {
    throw new Error('expectedUpdatedAt est requis : relis le projet avant de sélectionner une partition.');
  }

  const store = await projectStore(env);
  const project = await readProjectAt(store.root, projectId);
  if (project.schema !== 'songmaker.project' || project.schemaVersion !== 1) {
    throw new Error('Version de projet non prise en charge ; aucune modification effectuée.');
  }
  if (project.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const selected = await getProjectScore({ projectId, scoreId, env });
  if (selected.profileId !== store.profileId) {
    throw new Error('Le profil actif a changé pendant la sélection. Relis le projet avant de réessayer.');
  }

  const canonicalRoot = await realpath(store.root);
  const folder = path.join(store.root, projectId);
  const folderInfo = await lstat(folder);
  const canonicalFolder = await realpath(folder);
  if (folderInfo.isSymbolicLink() || !folderInfo.isDirectory() || !isWithin(canonicalRoot, canonicalFolder)) {
    throw new Error('Le dossier du projet est invalide ou se trouve hors du profil Song Maker actif.');
  }
  const latest = await readProjectAt(store.root, projectId);
  if (latest.updatedAt !== expectedUpdatedAt) {
    throw new Error('Le projet a changé depuis sa dernière lecture. Relis-le avant de réessayer.');
  }
  const previous = Date.parse(latest.updatedAt);
  const now = Date.now();
  const updated = {
    ...latest,
    activeScoreId: scoreId,
    updatedAt: new Date(Number.isFinite(previous) && now <= previous ? previous + 1 : now).toISOString(),
  };
  await writeProjectAtomically(canonicalFolder, updated);
  return { profileId: store.profileId, project: updated, score: selected.score };
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

async function writeJsonAtomically(file, document, tempName) {
  const temp = path.join(path.dirname(file), tempName);
  try {
    await writeFile(temp, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

async function writeJsonExclusive(file, document, tempName) {
  const temp = path.join(path.dirname(file), tempName);
  try {
    await writeFile(temp, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await link(temp, file);
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
