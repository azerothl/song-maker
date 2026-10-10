import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, realpath, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { resolveFfmpeg } from './audio-assets.mjs';
import { inspectWav } from './audio-quality.mjs';
import { publishExclusive, insideWorkspace, workspaceRoot as defaultWorkspaceRoot } from './runtime.mjs';
import { resolveGeneratedAudio } from './projects.mjs';

const AUDIO_FORMATS = new Set(['wav', 'flac', 'mp3']);

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  );
}

function safeAudioName(value, fallback, format) {
  const name = value ?? fallback;
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() ||
      name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
      path.extname(name).toLowerCase() !== `.${format}` || [...name].length > 180) {
    throw new Error(`fileName doit être un nom de fichier ${format.toUpperCase()} simple (180 caractères maximum).`);
  }
  return name;
}

function runFfmpeg(ffmpeg, args, purpose) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let timedOut = false;
    let settled = false;
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-4000); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 20 * 60 * 1000);
    timer.unref?.();
    child.once('error', error => {
      clearTimeout(timer);
      settled = true;
      reject(error.code === 'ENOENT'
        ? new Error('FFmpeg est introuvable. Installe-le ou définis SONG_MAKER_FFMPEG vers son exécutable.')
        : new Error(`Impossible de lancer FFmpeg : ${error.message}`));
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (settled) return;
      if (timedOut) return reject(new Error(`FFmpeg a dépassé la durée autorisée pendant ${purpose}.`));
      if (code === 0) return resolve();
      reject(new Error(stderr.trim()
        ? `${purpose} impossible avec FFmpeg : ${stderr.trim()}`
        : `FFmpeg a interrompu ${purpose} (code ${code ?? 'inconnu'}).`));
    });
  });
}

function encodeArgs(source, temporary, format, bitDepth, bitrateKbps) {
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-n', '-i', source, '-map', '0:a:0', '-vn'];
  if (format === 'wav') {
    args.push('-c:a', bitDepth === 16 ? 'pcm_s16le' : 'pcm_s24le');
  } else if (format === 'flac') {
    args.push('-c:a', 'flac', '-sample_fmt', bitDepth === 16 ? 's16' : 's32');
  } else {
    args.push('-c:a', 'libmp3lame', '-b:a', `${bitrateKbps}k`);
  }
  args.push('-f', format, temporary);
  return args;
}

async function verifyEncodedAudio(ffmpeg, filePath) {
  await runFfmpeg(ffmpeg, [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-xerror', '-i', filePath,
    '-map', '0:a:0', '-f', 'null', '-',
  ], 'la vérification de l’export audio');
}

/** Export a generated project audio file into the configured MCP workspace without overwriting files. */
export async function exportProjectAudio({
  projectId,
  generationId,
  outputDirectory,
  fileName,
  format = 'wav',
  bitDepth,
  bitrateKbps,
  env = process.env,
  workspace = defaultWorkspaceRoot,
} = {}) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) {
    throw new Error('outputDirectory est requis.');
  }
  if (!AUDIO_FORMATS.has(format)) throw new Error('Format non pris en charge. Formats acceptés : WAV, FLAC, MP3.');
  if (bitDepth !== undefined && ![16, 24].includes(bitDepth)) {
    throw new Error('bitDepth doit valoir 16 ou 24.');
  }
  if (format === 'mp3' && bitDepth !== undefined) throw new Error('bitDepth ne s’applique pas au format MP3.');
  if (format !== 'mp3' && bitrateKbps !== undefined) throw new Error('bitrateKbps ne s’applique qu’au format MP3.');
  const selectedBitDepth = bitDepth ?? 24;
  const selectedBitrate = bitrateKbps ?? 320;
  if (format === 'mp3' && ![128, 192, 320].includes(selectedBitrate)) {
    throw new Error('bitrateKbps doit valoir 128, 192 ou 320.');
  }

  const source = await resolveGeneratedAudio({ projectId, generationId, env });
  const sourceAudio = await inspectWav(source.audioPath);

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
  const destinationName = safeAudioName(fileName, `${baseTitle}-${generationId}.${format}`, format);
  const destination = path.join(canonicalDirectory, destinationName);
  const temporary = path.join(canonicalDirectory, `.song-maker-export-${randomUUID()}.${format}`);
  const shouldEncode = format !== 'wav' || bitDepth !== undefined;

  try {
    if (!shouldEncode) {
      await copyFile(source.audioPath, temporary, constants.COPYFILE_EXCL);
    } else {
      const ffmpeg = await resolveFfmpeg(env);
      const outputBitDepth = format === 'wav' || format === 'flac' ? selectedBitDepth : undefined;
      await runFfmpeg(ffmpeg, encodeArgs(source.audioPath, temporary, format, outputBitDepth, selectedBitrate), 'l’export audio');
      await verifyEncodedAudio(ffmpeg, temporary);
    }
    const outputInfo = await stat(temporary);
    if (!outputInfo.isFile() || outputInfo.size === 0) throw new Error('FFmpeg n’a produit aucun fichier audio exploitable.');
    if (format === 'wav') {
      const outputAudio = await inspectWav(temporary);
      if (outputAudio.sampleRateHz !== sourceAudio.sampleRateHz || outputAudio.channels !== sourceAudio.channels) {
        throw new Error('L’export WAV a modifié la fréquence ou le nombre de canaux de la source.');
      }
    }
    await publishExclusive(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }

  return {
    profileId: source.profileId,
    projectId: source.projectId,
    generationId: source.generationId,
    format,
    path: destination,
    bytes: (await stat(destination)).size,
    audio: sourceAudio,
    delivery: {
      format,
      ...(format === 'mp3' ? { bitrateKbps: selectedBitrate } : { bitDepth: format === 'wav' && bitDepth === undefined ? sourceAudio.bitDepth : selectedBitDepth }),
      sampleRateHz: sourceAudio.sampleRateHz,
      channels: sourceAudio.channels,
    },
  };
}
