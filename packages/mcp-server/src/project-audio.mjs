import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { inspectWav } from './audio-quality.mjs';
import { publishExclusive, insideWorkspace, workspaceRoot as defaultWorkspaceRoot } from './runtime.mjs';
import { resolveGeneratedAudio } from './projects.mjs';

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  );
}

function safeWavName(value, fallback) {
  const name = value ?? fallback;
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() ||
      name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
      !name.toLowerCase().endsWith('.wav') || [...name].length > 180) {
    throw new Error('fileName doit être un nom de fichier WAV simple (180 caractères maximum).');
  }
  return name;
}

/** Copy a generated project WAV into the configured MCP workspace without overwriting files. */
export async function exportProjectAudio({
  projectId,
  generationId,
  outputDirectory,
  fileName,
  env = process.env,
  workspace = defaultWorkspaceRoot,
} = {}) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) {
    throw new Error('outputDirectory est requis.');
  }
  const source = await resolveGeneratedAudio({ projectId, generationId, env });
  const audio = await inspectWav(source.audioPath);

  const targetDirectory = insideWorkspace(outputDirectory, workspace);
  await mkdir(targetDirectory, { recursive: true });
  const canonicalWorkspace = await realpath(workspace);
  const canonicalDirectory = await realpath(targetDirectory);
  if (!isWithin(canonicalWorkspace, canonicalDirectory)) {
    throw new Error('Le dossier d’export doit rester dans SONG_MAKER_WORKSPACE_ROOT.');
  }

  const baseTitle = (source.generationName || source.projectTitle)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 140) || source.projectId;
  const destinationName = safeWavName(fileName, `${baseTitle}-${generationId}.wav`);
  const destination = path.join(canonicalDirectory, destinationName);
  const temporary = path.join(canonicalDirectory, `.song-maker-export-${randomUUID()}.tmp`);

  try {
    await copyFile(source.audioPath, temporary, constants.COPYFILE_EXCL);
    const copied = await stat(temporary);
    const original = await stat(source.audioPath);
    if (copied.size !== original.size) throw new Error('La copie WAV est incomplète.');
    await publishExclusive(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }

  return {
    profileId: source.profileId,
    projectId: source.projectId,
    generationId: source.generationId,
    format: 'wav',
    path: destination,
    bytes: (await stat(destination)).size,
    audio,
  };
}
