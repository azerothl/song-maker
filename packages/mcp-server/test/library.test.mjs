import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  addLibraryTrack, addTrackToPlaylist, createUserPlaylist, deleteUserPlaylist,
  listUserLibrary, removeLibraryTrack, removeTrackFromPlaylist,
} from '../src/library.mjs';

test('MCP Library keeps only selected audio takes and protects destructive edits', async () => {
  const documentsRoot = await mkdtemp(path.join(os.tmpdir(), 'song-maker-library-'));
  const env = { SONG_MAKER_DOCUMENTS_DIR: documentsRoot };
  const projectId = 'project-001';
  const generationId = 'gen-001';
  const projectsRoot = path.join(documentsRoot, 'profiles', 'profile-001', 'projects');
  const projectFolder = path.join(projectsRoot, projectId);
  const generationFolder = path.join(projectFolder, 'generations', generationId);
  try {
    await mkdir(generationFolder, { recursive: true });
    await writeFile(path.join(documentsRoot, 'profiles.json'), JSON.stringify({ activeProfileId: 'profile-001' }));
    await writeFile(path.join(projectFolder, 'project.json'), JSON.stringify({
      schema: 'songmaker.project', schemaVersion: 1, id: projectId, title: 'Blue Hour',
      createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
      style: 'Dream pop', lyrics: '', cot: 'full', generationNames: { [generationId]: 'Blue Hour — Take 1' },
    }));
    await writeFile(path.join(generationFolder, 'audio.wav'), 'temporary audio artifact');

    const empty = await listUserLibrary({ env });
    assert.equal(empty.profileId, 'profile-001');
    assert.equal(empty.updatedAt, null);
    assert.deepEqual(empty.tracks, []);
    const saved = await addLibraryTrack({ projectId, generationId, expectedUpdatedAt: null, env });
    assert.equal(saved.tracks.length, 1);
    assert.equal(saved.tracks[0].title, 'Blue Hour — Take 1');
    assert.ok(saved.updatedAt);
    await assert.rejects(addLibraryTrack({
      projectId, generationId, expectedUpdatedAt: saved.updatedAt, env,
    }), /déjà dans la Bibliothèque/);

    const playlistState = await createUserPlaylist({
      title: 'Evening set', expectedUpdatedAt: saved.updatedAt, env,
    });
    const playlist = playlistState.playlists[0];
    await assert.rejects(deleteUserPlaylist({
      playlistId: playlist.id, expectedUpdatedAt: playlistState.updatedAt, confirm: false, env,
    }), /confirm=true/);
    const membership = await addTrackToPlaylist({
      projectId, generationId, playlistId: playlist.id,
      expectedUpdatedAt: playlistState.updatedAt, env,
    });
    assert.deepEqual(membership.tracks[0].playlistIds, [playlist.id]);
    const detached = await removeTrackFromPlaylist({
      projectId, generationId, playlistId: playlist.id,
      expectedUpdatedAt: membership.updatedAt, env,
    });
    assert.deepEqual(detached.tracks[0].playlistIds, []);
    const deleted = await deleteUserPlaylist({
      playlistId: playlist.id, expectedUpdatedAt: detached.updatedAt, confirm: true, env,
    });
    assert.equal(deleted.playlists.length, 0);
    await assert.rejects(removeLibraryTrack({
      projectId, generationId, expectedUpdatedAt: deleted.updatedAt, confirm: false, env,
    }), /confirm=true/);
    const removed = await removeLibraryTrack({
      projectId, generationId, expectedUpdatedAt: deleted.updatedAt, confirm: true, env,
    });
    assert.equal(removed.tracks.length, 0);
    await assert.rejects(addLibraryTrack({
      projectId: '../outside', generationId, expectedUpdatedAt: removed.updatedAt, env,
    }), /Identifiant de projet ou de prise invalide/);
  } finally {
    await rm(documentsRoot, { recursive: true, force: true });
  }
});
