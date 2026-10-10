import { constants, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  createMixProductionToolkit,
  placeClipsOnTimeline,
  renderMixOffline,
  validateRoutingGraph,
} from '@song-maker/mix-production';
import { resolveFfmpeg } from './audio-assets.mjs';
import { inspectWav } from './audio-quality.mjs';
import { publishExclusive, insideWorkspace, workspaceRoot as defaultWorkspaceRoot } from './runtime.mjs';
import { getProjectMix, resolveGeneratedAudio, resolveProjectMixRenderInputs, resolveProjectSeparationStems } from './projects.mjs';

const AUDIO_FORMATS = new Set(['wav', 'flac', 'mp3']);
const MAX_RENDER_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_RENDER_MEMORY_ESTIMATE_BYTES = 512 * 1024 * 1024;
const UI_EFFECT_KINDS = new Set([
  'limiter', 'compressor', 'gate', 'eq', 'parametricEq', 'filter', 'delay',
  'reverb', 'pitch_correct', 'voice_cleanup', 'voice_convert', 'voice_denoise',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateAutomationPoints(points, label) {
  if (!Array.isArray(points) || points.length > 100_000 || points.some(point =>
    !isRecord(point) || !Number.isFinite(point.timeMs) || point.timeMs < 0 || !Number.isFinite(point.value))) {
    throw new Error(`Les points d’automation de ${label} sont invalides.`);
  }
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

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

/** Export validated stems from an existing separation without starting another job. */
export async function exportProjectStems({
  projectId,
  separationId,
  outputDirectory,
  roles,
  env = process.env,
  workspace = defaultWorkspaceRoot,
} = {}) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) {
    throw new Error('outputDirectory est requis.');
  }
  if (roles !== undefined && (!Array.isArray(roles) || roles.length < 1 || roles.length > 6 ||
      roles.some(role => typeof role !== 'string') || new Set(roles).size !== roles.length)) {
    throw new Error('roles doit contenir 1 à 6 rôles distincts parmi vocals, drums, bass, other, guitar, piano.');
  }

  const separation = await resolveProjectSeparationStems({ projectId, separationId, env });
  const selectedRoles = roles ?? separation.stems.map(stem => stem.role);
  const unknownRoles = selectedRoles.filter(role => !['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'].includes(role));
  if (unknownRoles.length) throw new Error(`Rôle de stem non pris en charge : ${unknownRoles.join(', ')}.`);
  const stemsByRole = new Map(separation.stems.map(stem => [stem.role, stem]));
  const selected = selectedRoles.map(role => {
    const stem = stemsByRole.get(role);
    if (!stem) throw new Error(`Le rôle ${role} n’existe pas dans la séparation ${separationId}.`);
    return stem;
  });

  const targetDirectory = insideWorkspace(outputDirectory, workspace);
  await mkdir(targetDirectory, { recursive: true });
  const canonicalWorkspace = await realpath(workspace);
  const canonicalDirectory = await realpath(targetDirectory);
  if (!isWithin(canonicalWorkspace, canonicalDirectory)) {
    throw new Error('Le dossier d’export doit rester dans SONG_MAKER_WORKSPACE_ROOT.');
  }

  const baseTitle = separation.projectTitle
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120) || separation.projectId;
  const published = [];
  const temporaryFiles = [];
  try {
    for (const stem of selected) {
      const fileName = safeAudioName(
        `${baseTitle}-${separation.separationId}-${stem.role}.wav`,
        `${separation.projectId}-${separation.separationId}-${stem.role}.wav`,
        'wav',
      );
      const destination = path.join(canonicalDirectory, fileName);
      const temporary = path.join(canonicalDirectory, `.song-maker-stem-${randomUUID()}.wav`);
      temporaryFiles.push(temporary);
      await copyFile(stem.audioPath, temporary, constants.COPYFILE_EXCL);
      const outputAudio = await inspectWav(temporary);
      if (!outputAudio.durationSec || await sha256File(temporary) !== stem.sha256) {
        throw new Error(`La copie exportée du stem ${stem.role} est invalide.`);
      }
      await publishExclusive(temporary, destination);
      temporaryFiles.pop();
      published.push({
        role: stem.role,
        path: destination,
        bytes: (await stat(destination)).size,
        sha256: stem.sha256,
        audio: outputAudio,
      });
    }
  } catch (error) {
    await Promise.all(temporaryFiles.map(file => rm(file, { force: true }).catch(() => {})));
    await Promise.all(published.map(async file => {
      try {
        if (await sha256File(file.path) === file.sha256) await rm(file.path, { force: true });
      } catch {}
    }));
    throw error;
  }

  return {
    profileId: separation.profileId,
    projectId: separation.projectId,
    separationId: separation.separationId,
    generationId: separation.generationId,
    family: separation.family,
    warnings: separation.warnings,
    files: published,
  };
}

