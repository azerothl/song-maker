import { randomUUID } from 'node:crypto';
import { open, lstat, mkdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { getProject, userLibraryStore } from './projects.mjs';

const emptyLibrary = () => ({ version: 1, tracks: [], playlists: [], updatedAt: null });
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);

function validateTitle(title, label) {
  if (typeof title !== 'string' || !title.trim() || [...title.trim()].length > 120) {
    throw new Error(`${label} : 1 à 120 caractères.`);
  }
  return title.trim();
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function validateLibrary(library) {
  if (library.version !== 1 || !Array.isArray(library.tracks) || !Array.isArray(library.playlists)) {
    throw new Error('Format de Bibliothèque Song Maker invalide.');
  }
  if (library.tracks.length > 10_000 || library.playlists.length > 1_000) {
    throw new Error('La Bibliothèque dépasse les limites autorisées.');
  }
  const playlistIds = new Set();
  for (const playlist of library.playlists) {
    if (!safeId(playlist.id) || !playlist.title?.trim() || [...playlist.title.trim()].length > 120 ||
        typeof playlist.createdAt !== 'string' || playlist.createdAt.length > 80) {
      throw new Error('Fiche de playlist invalide.');
    }
    if (playlistIds.has(playlist.id)) throw new Error('Identifiants de playlist en double.');
    playlistIds.add(playlist.id);
  }
  const trackKeys = new Set();
  for (const track of library.tracks) {
    if (!safeId(track.projectId) || !safeId(track.generationId) ||
        typeof track.title !== 'string' || !track.title.trim() || [...track.title.trim()].length > 120 ||
        typeof track.addedAt !== 'string' || track.addedAt.length > 80 || !Array.isArray(track.playlistIds)) {
      throw new Error('Fiche de morceau invalide dans la Bibliothèque.');
    }
    const key = `${track.projectId}\0${track.generationId}`;
    if (trackKeys.has(key)) throw new Error('Le même morceau apparaît plusieurs fois dans la Bibliothèque.');
    trackKeys.add(key);
    const memberships = new Set();
    for (const playlistId of track.playlistIds) {
      if (!playlistIds.has(playlistId) || memberships.has(playlistId)) {
        throw new Error('Playlist inconnue ou répétée pour un morceau.');
      }
      memberships.add(playlistId);
    }
  }
}

async function readLibrary(store) {
  let fileInfo;
  try {
    fileInfo = await lstat(store.filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyLibrary();
    throw new Error(`Lecture de la Bibliothèque impossible : ${error?.message || error}`);
  }
  if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
    throw new Error('Le fichier de Bibliothèque doit être un fichier local au profil actif.');
  }
  const canonicalRoot = await realpath(store.profileRoot);
  const canonicalFile = await realpath(store.filePath);
  if (!isWithin(canonicalRoot, canonicalFile)) {
    throw new Error('Le fichier de Bibliothèque se trouve hors du profil Song Maker actif.');
  }
  let library;
  try {
    library = JSON.parse(await readFile(canonicalFile, 'utf8'));
  } catch (error) {
    throw new Error(`Le fichier de Bibliothèque est invalide : ${error?.message || error}`);
  }
  const normalized = {
    ...library,
    tracks: library.tracks.map(track => ({
      ...track, playlistIds: Array.isArray(track.playlistIds) ? track.playlistIds : [],
    })),
    updatedAt: typeof library.updatedAt === 'string' ? library.updatedAt : '',
  };
  validateLibrary(normalized);
  return normalized;
}

async function withLibraryLock(filePath, callback) {
  const lockPath = `${filePath}.lock`;
  await mkdir(path.dirname(filePath), { recursive: true });
  let handle;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(lockPath, 'wx');
      await handle.writeFile(`pid=${process.pid} time=${new Date().toISOString()}\n`, 'utf8');
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw new Error(`Verrouillage de la Bibliothèque impossible : ${error?.message || error}`);
      let stale = false;
      try {
        const lockStat = await stat(lockPath);
        stale = Date.now() - lockStat.mtimeMs > 300_000;
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
      }
      if (stale && attempt === 0) {
        await rm(lockPath, { force: true });
        continue;
      }
      throw new Error('La Bibliothèque est en cours de modification. Réessaie dans un instant.');
    }
  }
  if (!handle) throw new Error('La Bibliothèque est en cours de modification. Réessaie dans un instant.');
  try {
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await rm(lockPath, { force: true }).catch(() => {});
  }
}

async function writeLibrary(store, library, expectedUpdatedAt) {
  return withLibraryLock(store.filePath, async () => {
    const current = await readLibrary(store);
    const actualRevision = current.updatedAt || null;
    if (actualRevision !== expectedUpdatedAt) {
      throw new Error('La Bibliothèque a changé. Recharge-la avant de réessayer.');
    }
    const next = structuredClone(library);
    next.updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt || '') + 1 || 0)).toISOString();
    validateLibrary(next);
    const tempPath = path.join(path.dirname(store.filePath), `.user-library-${randomUUID()}.tmp`);
    try {
      const temp = await open(tempPath, 'wx');
      try { await temp.writeFile(`${JSON.stringify(next, null, 2)}\n`, 'utf8'); }
      finally { await temp.close(); }
      await rename(tempPath, store.filePath);
    } finally {
      await rm(tempPath, { force: true }).catch(() => {});
    }
    return next;
  });
}

