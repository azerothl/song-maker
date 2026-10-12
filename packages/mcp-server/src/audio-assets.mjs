import { constants, createReadStream } from 'node:fs';
import { copyFile, link, lstat, mkdir, realpath, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectWav } from './audio-quality.mjs';
import { insideWorkspace, wavDurationMs, workspaceRoot as defaultWorkspaceRoot } from './runtime.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function ffmpegCandidates(env) {
  const absoluteCandidates = [];
  if (env.SONG_MAKER_FFMPEG?.trim()) absoluteCandidates.push(path.resolve(env.SONG_MAKER_FFMPEG.trim()));
  if (process.platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    absoluteCandidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'));
    absoluteCandidates.push(path.join(local, 'song-maker', 'bin', 'ffmpeg.exe'));
    for (const programFiles of [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)) {
      absoluteCandidates.push(path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'));
      absoluteCandidates.push(path.join(programFiles, 'FFmpeg', 'bin', 'ffmpeg.exe'));
    }
    absoluteCandidates.push(path.join(here, '..', '..', '..', 'src-tauri', 'resources', 'ffmpeg.exe'));
  }
  return [...new Set([...absoluteCandidates, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'])];
}

export async function resolveFfmpeg(env) {
  for (const candidate of ffmpegCandidates(env)) {
    if (path.isAbsolute(candidate)) {
      try {
        const info = await stat(candidate);
        if (info.isFile()) return candidate;
      } catch { /* try the next known location */ }
    } else {
      return candidate;
    }
  }
  throw new Error('FFmpeg est introuvable. Installe-le ou définis SONG_MAKER_FFMPEG vers son exécutable.');
}

function normalizeToProjectWav(ffmpeg, input, output) {
  return new Promise((resolve, reject) => {
    const args = [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', input,
      '-vn', '-af', 'aresample=resampler=soxr:precision=28:osr=48000',
      '-ac', '2', '-c:a', 'pcm_f32le', output,
    ];
    const child = spawn(ffmpeg, args, { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4000); });
    const timer = setTimeout(() => child.kill(), 20 * 60 * 1000);
    timer.unref?.();
    child.once('error', error => {
      clearTimeout(timer);
      reject(error.code === 'ENOENT'
        ? new Error('FFmpeg est introuvable. Installe-le ou définis SONG_MAKER_FFMPEG vers son exécutable.')
        : new Error(`Impossible de lancer FFmpeg : ${error.message}`));
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(stderr.trim()
        ? `Import audio impossible avec FFmpeg : ${stderr.trim()}`
        : `FFmpeg a interrompu la normalisation (code ${code ?? 'inconnu'}).`));
    });
  });
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function publishExclusive(temporary, destination) {
  try {
    await link(temporary, destination);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`Un fichier existe déjà : ${destination}`);
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function writeJsonExclusive(filePath, value) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await publishExclusive(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

/** Preserve an original audio file and produce the same 48 kHz stereo float WAV used by the app. */
export async function prepareUserAudioAsset({
  folder, sourcePath, displayName, env = process.env, workspace = defaultWorkspaceRoot,
} = {}) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('sourcePath est requis.');
  const sourceAbsolute = insideWorkspace(sourcePath, workspace);
  const canonicalWorkspace = await realpath(workspace);
  const sourceInfo = await lstat(sourceAbsolute);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
    throw new Error('Le fichier audio doit être un fichier normal, pas un lien symbolique.');
  }
  if (sourceInfo.size === 0) throw new Error('Fichier audio vide — import impossible.');
  const sourceRealPath = await realpath(sourceAbsolute);
  if (!isWithin(canonicalWorkspace, sourceRealPath)) {
    throw new Error('Le fichier source doit rester dans SONG_MAKER_WORKSPACE_ROOT.');
  }
  const ext = path.extname(sourceRealPath).slice(1).toLowerCase();
  if (!['wav', 'mp3', 'flac'].includes(ext)) {
    throw new Error('Format non pris en charge. Formats acceptés : WAV, MP3, FLAC.');
  }
  const cleanName = typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : path.basename(sourceRealPath, path.extname(sourceRealPath));
  if (!cleanName || [...cleanName].length > 120 || /[\x00-\x1f]/.test(cleanName)) {
    throw new Error('name doit contenir de 1 à 120 caractères imprimables.');
  }

  const assetId = randomUUID();
  const audioRoot = path.join(folder, 'user-audio');
  const originalsDirectory = path.join(audioRoot, 'originals');
  const normalizedDirectory = path.join(audioRoot, 'normalized');
  const provenanceDirectory = path.join(audioRoot, 'provenance');
  const originalRelativePath = `user-audio/originals/${assetId}.${ext}`;
  const normalizedRelativePath = `user-audio/normalized/${assetId}.wav`;
  const originalPath = path.join(folder, originalRelativePath);
  const normalizedPath = path.join(folder, normalizedRelativePath);
  const temporaryWav = path.join(normalizedDirectory, `.import-${assetId}.tmp.wav`);
  const provenancePath = path.join(provenanceDirectory, `${assetId}.json`);
  let originalCreated = false;
  let normalizedCreated = false;
  let provenanceCreated = false;
  try {
    await Promise.all([
      mkdir(originalsDirectory, { recursive: true }),
      mkdir(normalizedDirectory, { recursive: true }),
      mkdir(provenanceDirectory, { recursive: true }),
    ]);
    const canonicalProject = await realpath(folder);
    for (const directory of [originalsDirectory, normalizedDirectory, provenanceDirectory]) {
      const info = await lstat(directory);
      const canonicalDirectory = await realpath(directory);
      if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(canonicalProject, canonicalDirectory)) {
        throw new Error('Le dossier user-audio doit rester dans le projet Song Maker.');
      }
    }
    await copyFile(sourceRealPath, originalPath, constants.COPYFILE_EXCL);
    originalCreated = true;
    if ((await stat(originalPath)).size !== sourceInfo.size) throw new Error('La copie de l’original audio est incomplète.');
    const ffmpeg = await resolveFfmpeg(env);
    await normalizeToProjectWav(ffmpeg, originalPath, temporaryWav);
    const temporaryInfo = await stat(temporaryWav);
    if (!temporaryInfo.isFile() || temporaryInfo.size === 0) throw new Error('FFmpeg n’a produit aucun WAV exploitable.');
    const audio = await inspectWav(temporaryWav);
    if (audio.sampleRateHz !== 48_000 || audio.channels !== 2 || audio.bitDepth !== 32) {
      throw new Error('La normalisation doit produire un WAV float32 stéréo à 48 kHz.');
    }
    const durationMs = await wavDurationMs(temporaryWav);
    if (!durationMs || durationMs <= 0) throw new Error('Durée nulle après normalisation — fichier rejeté.');
    const sha256 = await sha256File(temporaryWav);
    await publishExclusive(temporaryWav, normalizedPath);
    normalizedCreated = true;
    await writeJsonExclusive(provenancePath, {
      schema: 'songmaker.userAudio', schemaVersion: 1, id: assetId, displayName: cleanName,
      originalRelativePath, normalizedRelativePath, sourceFileName: path.basename(sourceRealPath),
      sha256, durationMs, importedAt: new Date().toISOString(),
    });
    provenanceCreated = true;
    return {
      assetId, displayName: cleanName, originalRelativePath, normalizedRelativePath,
      sha256, durationMs, sourceFileName: path.basename(sourceRealPath),
    };
  } catch (error) {
    await Promise.all([
      rm(temporaryWav, { force: true }),
      ...(originalCreated ? [rm(originalPath, { force: true })] : []),
      ...(normalizedCreated ? [rm(normalizedPath, { force: true })] : []),
      ...(provenanceCreated ? [rm(provenancePath, { force: true })] : []),
    ]);
    throw error;
  }
}

export async function discardUserAudioAsset(folder, asset) {
  if (!folder || !asset?.assetId) return;
  await Promise.all([
    rm(path.join(folder, asset.normalizedRelativePath), { force: true }),
    rm(path.join(folder, asset.originalRelativePath), { force: true }),
    rm(path.join(folder, 'user-audio', 'provenance', `${asset.assetId}.json`), { force: true }),
  ]);
}