function decodePcmWav(bytes, expectedSampleRate) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Le rendu MCP prend en charge les clips WAV PCM ou float32 uniquement. Réimporte les autres formats dans le projet.');
  }

  let format = null;
  let channels = null;
  let sampleRate = null;
  let bitsPerSample = null;
  let blockAlign = null;
  let byteRate = null;
  let dataOffset = -1;
  let dataLength = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + length > bytes.length) throw new Error('Le WAV du projet est tronqué ou invalide.');
    if (id === 'fmt ' && length >= 16) {
      format = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      byteRate = bytes.readUInt32LE(start + 8);
      blockAlign = bytes.readUInt16LE(start + 12);
      bitsPerSample = bytes.readUInt16LE(start + 14);
    } else if (id === 'data') {
      dataOffset = start;
      dataLength = length;
    }
    offset = start + length + (length & 1);
  }
  if (!format || !channels || !sampleRate || !bitsPerSample || dataOffset < 0) {
    throw new Error('Le WAV du projet ne contient pas de format audio exploitable.');
  }
  if (![1, 3].includes(format) || ![1, 2].includes(channels) ||
      ![16, 24, 32].includes(bitsPerSample) || (format === 3 && bitsPerSample !== 32)) {
    throw new Error('Format WAV non pris en charge : 1 ou 2 canaux, PCM 16/24/32 bits ou float32 requis.');
  }
  if (sampleRate !== expectedSampleRate) {
    throw new Error(`Le clip est à ${sampleRate} Hz alors que le mix est à ${expectedSampleRate} Hz. Réimporte le clip pour le normaliser avant le rendu MCP.`);
  }
  const bytesPerSample = bitsPerSample / 8;
  const frameBytes = channels * bytesPerSample;
  if (blockAlign !== frameBytes || byteRate !== sampleRate * frameBytes) {
    throw new Error('Les métadonnées de trame ou de débit du WAV sont incohérentes.');
  }
  if (dataLength === 0 || dataLength % frameBytes !== 0) {
    throw new Error('Le WAV du projet ne contient aucune trame audio complète.');
  }

  const frames = dataLength / frameBytes;
  const left = new Float32Array(frames);
  const right = channels === 2 ? new Float32Array(frames) : left;
  const readSample = (offset) => {
    if (format === 3) return bytes.readFloatLE(offset);
    if (bitsPerSample === 16) return bytes.readInt16LE(offset) / 32768;
    if (bitsPerSample === 24) {
      let value = bytes.readUIntLE(offset, 3);
      if (value & 0x800000) value -= 0x1000000;
      return value / 8388608;
    }
    return bytes.readInt32LE(offset) / 2147483648;
  };
  for (let frame = 0; frame < frames; frame++) {
    const offset = dataOffset + frame * frameBytes;
    const l = readSample(offset);
    const r = channels === 2 ? readSample(offset + bytesPerSample) : l;
    if (!Number.isFinite(l) || !Number.isFinite(r)) throw new Error('Le WAV contient une valeur audio non finie.');
    left[frame] = l;
    if (channels === 2) right[frame] = r;
  }
  return { left, right, sampleRate, frames };
}

function clipPlacement(clip) {
  return {
    startMs: clip.startMs,
    offsetMs: clip.offsetMs,
    durationMs: clip.durationMs,
    fadeInMs: clip.fadeInMs ?? 0,
    fadeOutMs: clip.fadeOutMs ?? 0,
    gainDb: clip.gainDb ?? 0,
    takeActive: clip.takeActive,
    processingEnabled: clip.processingEnabled,
    followProjectTempo: clip.followProjectTempo,
    sourceTempoBpm: clip.sourceTempoBpm,
    timeStretchRatio: clip.timeStretchRatio,
    pitchSemitones: clip.pitchSemitones,
  };
}