export async function listUserLibrary({ env = process.env } = {}) {
  const store = await userLibraryStore(env);
  return { profileId: store.profileId, ...(await readLibrary(store)) };
}

export async function createUserPlaylist({ title, expectedUpdatedAt, env = process.env } = {}) {
  if (expectedUpdatedAt !== null && typeof expectedUpdatedAt !== 'string') {
    throw new Error('expectedUpdatedAt doit venir de list_library.');
  }
  const store = await userLibraryStore(env);
  const current = await readLibrary(store);
  const next = {
    ...current,
    playlists: [...current.playlists, {
      id: randomUUID(), title: validateTitle(title, 'Nom de playlist'), createdAt: new Date().toISOString(),
    }],
  };
  return { profileId: store.profileId, ...(await writeLibrary(store, next, expectedUpdatedAt)) };
}

export async function deleteUserPlaylist({ playlistId, expectedUpdatedAt, confirm, env = process.env } = {}) {
  if (confirm !== true) throw new Error('Confirme la suppression avec confirm=true.');
  const store = await userLibraryStore(env);
  const current = await readLibrary(store);
  if (!current.playlists.some(playlist => playlist.id === playlistId)) throw new Error('Playlist introuvable.');
  const next = {
    ...current,
    playlists: current.playlists.filter(playlist => playlist.id !== playlistId),
    tracks: current.tracks.map(track => ({
      ...track, playlistIds: track.playlistIds.filter(id => id !== playlistId),
    })),
  };
  return { profileId: store.profileId, ...(await writeLibrary(store, next, expectedUpdatedAt)) };
}

async function hasProjectAudio(projectsRoot, projectId, generationId) {
  if (!safeId(projectId) || !safeId(generationId)) throw new Error('Identifiant de projet ou de prise invalide.');
  const root = await realpath(projectsRoot);
  const projectFolder = await realpath(path.join(projectsRoot, projectId));
  if (!isWithin(root, projectFolder)) throw new Error('Le projet se trouve hors du profil Song Maker actif.');
  const generationFolder = await realpath(path.join(projectFolder, 'generations', generationId));
  if (!isWithin(projectFolder, generationFolder)) throw new Error('La prise se trouve hors du dossier projet.');
  const audioPath = await realpath(path.join(generationFolder, 'audio.wav'));
  if (!isWithin(generationFolder, audioPath) || !(await stat(audioPath)).isFile()) {
    throw new Error('Le fichier audio de cette prise est introuvable.');
  }
}

export async function addLibraryTrack({ projectId, generationId, expectedUpdatedAt, env = process.env } = {}) {
  const store = await userLibraryStore(env);
  await hasProjectAudio(store.projectsRoot, projectId, generationId);
  const projectResult = await getProject({ projectId, env });
  const current = await readLibrary(store);
  if (current.tracks.some(track => track.projectId === projectId && track.generationId === generationId)) {
    throw new Error('Ce morceau est déjà dans la Bibliothèque.');
  }
  const title = projectResult.project.generationNames?.[generationId] || projectResult.project.title;
  const next = {
    ...current,
    tracks: [...current.tracks, {
      projectId, generationId, title, addedAt: new Date().toISOString(), playlistIds: [],
    }],
  };
  return { profileId: store.profileId, ...(await writeLibrary(store, next, expectedUpdatedAt)) };
}

export async function removeLibraryTrack({ projectId, generationId, expectedUpdatedAt, confirm, env = process.env } = {}) {
  if (confirm !== true) throw new Error('Confirme le retrait avec confirm=true.');
  const store = await userLibraryStore(env);
  const current = await readLibrary(store);
  if (!current.tracks.some(track => track.projectId === projectId && track.generationId === generationId)) {
    throw new Error('Morceau introuvable dans la Bibliothèque.');
  }
  const next = {
    ...current,
    tracks: current.tracks.filter(track => track.projectId !== projectId || track.generationId !== generationId),
  };
  return { profileId: store.profileId, ...(await writeLibrary(store, next, expectedUpdatedAt)) };
}

async function changePlaylistMembership({ projectId, generationId, playlistId, expectedUpdatedAt, add, env }) {
  const store = await userLibraryStore(env);
  const current = await readLibrary(store);
  const trackIndex = current.tracks.findIndex(track => track.projectId === projectId && track.generationId === generationId);
  if (trackIndex < 0) throw new Error('Morceau introuvable dans la Bibliothèque.');
  if (!current.playlists.some(playlist => playlist.id === playlistId)) throw new Error('Playlist introuvable.');
  const tracks = [...current.tracks];
  const track = tracks[trackIndex];
  const hasMembership = track.playlistIds.includes(playlistId);
  if (add && !hasMembership) tracks[trackIndex] = { ...track, playlistIds: [...track.playlistIds, playlistId] };
  if (!add && hasMembership) tracks[trackIndex] = { ...track, playlistIds: track.playlistIds.filter(id => id !== playlistId) };
  return { profileId: store.profileId, ...(await writeLibrary(store, { ...current, tracks }, expectedUpdatedAt)) };
}

export async function addTrackToPlaylist(args) {
  return changePlaylistMembership({ ...args, add: true });
}

export async function removeTrackFromPlaylist(args) {
  return changePlaylistMembership({ ...args, add: false });
}