function productionToolkit(mixId, overlay, mixTracks) {
  const toolkit = createMixProductionToolkit();
  if (!overlay) return { toolkit, routing: {} };
  if (!isRecord(overlay) || overlay.mixId !== mixId) throw new Error('Les réglages de production ne correspondent pas au mix.');

  for (const field of ['volumePointsByTrack', 'panPointsByTrack', 'automationLanes', 'effectsByTrack', 'trackGroupIds']) {
    if (overlay[field] !== undefined && !isRecord(overlay[field])) {
      throw new Error(`Le champ ${field} des réglages de production est invalide.`);
    }
  }
  for (const field of ['sidechainRoutes', 'buses', 'sends']) {
    if (overlay[field] !== undefined && !Array.isArray(overlay[field])) {
      throw new Error(`Le champ ${field} des réglages de production est invalide.`);
    }
  }
  for (const [trackId, groupId] of Object.entries(overlay.trackGroupIds ?? {})) {
    if (!trackId || (groupId !== null && typeof groupId !== 'string')) {
      throw new Error('Le routage de piste des réglages de production est invalide.');
    }
  }
  for (const bus of overlay.buses ?? []) {
    if (!isRecord(bus) || typeof bus.id !== 'string' || typeof bus.name !== 'string' ||
        !['group', 'aux'].includes(bus.kind) || !Number.isFinite(bus.gainDb) ||
        !Number.isFinite(bus.pan) || typeof bus.mute !== 'boolean' || typeof bus.solo !== 'boolean' ||
        (bus.parentGroupId !== undefined && bus.parentGroupId !== null && typeof bus.parentGroupId !== 'string')) {
      throw new Error('Le mix contient un bus invalide pour son rendu.');
    }
  }
  for (const send of overlay.sends ?? []) {
    if (!isRecord(send) || typeof send.id !== 'string' || typeof send.fromTrackId !== 'string' ||
        typeof send.toBusId !== 'string' || !Number.isFinite(send.gainDb) ||
        typeof send.preFader !== 'boolean' || typeof send.enabled !== 'boolean') {
      throw new Error('Le mix contient un send invalide pour son rendu.');
    }
  }

  for (const [trackId, points] of Object.entries(overlay.volumePointsByTrack ?? {})) {
    validateAutomationPoints(points, trackId);
    if (points.length) toolkit.automation.setLane(mixId, { trackId, target: 'volume', points });
  }
  for (const [trackId, points] of Object.entries(overlay.panPointsByTrack ?? {})) {
    validateAutomationPoints(points, trackId);
    if (points.length) toolkit.automation.setLane(mixId, { trackId, target: 'pan', points });
  }
  for (const [key, points] of Object.entries(overlay.automationLanes ?? {})) {
    const separator = key.indexOf('|');
    validateAutomationPoints(points, key);
    if (separator > 0 && points.length) {
      toolkit.automation.setLane(mixId, { trackId: key.slice(0, separator), target: key.slice(separator + 1), points });
    }
  }
  for (const [trackId, effects] of Object.entries(overlay.effectsByTrack ?? {})) {
    if (!Array.isArray(effects) || effects.length > 128) throw new Error(`Les effets de la piste ${trackId} sont invalides.`);
    for (const effect of effects) {
      if (!isRecord(effect) || typeof effect.id !== 'string' || !UI_EFFECT_KINDS.has(effect.kind) ||
          typeof effect.enabled !== 'boolean' ||
          (effect.params !== undefined && (!isRecord(effect.params) || Object.values(effect.params).some(value =>
            !['number', 'string', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))))) {
        throw new Error('Le mix contient un effet que le moteur de rendu MCP ne sait pas appliquer.');
      }
      toolkit.effects.insert(trackId, {
        id: effect.id,
        kind: effect.kind,
        enabled: effect.enabled === true,
        params: effect.params && typeof effect.params === 'object' && !Array.isArray(effect.params) ? effect.params : {},
      });
    }
  }
  for (const route of overlay.sidechainRoutes ?? []) {
    if (!isRecord(route) || typeof route.id !== 'string' || typeof route.sourceTrackId !== 'string' ||
        typeof route.destinationTrackId !== 'string' || !Number.isFinite(route.thresholdDb) ||
        !Number.isFinite(route.ratio) || typeof route.enabled !== 'boolean') {
      throw new Error('Le mix contient une route sidechain invalide.');
    }
    if (route.sourceTrackId !== route.destinationTrackId) toolkit.sidechain.upsert(mixId, route);
  }
  const routing = validateRoutingGraph({
    tracks: mixTracks.map(track => ({
      id: track.id,
      groupId: overlay.trackGroupIds?.[track.id] ?? null,
    })),
    buses: overlay.buses ?? [],
    sends: overlay.sends ?? [],
    trackGroupIds: overlay.trackGroupIds && typeof overlay.trackGroupIds === 'object' ? overlay.trackGroupIds : {},
  }).recovered;
  return { toolkit, routing };
}

function floatPcmToWav(pcm, sampleRate, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const dataLength = pcm.length * bytesPerSample;
  if (!Number.isSafeInteger(dataLength) || dataLength <= 0 || dataLength > 0xfffffff0) {
    throw new Error('Le rendu dépasse la taille WAV prise en charge.');
  }
  const wav = Buffer.allocUnsafe(44 + dataLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2 * bytesPerSample, 28);
  wav.writeUInt16LE(2 * bytesPerSample, 32);
  wav.writeUInt16LE(bitDepth, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataLength, 40);
  let cursor = 44;
  for (const raw of pcm) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(raw) ? raw : 0));
    if (bitDepth === 16) {
      wav.writeInt16LE(Math.round(sample < 0 ? sample * 32768 : sample * 32767), cursor);
    } else if (bitDepth === 24) {
      const value = Math.round(sample < 0 ? sample * 8388608 : sample * 8388607);
      wav.writeIntLE(value, cursor, 3);
    }
    cursor += bytesPerSample;
  }
  return wav;
}

/** Render the active or requested saved project mix with the shared offline DSP and export to the MCP workspace. */
export async function renderProjectMix({
  projectId,
  mixId,
  outputDirectory,
  fileName,
  format = 'wav',
  bitDepth,
  bitrateKbps,
  env = process.env,
  workspace = defaultWorkspaceRoot,
} = {}) {
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw new Error('outputDirectory est requis.');
  if (!AUDIO_FORMATS.has(format)) throw new Error('Format non pris en charge. Formats acceptés : WAV, FLAC, MP3.');
  if (bitDepth !== undefined && ![16, 24].includes(bitDepth)) throw new Error('bitDepth doit valoir 16 ou 24.');
  if (format === 'mp3' && bitDepth !== undefined) throw new Error('bitDepth ne s’applique pas au format MP3.');
  if (format !== 'mp3' && bitrateKbps !== undefined) throw new Error('bitrateKbps ne s’applique qu’au format MP3.');
  const selectedBitDepth = bitDepth ?? 24;
  const selectedBitrate = bitrateKbps ?? 320;
  if (format === 'mp3' && ![128, 192, 320].includes(selectedBitrate)) throw new Error('bitrateKbps doit valoir 128, 192 ou 320.');

  const source = await resolveProjectMixRenderInputs({ projectId, mixId, env });
  const mix = source.mix;
  if (mix.vst3MasterInsert?.enabled === true) {
    throw new Error('Le mix utilise un insert VST3. Le rendu MCP ne peut pas piloter l’hôte VST3 natif de Song Maker.');
  }
  if (!Array.isArray(mix.tracks) || mix.tracks.some(track => !isRecord(track) || typeof track.id !== 'string')) {
    throw new Error('Le mix contient une liste de pistes invalide.');
  }
  if (mix.tracks.length > 256) throw new Error('Le rendu MCP est limité à 256 pistes par mix.');
  if (new Set(mix.tracks.map(track => track.id)).size !== mix.tracks.length) {
    throw new Error('Le mix contient des identifiants de piste répétés.');
  }
  const sampleRate = Number.isInteger(mix.sampleRate) && mix.sampleRate >= 8_000 && mix.sampleRate <= 192_000
    ? mix.sampleRate
    : 48_000;
  const clipsByKey = new Map(source.clips.map(clip => [`${clip.trackId}\0${clip.clipId}`, clip]));
  const clipCount = mix.tracks.reduce((sum, track) => sum + (track.clips ?? []).filter(clip => clip?.takeActive !== false).length, 0);
  if (clipCount === 0) throw new Error('Le mix actif ne contient aucun clip audio à rendre.');
  if (clipCount > 10_000) throw new Error('Le rendu MCP est limité à 10 000 clips actifs par mix.');

  const decodedByPath = new Map();
  let sourceBytes = 0;
  let timelineFrames = 0;
  const busCount = Array.isArray(source.overlay?.buses) ? source.overlay.buses.length : 0;
  if (busCount > 256 || (Array.isArray(source.overlay?.sends) && source.overlay.sends.length > 4096)) {
    throw new Error('Le rendu MCP est limité à 256 bus et 4 096 sends par mix.');
  }
  for (const track of mix.tracks) {
    if (!Array.isArray(track.clips)) throw new Error(`La piste ${track.name ?? track.id} contient des clips invalides.`);
    const activeClipIds = new Set();
    for (const clip of track.clips) {
      if (clip?.takeActive === false) continue;
      if (!Number.isFinite(clip.startMs) || clip.startMs < 0 || !Number.isFinite(clip.durationMs) || clip.durationMs <= 0 ||
          !Number.isFinite(clip.offsetMs) || clip.offsetMs < 0 || typeof clip.id !== 'string' || !clip.id.trim()) {
        throw new Error(`Le clip ${clip.id ?? 'inconnu'} a une position ou une durée invalide.`);
      }
      if (activeClipIds.has(clip.id)) throw new Error(`Identifiant de clip répété sur la piste ${track.id} : ${clip.id}.`);
      activeClipIds.add(clip.id);
      if (![clip.fadeInMs ?? 0, clip.fadeOutMs ?? 0, clip.gainDb ?? 0].every(Number.isFinite) ||
          (clip.gainDb ?? 0) < -24 || (clip.gainDb ?? 0) > 12 ||
          (clip.fadeInMs ?? 0) < 0 || (clip.fadeOutMs ?? 0) < 0) {
        throw new Error(`Les réglages du clip ${clip.id} sont invalides.`);
      }
      const clipEndFrames = Math.ceil((clip.startMs + clip.durationMs) * sampleRate / 1000);
      if (!Number.isSafeInteger(clipEndFrames)) throw new Error(`Le clip ${clip.id} dépasse la durée maximale de rendu.`);
      timelineFrames = Math.max(timelineFrames, clipEndFrames);
      const resolved = clipsByKey.get(`${track.id}\0${clip.id}`);
      if (!resolved) throw new Error(`La source audio du clip ${clip.id ?? 'inconnu'} n’a pas pu être résolue.`);
      if (decodedByPath.has(resolved.sourcePath)) {
        const cached = decodedByPath.get(resolved.sourcePath);
        if (resolved.sourceSha256 && resolved.sourceSha256.toLowerCase() !== cached.sha256) {
          throw new Error(`La fiche du clip ${clip.id} ne correspond pas à sa source audio.`);
        }
        continue;
      }
      const canonicalPath = await realpath(resolved.sourcePath);
      if (canonicalPath !== resolved.sourcePath || !isWithin(source.projectDirectory, canonicalPath)) {
        throw new Error(`La source audio du clip ${clip.id} a changé ou se trouve hors du projet.`);
      }
      const sourceInfo = await stat(canonicalPath);
      if (!sourceInfo.isFile()) throw new Error(`La source audio du clip ${clip.id} n’est pas un fichier.`);
      if (sourceInfo.size <= 0 || sourceBytes + sourceInfo.size > MAX_RENDER_SOURCE_BYTES) {
        throw new Error('Les clips dépassent la limite de 256 Mio de sources audio du rendu MCP.');
      }
      sourceBytes += sourceInfo.size;
      const preflightMemory = sourceBytes * 3 + timelineFrames * 8 * (mix.tracks.length * 4 + 8 + busCount * 2);
      if (preflightMemory > MAX_RENDER_MEMORY_ESTIMATE_BYTES) {
        throw new Error('Le rendu dépasserait la limite mémoire MCP estimée (512 Mio). Utilise le Studio pour ce mix.');
      }
      const bytes = await readFile(canonicalPath);
      if (bytes.length !== sourceInfo.size || sourceBytes * 3 > MAX_RENDER_MEMORY_ESTIMATE_BYTES) {
        throw new Error(`La source audio du clip ${clip.id} a changé pendant sa lecture ou dépasse la limite de rendu.`);
      }
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (resolved.sourceSha256 && (!/^[a-f0-9]{64}$/i.test(resolved.sourceSha256) || digest !== resolved.sourceSha256.toLowerCase())) {
        throw new Error(`La source audio du clip ${clip.id} a changé depuis son ajout au projet.`);
      }
      decodedByPath.set(canonicalPath, {
        ...decodePcmWav(bytes, sampleRate),
        sha256: digest,
      });
    }
  }
  const estimatedMemory = sourceBytes * 3 + timelineFrames * 8 * (mix.tracks.length * 4 + 8 + busCount * 2);
  if (estimatedMemory > MAX_RENDER_MEMORY_ESTIMATE_BYTES) {
    throw new Error('Le rendu dépasserait la limite mémoire MCP estimée (512 Mio). Utilise le Studio pour ce mix.');
  }
  if (mix.tracks.some(track =>
    (track.gainDb !== undefined && (!Number.isFinite(track.gainDb) || track.gainDb < -24 || track.gainDb > 12)) ||
    (track.pan !== undefined && (!Number.isFinite(track.pan) || track.pan < -1 || track.pan > 1)) ||
    (track.mute !== undefined && typeof track.mute !== 'boolean') ||
    (track.solo !== undefined && typeof track.solo !== 'boolean'))) {
    throw new Error('Les réglages de piste du mix sont hors limites.');
  }
  if (!Number.isFinite(mix.masterGainDb ?? 0) || (mix.masterGainDb ?? 0) < -24 || (mix.masterGainDb ?? 0) > 12 ||
      !Number.isFinite(mix.peakCeilingDb ?? -1) || (mix.peakCeilingDb ?? -1) < -24 || (mix.peakCeilingDb ?? -1) > 0) {
    throw new Error('Le gain master ou le plafond de crête du mix est hors limites.');
  }

  const projectTempoBpm = Array.isArray(mix.tempoMap) && Number.isFinite(mix.tempoMap[0]?.quarterBpm)
    ? mix.tempoMap[0].quarterBpm
    : null;
  let renderedFrames = timelineFrames;
  if (renderedFrames * 8 * (mix.tracks.length * 4 + 8 + busCount * 2) + sourceBytes * 3 > MAX_RENDER_MEMORY_ESTIMATE_BYTES) {
    throw new Error('Le placement des clips dépasserait la limite mémoire MCP estimée (512 Mio). Utilise le Studio pour ce mix.');
  }

  const tracks = mix.tracks.map(track => {
    const left = new Float32Array(renderedFrames);
    const right = new Float32Array(renderedFrames);
    for (const clip of track.clips ?? []) {
      if (clip?.takeActive === false) continue;
      const resolved = clipsByKey.get(`${track.id}\0${clip.id}`);
      const decodedSource = resolved ? decodedByPath.get(resolved.sourcePath) : null;
      if (!decodedSource) throw new Error(`La source audio du clip ${clip.id} n’a pas pu être décodée.`);
      const placed = placeClipsOnTimeline(decodedSource.left, decodedSource.right, [clipPlacement(clip)], sampleRate, {
        projectTempoBpm,
      });
      for (let frame = 0; frame < placed.left.length; frame++) left[frame] += placed.left[frame] ?? 0;
      for (let frame = 0; frame < placed.right.length; frame++) right[frame] += placed.right[frame] ?? 0;
    }
    return {
      trackId: track.id,
      left,
      right,
      gainDb: Number.isFinite(track.gainDb) ? track.gainDb : 0,
      pan: Number.isFinite(track.pan) ? Math.max(-1, Math.min(1, track.pan)) : 0,
      mute: track.mute === true,
      solo: track.solo === true,
    };
  });
  const { toolkit, routing } = productionToolkit(mix.id, source.overlay, mix.tracks);
  const rendered = renderMixOffline({
    mixId: mix.id,
    sampleRate,
    masterGainDb: Number.isFinite(mix.masterGainDb) ? mix.masterGainDb : 0,
    peakCeilingDb: Number.isFinite(mix.peakCeilingDb) ? mix.peakCeilingDb : -1,
    tracks,
    automation: toolkit.automation,
    effects: toolkit.effects,
    sidechain: toolkit.sidechain,
    tempoBpm: projectTempoBpm,
    buses: routing.buses,
    sends: routing.sends,
    trackGroupIds: routing.trackGroupIds,
  });
  if (!rendered.frameCount || rendered.pcm.length === 0) throw new Error('Le mix n’a produit aucun échantillon audio.');

  const latest = await getProjectMix({ projectId, mixId: source.mixId, env });
  if (latest.mixRevision !== source.mixRevision) throw new Error('Le mix a changé pendant le rendu. Relis-le et relance l’export.');

  const targetDirectory = insideWorkspace(outputDirectory, workspace);
  await mkdir(targetDirectory, { recursive: true });
  const canonicalWorkspace = await realpath(workspace);
  const canonicalDirectory = await realpath(targetDirectory);
  if (!isWithin(canonicalWorkspace, canonicalDirectory)) throw new Error('Le dossier d’export doit rester dans SONG_MAKER_WORKSPACE_ROOT.');
  const baseTitle = source.projectTitle.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim().slice(0, 120) || projectId;
  const destinationName = safeAudioName(fileName, `${baseTitle}-${source.mixId}-mix.${format}`, format);
  const destination = path.join(canonicalDirectory, destinationName);
  const temporaryWav = path.join(canonicalDirectory, `.song-maker-mix-${randomUUID()}.wav`);
  const temporaryEncoded = path.join(canonicalDirectory, `.song-maker-mix-${randomUUID()}.${format}`);
  try {
    const wav = floatPcmToWav(rendered.pcm, sampleRate, selectedBitDepth);
    await writeFile(temporaryWav, wav, { flag: 'wx' });
    if (format === 'wav') {
      const outputAudio = await inspectWav(temporaryWav);
      if (outputAudio.sampleRateHz !== sampleRate || outputAudio.channels !== 2 || outputAudio.bitDepth !== selectedBitDepth) {
        throw new Error('Le WAV rendu ne correspond pas au format demandé.');
      }
      await publishExclusive(temporaryWav, destination);
    } else {
      const ffmpeg = await resolveFfmpeg(env);
      await runFfmpeg(ffmpeg, encodeArgs(temporaryWav, temporaryEncoded, format, selectedBitDepth, selectedBitrate), 'l’export du mix');
      await verifyEncodedAudio(ffmpeg, temporaryEncoded);
      await publishExclusive(temporaryEncoded, destination);
      await rm(temporaryWav, { force: true }).catch(() => {});
    }
  } catch (error) {
    await Promise.all([
      rm(temporaryWav, { force: true }).catch(() => {}),
      rm(temporaryEncoded, { force: true }).catch(() => {}),
    ]);
    throw error;
  }

  const audio = format === 'wav' ? await inspectWav(destination) : null;
  return {
    profileId: source.profileId,
    projectId: source.projectId,
    mixId: source.mixId,
    mixRevision: source.mixRevision,
    format,
    path: destination,
    bytes: (await stat(destination)).size,
    audio: { ...(audio ?? {}), sampleRateHz: sampleRate, channels: 2, durationSec: rendered.frameCount / sampleRate },
    render: {
      path: rendered.path,
      peakTrimDb: rendered.peakTrimDb,
      trackCount: tracks.length,
      clipCount,
    },
    delivery: {
      format,
      ...(format === 'mp3' ? { bitrateKbps: selectedBitrate } : { bitDepth: selectedBitDepth }),
      sampleRateHz: sampleRate,
      channels: 2,
    },
  };
}
