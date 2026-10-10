import { execFile as execFileCallback, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { link, mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inspectWav } from './audio-quality.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const execFile = promisify(execFileCallback);
export const workspaceRoot = path.resolve(process.env.SONG_MAKER_WORKSPACE_ROOT || process.cwd());
const jobsDir = path.join(workspaceRoot, '.song-maker-mcp', 'jobs');
const gpuLockPath = path.join(workspaceRoot, '.song-maker-mcp', 'gpu.lock');
const requiredSidecars = [
  'yue2-model-config.json', 'yue2-generation-config.json',
  'yue2-qwen.tiktoken', 'yue2-vae-config.json',
];
const creativeAxes = {
  scene: 'scene',
  groove: 'groove',
  foreground: 'foreground instrument or timbre',
  harmony: 'harmonic color',
  arrangement: 'arrangement arc',
  motif: 'signature motif',
};
const promptStopWords = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'their', 'your', 'make',
  'track', 'style', 'music', 'instrumental', 'jazz', 'classic', 'classical', 'japanese',
  'electric', 'fusion', 'lounge', 'hotel', 'restaurant', 'reception', 'warm', 'soft',
  'gentle', 'smooth', 'restrained', 'quiet', 'even', 'keep', 'use', 'must', 'should',
  'about', 'minutes', 'target', 'short', 'opening', 'ending', 'vocals', 'spoken',
  'words', 'no', 'not', 'with', 'and', 'from', 'the', 'a', 'an', 'section', 'tempo',
  'suggestion', 'energy', 'bpm', 'key', 'changes', 'abrupt', 'long', 'fills', 'busy',
  'drops', 'recognizable', 'existing', 'melodies', 'solos', 'conversation', 'sitting',
]);

export function insideWorkspace(userPath, root = workspaceRoot) {
  const workspace = path.resolve(root);
  const canonicalWorkspace = realpathSync(workspace);
  const absolute = path.resolve(workspace, userPath);
  let existing = absolute;
  while (!existsSync(existing)) existing = path.dirname(existing);
  const canonical = path.resolve(realpathSync(existing), path.relative(existing, absolute));
  const relative = path.relative(canonicalWorkspace, canonical);
  if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('Le chemin doit rester dans SONG_MAKER_WORKSPACE_ROOT.');
  }
  return absolute;
}

export function runtimeStatus() {
  const cache = path.resolve(process.env.SONG_MAKER_CACHE || (
    process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'song-maker')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Caches', 'song-maker')
        : path.join(os.homedir(), '.cache', 'song-maker')
  ));
  const folder = path.join(cache, 'binaries', 'v0.8.2');
  const binaryName = process.platform === 'win32' ? 'audiocpp_cli.exe' : 'audiocpp_cli';
  const binary = [
    path.join(folder, 'windows-cuda12.4', binaryName),
    path.join(folder, 'linux-cuda12.8-colab', binaryName),
    path.join(folder, 'extracted', binaryName),
  ].find(existsSync) || null;
  const serverName = process.platform === 'win32' ? 'audiocpp_server.exe' : 'audiocpp_server';
  const serverBinary = [
    ...(binary ? [path.join(path.dirname(binary), serverName)] : []),
    path.join(folder, 'windows-cuda12.4', serverName),
    path.join(folder, 'linux-cuda12.8-colab', serverName),
    path.join(folder, 'extracted', serverName),
  ].find(existsSync) || null;
  const modelDir = path.join(cache, 'models', 'Yue2-3B-GGUF');
  const q8 = path.join(modelDir, 'yue2-3b-q8_0.gguf');
  const q4 = path.join(modelDir, 'yue2-3b-q4_0.gguf');
  const requested = process.env.SONG_MAKER_MODEL?.toLowerCase();
  const modelPath = requested === 'q8' ? q8 : requested === undefined || requested === '' || requested === 'q4' ? q4 : null;
  const modelName = modelPath && existsSync(modelPath) ? path.basename(modelPath) : null;
  const missing = [
    ...(!binary ? ['audiocpp_cli'] : []),
    ...(!modelName ? ['YuE2 Q4 ou Q8'] : []),
    ...(!existsSync(path.join(modelDir, 'yue2-vae-f16.gguf')) ? ['YuE2 VAE'] : []),
    ...requiredSidecars.filter(name => !existsSync(path.join(modelDir, 'sidecars', name))),
  ];
  return { ready: missing.length === 0, binary, serverBinary, modelDir, modelName, missing, workspaceRoot };
}

function normalizeCreativeDirection(input, title, style) {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`creativeDirection invalide pour « ${title} ».`);
  }
  const unknown = Object.keys(input).filter(key => !Object.hasOwn(creativeAxes, key));
  if (unknown.length) throw new Error(`Axes creativeDirection inconnus pour « ${title} » : ${unknown.join(', ')}.`);
  const direction = {};
  for (const key of Object.keys(creativeAxes)) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.trim().length > 240) {
      throw new Error(`creativeDirection.${key} doit contenir au plus 240 caractères pour « ${title} ».`);
    }
    if (value.trim()) direction[key] = value.trim();
  }
  const axes = Object.keys(direction);
  if (axes.length && axes.length < 3) {
    throw new Error(`creativeDirection doit préciser au moins 3 axes pour « ${title} » (scène, groove, timbre, harmonie, arrangement ou motif).`);
  }
  if (style.length + Object.values(direction).join(' ').length > 3900) {
    throw new Error(`Le prompt assemblé est trop long pour « ${title} ».`);
  }
  return axes.length ? direction : undefined;
}

export function normalizeSong(song, defaults = {}) {
  if (!song || typeof song !== 'object') throw new Error('Morceau invalide.');
  const title = String(song.title || '').trim();
  const style = String(song.style || '').trim();
  const lyrics = String(song.lyrics ?? '').trim();
  const instrumental = song.instrumentalMode ?? defaults.instrumentalMode ?? false;
  const duration = song.targetDurationSec ?? defaults.targetDurationSec ?? 180;
  const cot = song.cot ?? defaults.cot ?? 'full';
  const preferFullLyrics = song.preferFullLyrics ?? defaults.preferFullLyrics ?? true;
  const language = song.singingLanguage ?? defaults.singingLanguage ?? 'en';
  const tempo = song.tempoBpm ?? defaults.tempoBpm ?? null;
  const key = song.key === undefined ? (defaults.key ?? null) : song.key;
  const meter = song.meter === undefined ? (defaults.meter ?? null) : song.meter;
  const generations = song.generations ?? defaults.generations ?? 1;
  const creativeDirection = normalizeCreativeDirection(song.creativeDirection, title, style);
  if (!title || title.length > 120 || !style || style.length > 4000 || lyrics.length > 4000) {
    throw new Error('Titre, style ou paroles absents ou trop longs.');
  }
  if (!instrumental && !lyrics) throw new Error(`Paroles manquantes pour « ${title} ».`);
  if (!Number.isInteger(duration) || duration < 30 || duration > 360) throw new Error(`Durée invalide pour « ${title} » (30–360 s).`);
  if (!['full', 'melody', 'off'].includes(cot)) throw new Error(`Mode cot invalide pour « ${title} ».`);
  if (tempo !== null && (!Number.isInteger(tempo) || tempo < 40 || tempo > 220)) throw new Error(`Tempo invalide pour « ${title} ».`);
  if (key !== null && (!key || !['major', 'minor'].includes(key.mode) ||
      !['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].includes(key.tonic))) {
    throw new Error(`Tonalité invalide pour « ${title} ».`);
  }
  if (meter !== null && (!meter || !['4/4', '3/4', '6/8', '2/4'].includes(`${meter.numerator}/${meter.denominator}`))) {
    throw new Error(`Métrique invalide pour « ${title} ».`);
  }
  if (generations !== 1) throw new Error(`Le MCP accepte une seule génération par titre : « ${title} ».`);
  const index = String(song.id || '').trim();
  const seed = song.seed ?? Math.floor(Math.random() * 0x100000000);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error(`Seed invalide pour « ${title} ».`);
  return { id: index, title, style, lyrics, instrumental: Boolean(instrumental), duration,
    cot, preferFullLyrics: Boolean(preferFullLyrics), language: String(language || ''), tempo, key, meter, seed,
    ...(creativeDirection ? { creativeDirection } : {}) };
}

export function parseBatch(raw) {
  const batch = JSON.parse(raw);
  if (batch.schemaVersion !== 1 || !Array.isArray(batch.songs) || !batch.songs.length || batch.songs.length > 1000) {
    throw new Error('Lot Song Maker V1 invalide.');
  }
  const onError = batch.onError ?? 'continue';
  if ((batch.maxParallelGenerations ?? 1) !== 1 || onError !== 'continue' ||
      (batch.retry?.maxAttempts ?? 1) !== 1) {
    throw new Error('Le MCP exécute un flux GPU, continue après les erreurs de chanson et ne retente pas automatiquement. Il refuse les lots en pause, parallèles ou avec retry.');
  }
  const songs = batch.songs.map(song => normalizeSong(song, batch.defaults));
  if (new Set(songs.map(song => song.id)).size !== songs.length || songs.some(song => !song.id)) {
    throw new Error('Chaque morceau doit avoir un id unique.');
  }
  return songs;
}

export function outputName(song, position) {
  const index = /^\d{1,3}$/.test(song.id) ? song.id.padStart(2, '0') : String(position + 1).padStart(2, '0');
  const safeTitle = song.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim();
  if (!safeTitle) throw new Error('Titre inutilisable comme nom de fichier.');
  return `${index} - ${safeTitle}.wav`;
}

export function semanticBudget(song) {
  const target = Math.round(song.duration / 30) * 30;
  const targetTokens = target * 25;
  if (song.instrumental || !song.preferFullLyrics) return [targetTokens, targetTokens];
  const words = song.lyrics.split('\n').filter(line => !line.trim().startsWith('['))
    .join(' ').trim().split(/\s+/).filter(Boolean).length;
  const maxSeconds = Math.ceil(Math.min(900, Math.max(words + 30, target + Math.max(target / 4, 30))) / 30) * 30;
  return [targetTokens, Math.max(targetTokens, maxSeconds * 25)];
}

export function inferenceThreads(value = process.env.SONG_MAKER_THREADS) {
  if (value !== undefined && value !== '') {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 64) {
      throw new Error('SONG_MAKER_THREADS doit être un entier entre 1 et 64.');
    }
    return parsed;
  }
  return Math.max(1, Math.min(8, os.availableParallelism?.() || os.cpus().length || 1));
}

export function stylePrompt(song) {
  let style = song.style;
  if (song.creativeDirection && Object.keys(song.creativeDirection).length) {
    const details = Object.entries(song.creativeDirection)
      .map(([axis, value]) => `${creativeAxes[axis]}: ${value}`)
      .join('; ');
    style = `${style}. Track-specific direction — ${details}.`;
  }
  const language = song.language === 'en' ? 'English' : song.language;
  if (language && !style.toLowerCase().includes(language.toLowerCase())) style = `${language}, ${style}`;
  if (song.tempo && !style.includes(`${song.tempo} BPM`)) style += `, ${song.tempo} BPM`;
  const tonalKey = song.key ? `key ${song.key.tonic} ${song.key.mode}` : null;
  if (tonalKey && !style.toLowerCase().includes(tonalKey.toLowerCase())) style += `, ${tonalKey}`;
  const meter = song.meter ? `${song.meter.numerator}/${song.meter.denominator}` : null;
  if (meter && !style.includes(meter)) style += `, ${meter}`;
  return style;
}

export function cliArgs(song, runtime, destination) {
  const [min, max] = semanticBudget(song);
  const style = stylePrompt(song);
  return ['--task', 'gen', '--family', 'yue2', '--model', runtime.modelDir, '--backend', 'cuda',
    '--threads', String(inferenceThreads()),
    '--session-option', `yue2.model_gguf=${runtime.modelName}`,
    '--request-option', `style=${style}`, '--request-option', `cot=${song.cot}`,
    '--request-option', `semantic_min_tokens=${min}`, '--request-option', `semantic_max_tokens=${max}`,
    '--lyrics', song.instrumental ? '' : song.lyrics, '--seed', String(song.seed),
    '--out', destination];
}

function promptTokens(song) {
  const distinctive = song.creativeDirection && Object.keys(song.creativeDirection).length
    ? Object.values(song.creativeDirection).join(' ')
    : song.style;
  const tokens = distinctive.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .match(/[\p{L}\p{N}]{3,}/gu) || [];
  return new Set(tokens.filter(token => !promptStopWords.has(token) && !/^\d+$/.test(token)));
}

function normalizedPrompt(song) {
  const direction = Object.entries(song.creativeDirection || {}).map(([axis, value]) => `${axis} ${value}`).join(' ');
  return `${direction || song.style}`
    .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function auditPromptDiversity(songs) {
  const underSpecified = songs.filter(song => Object.keys(song.creativeDirection || {}).length < Object.keys(creativeAxes).length)
    .map(song => ({ id: song.id, title: song.title, axesFound: Object.keys(song.creativeDirection || {}) }));
  const tokens = songs.map(promptTokens);
  const canonical = songs.map(normalizedPrompt);
  const exactDuplicates = [];
  const similarPairs = [];
  for (let i = 0; i < songs.length; i++) {
    for (let j = i + 1; j < songs.length; j++) {
      if (canonical[i] === canonical[j]) {
        exactDuplicates.push({ first: songs[i].id, second: songs[j].id });
      }
      const first = tokens[i];
      const second = tokens[j];
      if (first.size < 4 || second.size < 4) continue;
      const intersection = [...first].filter(token => second.has(token)).length;
      const similarity = intersection / (first.size + second.size - intersection);
      if (similarity >= 0.65) similarPairs.push({ first: songs[i].id, second: songs[j].id,
        similarity: Math.round(similarity * 100) / 100 });
    }
  }
  const repeatedDirections = Object.fromEntries(Object.keys(creativeAxes).map(axis => {
    const occurrences = new Map();
    for (const song of songs) {
      const value = song.creativeDirection?.[axis]?.toLowerCase().trim();
      if (value) {
        if (!occurrences.has(value)) occurrences.set(value, []);
        occurrences.get(value).push(song.id);
      }
    }
    return [axis, [...occurrences.values()].filter(ids => ids.length > 1)];
  }).filter(([, groups]) => groups.length));
  return {
    totalSongs: songs.length,
    withCreativeDirection: songs.length - underSpecified.length,
    underSpecified,
    exactDuplicates,
    similarPairs: similarPairs.sort((a, b) => b.similarity - a.similarity).slice(0, 50),
    repeatedDirections,
    similarityMethod: 'Jaccard lexical sur les détails distinctifs, seuil 0,65 ; indicateur de formulation, pas une analyse audio.',
    recommendation: 'Renseigner les six axes pour chaque morceau et reformuler toute paire lexicale trop proche avant de lancer la génération.',
  };
}

async function readFileRange(file, position, length, fileSize) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    if (position + offset >= fileSize) throw new Error('WAV tronqué : données inattendues en fin de fichier.');
    const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset);
    if (bytesRead === 0) throw new Error('WAV tronqué : données inattendues en fin de fichier.');
    offset += bytesRead;
  }
  return buffer;
}

export async function wavDurationMs(filePath) {
  const file = await open(filePath, 'r');
  try {
    const { size } = await file.stat();
    const header = await readFileRange(file, 0, 12, size);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Fichier audio invalide : signature RIFF/WAVE absente.');
    }
    const riffEnd = header.readUInt32LE(4) + 8;
    if (riffEnd < 12 || riffEnd > size) throw new Error('WAV tronqué : taille RIFF incohérente.');

    let offset = 12;
    let format = null;
    let dataBytes = 0;
    while (offset + 8 <= riffEnd) {
      const chunk = await readFileRange(file, offset, 8, riffEnd);
      const id = chunk.toString('ascii', 0, 4);
      const length = chunk.readUInt32LE(4);
      const dataOffset = offset + 8;
      const nextOffset = dataOffset + length + (length & 1);
      if (nextOffset > riffEnd) throw new Error('WAV tronqué : bloc ' + id + ' incomplet.');
      if (id === 'fmt ') {
        if (length < 16) throw new Error('WAV invalide : bloc fmt trop court.');
        const fmt = await readFileRange(file, dataOffset, Math.min(length, 40), riffEnd);
        let encoding = fmt.readUInt16LE(0);
        if (encoding === 0xfffe) {
          if (fmt.length < 40) throw new Error('WAV invalide : format extensible incomplet.');
          encoding = fmt.readUInt16LE(24);
        }
        const channels = fmt.readUInt16LE(2);
        const sampleRate = fmt.readUInt32LE(4);
        const blockAlign = fmt.readUInt16LE(12);
        const bitsPerSample = fmt.readUInt16LE(14);
        const supportedPcm = encoding === 1 && [8, 16, 24, 32].includes(bitsPerSample);
        const supportedFloat = encoding === 3 && [32, 64].includes(bitsPerSample);
        if ((!supportedPcm && !supportedFloat) || !channels || !sampleRate || !blockAlign ||
            blockAlign !== channels * bitsPerSample / 8) {
          throw new Error('WAV non pris en charge : paramètres fmt invalides.');
        }
        format = { sampleRate, blockAlign };
      } else if (id === 'data') {
        dataBytes += length;
      }
      offset = nextOffset;
    }

    if (!format || !dataBytes || dataBytes % format.blockAlign !== 0) {
      throw new Error('WAV invalide : bloc fmt ou données audio absents ou incomplets.');
    }
    return Math.round(dataBytes / format.blockAlign / format.sampleRate * 1000);
  } finally {
    await file.close();
  }
}

export function assertRequestedDuration(song, actualMs) {
  if (!song.instrumental && song.preferFullLyrics) return;
  const expectedMs = Math.round(song.duration / 30) * 30 * 1000;
  if (actualMs <= 0 || Math.abs(actualMs - expectedMs) > 250) {
    const error = new Error('Durée générée (' + Math.round(actualMs / 1000) +
      ' s) différente de la durée demandée (' + expectedMs / 1000 + ' s).');
    error.code = 'GENERATION_DURATION_MISMATCH';
    throw error;
  }
}

function cancellationError() {
  const error = new Error('Génération annulée à la demande.');
  error.code = 'JOB_CANCELLED';
  return error;
}

export async function runCli(song, destination, runtime = runtimeStatus(), signal) {
  if (signal?.aborted) throw cancellationError();
  if (!runtime.ready) throw new Error(`Runtime incomplet : ${runtime.missing.join(', ')}`);
  if (process.env.SONG_MAKER_YUE2_NONCOMMERCIAL !== '1') {
    throw new Error('Définis SONG_MAKER_YUE2_NONCOMMERCIAL=1 après lecture de la licence CC BY-NC 4.0 des poids YuE2.');
  }
  if (existsSync(destination)) throw new Error(`Export déjà présent : ${destination}`);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + '.partial.wav';
  if (existsSync(temporary)) throw new Error(`Export partiel déjà présent : ${temporary}`);
  const limits = gpuLimits(runtime.modelName);
  assertGpuSafe(await readGpuTelemetry(), limits);
  let tail = '';
  let telemetryWarning = null;
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(runtime.binary, cliArgs(song, runtime, temporary), { windowsHide: true, shell: false });
      const abort = () => child.kill();
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      let monitorBusy = false;
      let safetyError = null;
      const monitor = setInterval(() => {
        if (monitorBusy || safetyError) return;
        monitorBusy = true;
        readGpuTelemetry()
          .then(telemetry => assertGpuSafe(telemetry, limits, false))
          .catch(error => {
            if (error.code === 'GPU_SAFETY_STOP') {
              safetyError = error;
              child.kill();
            } else {
              telemetryWarning = 'Une lecture ponctuelle des capteurs NVIDIA a échoué pendant le rendu; le contrôle thermique reprendra au prochain relevé.';
            }
          })
          .finally(() => { monitorBusy = false; });
      }, 3000);
      monitor.unref();
      child.on('error', error => {
        clearInterval(monitor);
        signal?.removeEventListener('abort', abort);
        reject(error);
      });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        tail = (tail + chunk.toString()).slice(-6000);
      });
      child.on('close', code => {
        clearInterval(monitor);
        signal?.removeEventListener('abort', abort);
        if (safetyError) reject(safetyError);
        else if (signal?.aborted) reject(cancellationError());
        else resolve(code);
      });
    });
    if (code !== 0) throw new Error(`YuE2 a échoué (code ${code}) : ${tail.slice(-1000)}`);
    const size = (await stat(temporary)).size;
    if (size < 1024) throw new Error('YuE2 n’a pas produit un WAV valide.');
    const quality = await inspectWav(temporary);
    const durationMs = await wavDurationMs(temporary);
    assertRequestedDuration(song, durationMs);
    if (signal?.aborted) throw cancellationError();
    await publishExclusive(temporary, destination);
    return { destination, bytes: size, durationMs, quality, warnings: telemetryWarning ? [telemetryWarning] : [] };
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

const yue2ServerTimeoutMs = 1_800_000;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function availablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

async function serverIsHealthy(server) {
  if (server.exited || server.spawnError) return false;
  try {
    const response = await fetch(`${server.baseUrl}/health`, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch { return false; }
}

async function stopYue2Server(server) {
  if (!server) return;
  if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill();
  await Promise.race([server.closed, pause(5000)]);
  if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill();
  await Promise.race([server.closed, pause(1000)]);
  await unlink(server.configPath).catch(() => {});
}

export async function startYue2Server(runtime, jobId) {
  if (!runtime.serverBinary) throw new Error('audiocpp_server est absent du runtime local.');
  assertGpuSafe(await readGpuTelemetry(), gpuLimits(runtime.modelName));
  const host = '127.0.0.1';
  const port = await availablePort();
  const backend = process.platform === 'darwin' ? 'metal' : 'cuda';
  const configPath = path.join(jobsDir, `${jobId}.${randomUUID()}.audiocpp-server.json`);
  const config = {
    host, port, backend, device: 0, lazy_load: true, max_loaded_models: 1,
    idle_unload_ms: 0, busy_timeout_ms: yue2ServerTimeoutMs,
    models: [{ id: 'yue2', family: 'yue2', path: runtime.modelDir, task: 'gen', mode: 'offline',
      busy_timeout_ms: yue2ServerTimeoutMs, session_options: { 'yue2.model_gguf': runtime.modelName } }],
  };
  await writeFile(configPath, JSON.stringify(config, null, 2), { flag: 'wx' });
  const child = spawn(runtime.serverBinary, ['--config', configPath, '--backend', backend], {
    cwd: path.dirname(runtime.serverBinary), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const server = { child, configPath, baseUrl: `http://${host}:${port}`, tail: '', exited: false,
    spawnError: null, modelLoaded: false };
  server.closed = new Promise(resolve => child.once('close', resolve));
  child.once('error', error => { server.spawnError = error; });
  child.once('exit', () => { server.exited = true; });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', chunk => { server.tail = (server.tail + chunk.toString()).slice(-6000); });
  }
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (server.spawnError) throw server.spawnError;
      if (server.exited) throw new Error(`audiocpp_server s’est arrêté au démarrage : ${server.tail.slice(-1000)}`);
      if (await serverIsHealthy(server)) return server;
      await pause(250);
    }
    throw new Error(`audiocpp_server ne répond pas sur /health : ${server.tail.slice(-1000)}`);
  } catch (error) {
    await stopYue2Server(server);
    throw error;
  }
}

export function serverSongRequest(song) {
  const [min, max] = semanticBudget(song);
  return {
    model: 'yue2',
    request: {
      lyrics: song.instrumental ? '' : song.lyrics,
      seed: song.seed,
      options: {
        style: stylePrompt(song), cot: song.cot, num_inference_steps: 8,
        guidance_scale: song.cot === 'off' ? 1.01 : 1.0,
        semantic_min_tokens: min, semantic_max_tokens: max, export_semantic: true,
      },
    },
  };
}

export async function runServerSong(song, destination, runtime, server, signal) {
  if (signal?.aborted) throw cancellationError();
  if (!runtime.ready) throw new Error(`Runtime incomplet : ${runtime.missing.join(', ')}`);
  if (process.env.SONG_MAKER_YUE2_NONCOMMERCIAL !== '1') {
    throw new Error('Définis SONG_MAKER_YUE2_NONCOMMERCIAL=1 après lecture de la licence CC BY-NC 4.0 des poids YuE2.');
  }
  if (existsSync(destination)) throw new Error(`Export déjà présent : ${destination}`);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = destination + '.partial.wav';
  if (existsSync(temporary)) throw new Error(`Export partiel déjà présent : ${temporary}`);
  const limits = gpuLimits(runtime.modelName);
  assertGpuSafe(await readGpuTelemetry(), limits, !server.modelLoaded);
  const request = serverSongRequest(song);
  const controller = new AbortController();
  let safetyError = null;
  let telemetryWarning = null;
  let monitorBusy = false;
  let timedOut = false;
  const abortForCancellation = () => {
    controller.abort();
    server.child.kill();
  };
  signal?.addEventListener('abort', abortForCancellation, { once: true });
  if (signal?.aborted) abortForCancellation();
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, yue2ServerTimeoutMs + 60_000);
  timeout.unref();
  const monitor = setInterval(() => {
    if (monitorBusy || safetyError) return;
    monitorBusy = true;
    readGpuTelemetry()
      .then(telemetry => assertGpuSafe(telemetry, limits, false))
      .catch(error => {
        if (error.code === 'GPU_SAFETY_STOP') {
          safetyError = error;
          controller.abort();
          server.child.kill();
        } else {
          telemetryWarning = 'Une lecture ponctuelle des capteurs NVIDIA a échoué pendant le rendu; le contrôle thermique reprendra au prochain relevé.';
        }
      })
      .finally(() => { monitorBusy = false; });
  }, 3000);
  monitor.unref();
  try {
    const response = await fetch(`${server.baseUrl}/v1/tasks/run`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request), signal: controller.signal,
    });
    if (signal?.aborted) throw cancellationError();
    if (response.ok) server.modelLoaded = true;
    if (safetyError) throw safetyError;
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`YuE2 a échoué (HTTP ${response.status}) : ${body.slice(-1000)}`);
    }
    const result = await response.json();
    const encoded = result?.audio || result?.named_audio_outputs?.[0]?.audio;
    if (typeof encoded !== 'string' || !encoded.length) throw new Error('Réponse audio.cpp sans WAV base64.');
    const wav = Buffer.from(encoded, 'base64');
    if (wav.length < 1024) throw new Error('YuE2 n’a pas produit un WAV valide.');
    if (safetyError) throw safetyError;
    await writeFile(temporary, wav, { flag: 'wx' });
    const quality = await inspectWav(temporary);
    const durationMs = await wavDurationMs(temporary);
    assertRequestedDuration(song, durationMs);
    if (signal?.aborted) throw cancellationError();
    if (safetyError) throw safetyError;
    await publishExclusive(temporary, destination);
    return { destination, bytes: wav.length, durationMs, quality, warnings: telemetryWarning ? [telemetryWarning] : [] };
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (safetyError) throw safetyError;
    if (timedOut) throw new Error('audio.cpp a dépassé le délai maximal de génération YuE2.');
    if (signal?.aborted) throw cancellationError();
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(monitor);
    signal?.removeEventListener('abort', abortForCancellation);
  }
}

export function gpuLimits(modelName, maxTemperature = process.env.SONG_MAKER_GPU_MAX_TEMP_C || '80') {
  const temperature = Number(maxTemperature);
  if (!Number.isFinite(temperature) || temperature < 65 || temperature > 85) {
    throw new Error('SONG_MAKER_GPU_MAX_TEMP_C doit être entre 65 et 85 °C.');
  }
  return { maxTemperature: temperature, minimumFreeMemoryMiB: modelName?.includes('q8_0') ? 12 * 1024 : 8 * 1024 };
}

export function parseGpuTelemetry(output) {
  const first = String(output).trim().split(/\r?\n/)[0];
  const fields = first?.split(',').map(value => value.trim()) || [];
  const temperature = Number(fields[1]);
  const freeMemoryMiB = Number(fields[2]);
  if (!fields[0] || !Number.isFinite(temperature) || !Number.isFinite(freeMemoryMiB)) {
    const error = new Error('nvidia-smi ne retourne pas la température et la mémoire libre du GPU.');
    error.code = 'GPU_TELEMETRY_UNAVAILABLE';
    throw error;
  }
  return { name: fields[0], temperature, freeMemoryMiB };
}

export function assertGpuSafe(telemetry, limits, checkMemory = true) {
  if (telemetry.temperature >= limits.maxTemperature) {
    const error = new Error(`Arrêt de sécurité : GPU à ${telemetry.temperature} °C (seuil ${limits.maxTemperature} °C). Laisse refroidir la carte puis reprends le job.`);
    error.code = 'GPU_SAFETY_STOP';
    throw error;
  }
  if (checkMemory && telemetry.freeMemoryMiB < limits.minimumFreeMemoryMiB) {
    const error = new Error(`VRAM libre insuffisante : ${Math.round(telemetry.freeMemoryMiB / 1024)} Gio, minimum ${Math.round(limits.minimumFreeMemoryMiB / 1024)} Gio pour ce modèle.`);
    error.code = 'GPU_MEMORY_LOW';
    throw error;
  }
}

export async function readGpuTelemetry() {
  const executable = process.env.SONG_MAKER_NVIDIA_SMI || 'nvidia-smi';
  try {
    const { stdout } = await execFile(executable, [
      '--query-gpu=name,temperature.gpu,memory.free', '--format=csv,noheader,nounits',
    ], { timeout: 4000, windowsHide: true, maxBuffer: 16 * 1024 });
    return parseGpuTelemetry(stdout);
  } catch (error) {
    throw Object.assign(new Error(`Impossible de lire les capteurs NVIDIA avec nvidia-smi : ${error?.message || error}`),
      { code: 'GPU_TELEMETRY_UNAVAILABLE', cause: error });
  }
}

export async function gpuStatus(modelName = runtimeStatus().modelName) {
  const limits = gpuLimits(modelName);
  const telemetry = await readGpuTelemetry();
  let safe = true;
  let reason = null;
  try { assertGpuSafe(telemetry, limits); }
  catch (error) { safe = false; reason = error.message; }
  return { ...telemetry, ...limits, safe, reason };
}

export async function publishExclusive(temporary, destination) {
  try {
    await link(temporary, destination);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      await unlink(temporary).catch(() => {});
      throw new Error(`Export déjà présent : ${destination}`, { cause: error });
    }
    throw error;
  }
  await unlink(temporary);
}

async function saveJob(job) {
  const target = path.join(jobsDir, `${job.id}.json`);
  const temporary = target + '.tmp';
  await writeFile(temporary, JSON.stringify(job, null, 2), 'utf8');
  await rename(temporary, target);
}

export async function getJob(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Identifiant de lot invalide.');
  const job = JSON.parse(await readFile(path.join(jobsDir, `${id}.json`), 'utf8'));
  if (existsSync(path.join(jobsDir, id + '.cancel')) &&
      !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.state)) {
    job.state = 'cancelling';
  }
  return job;
}

async function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export async function cancelJob(id) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Identifiant de lot invalide.');
  const target = path.join(jobsDir, id + '.json');
  const job = JSON.parse(await readFile(target, 'utf8'));
  if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.state)) {
    return { id, state: job.state, cancelled: false };
  }

  const marker = path.join(jobsDir, id + '.cancel');
  await writeFile(marker, new Date().toISOString(), { flag: 'wx' }).catch(error => {
    if (error?.code !== 'EEXIST') throw error;
  });

  if (['paused_safety', 'paused_review', 'paused_quality'].includes(job.state) && !(await processIsAlive(job.pid))) {
    job.state = 'cancelled';
    job.error = null;
    job.cancelledAt = new Date().toISOString();
    job.finishedAt = job.cancelledAt;
    await saveJob(job);
    await unlink(marker).catch(() => {});
    return { id, state: job.state, cancelled: true };
  }
  return { id, state: 'cancelling', cancelled: true };
}

export async function acquireGpuLock(jobId, lockPath = gpuLockPath) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const record = { jobId, pid: null, createdAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await writeFile(lockPath, JSON.stringify(record), { flag: 'wx' });
      return record;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }

    let active;
    try { active = JSON.parse(await readFile(lockPath, 'utf8')); }
    catch { throw new Error('Le verrou GPU existe mais est illisible ; inspecte .song-maker-mcp/gpu.lock avant de le supprimer.'); }
    const lockAge = Date.now() - Date.parse(active.createdAt || 0);
    if (await processIsAlive(active.pid) || (!active.pid && lockAge < 120_000)) {
      throw new Error(`Le GPU est déjà occupé par le job ${active.jobId || 'inconnu'}. Attends sa fin avant d’en lancer un autre.`);
    }

    const stalePath = `${lockPath}.stale-${randomUUID()}`;
    try {
      await rename(lockPath, stalePath);
      await unlink(stalePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Impossible de réserver le GPU. Réessaie dans un instant.');
}

async function updateGpuLock(record, pid, lockPath = gpuLockPath) {
  record.pid = pid;
  const temporary = `${lockPath}.${record.jobId}.tmp`;
  await writeFile(temporary, JSON.stringify(record), 'utf8');
  await rename(temporary, lockPath);
}

export async function releaseGpuLock(jobId, lockPath = gpuLockPath) {
  try {
    const lock = JSON.parse(await readFile(lockPath, 'utf8'));
    if (lock.jobId === jobId) await unlink(lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function launchJob(job) {
  const lock = await acquireGpuLock(job.id);
  let worker;
  try {
    await saveJob(job);
    worker = spawn(process.execPath, [path.join(here, 'worker.mjs'), job.id], {
      detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, SONG_MAKER_WORKSPACE_ROOT: workspaceRoot },
    });
    await new Promise((resolve, reject) => {
      worker.once('spawn', resolve);
      worker.once('error', reject);
    });
    await updateGpuLock(lock, worker.pid);
    worker.unref();
  } catch (error) {
    worker?.kill();
    await releaseGpuLock(job.id);
    job.state = 'failed';
    job.error = String(error?.message || error);
    job.finishedAt = new Date().toISOString();
    await saveJob(job);
    throw error;
  }
  return { id: job.id, state: job.state, total: job.songs.length, outputDirectory: job.outputDirectory };
}

export async function startJob(songs, outputDirectory, { reviewBeforeNext = true } = {}) {
  const runtime = runtimeStatus();
  if (!runtime.ready) throw new Error(`Runtime incomplet : ${runtime.missing.join(', ')}`);
  inferenceThreads();
  if (process.env.SONG_MAKER_YUE2_NONCOMMERCIAL !== '1') {
    throw new Error('Accepte la licence non commerciale via SONG_MAKER_YUE2_NONCOMMERCIAL=1 avant de générer.');
  }
  assertGpuSafe(await readGpuTelemetry(), gpuLimits(runtime.modelName));
  const output = insideWorkspace(outputDirectory);
  await mkdir(output, { recursive: true });
  for (let i = 0; i < songs.length; i++) {
    if (existsSync(path.join(output, outputName(songs[i], i)))) throw new Error(`Fichier déjà présent : ${outputName(songs[i], i)}`);
  }
  await mkdir(jobsDir, { recursive: true });
  const job = { id: randomUUID(), state: 'queued', outputDirectory: output, songs,
    current: 0, completed: [], failures: [], warnings: [],
    promptAudit: songs.length > 1 ? auditPromptDiversity(songs) : null,
    reviewBeforeNext: songs.length > 1 && reviewBeforeNext,
    reviewRequired: null,
    reviewWorkerActive: false,
    engine: null, error: null, createdAt: new Date().toISOString() };
  return launchJob(job);
}

export async function resumeJob(id) {
  const job = await getJob(id);
  const reviewAcknowledgement = ['paused_review', 'paused_quality'].includes(job.state);
  if (job.state !== 'paused_safety' && !reviewAcknowledgement) {
    throw new Error('Le job doit être en pause de sécurité ou en attente de validation audio pour être repris.');
  }
  const runtime = runtimeStatus();
  if (!runtime.ready) throw new Error(`Runtime incomplet : ${runtime.missing.join(', ')}`);
  inferenceThreads();
  if (process.env.SONG_MAKER_YUE2_NONCOMMERCIAL !== '1') {
    throw new Error('Accepte la licence non commerciale via SONG_MAKER_YUE2_NONCOMMERCIAL=1 avant de générer.');
  }
  const keepWarmReview = reviewAcknowledgement && job.reviewWorkerActive && await processIsAlive(job.pid);
  assertGpuSafe(await readGpuTelemetry(), gpuLimits(runtime.modelName), !keepWarmReview);
  if (reviewAcknowledgement) {
    job.reviewAcknowledgedAt = new Date().toISOString();
    job.reviewRequired = null;
    job.error = null;
    job.finishedAt = null;
    if (keepWarmReview) {
      job.state = 'running';
      await saveJob(job);
      return { id: job.id, state: job.state, total: job.songs.length,
        current: job.current, outputDirectory: job.outputDirectory, engine: job.engine };
    }
  }
  job.state = 'queued';
  job.error = null;
  job.finishedAt = null;
  return launchJob(job);
}

async function waitForReviewResume(id, signal, timeoutMs = 15 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return null;
    await pause(1000);
    const job = await getJob(id);
    if (job.state === 'running' && job.reviewAcknowledgedAt && !job.reviewRequired) return job;
  }
  return null;
}

export async function runJob(id) {
  const job = await getJob(id);
  job.state = 'running';
  job.pid = process.pid;
  job.warnings ||= [];
  job.reviewWorkerActive = false;
  await saveJob(job);
  let server = null;
  const cancelPath = path.join(jobsDir, id + '.cancel');
  const cancelController = new AbortController();
  const cancelMonitor = setInterval(() => {
    if (existsSync(cancelPath)) cancelController.abort();
  }, 250);
  cancelMonitor.unref();
  if (existsSync(cancelPath)) cancelController.abort();
  try {
    const runtime = runtimeStatus();
    if (runtime.serverBinary) {
      try {
        server = await startYue2Server(runtime, id);
        job.engine = 'audiocpp_server';
      } catch (error) {
        if (error.code === 'GPU_SAFETY_STOP' || error.code === 'GPU_MEMORY_LOW') throw error;
        job.engine = 'audiocpp_cli';
        job.warnings.push(`Serveur persistant indisponible au démarrage ; utilisation du CLI : ${String(error?.message || error)}`);
      }
    } else {
      job.engine = 'audiocpp_cli';
    }
    await saveJob(job);
    for (let i = job.current; i < job.songs.length; i++) {
      if (cancelController.signal.aborted) {
        job.state = 'cancelled';
        job.error = null;
        job.cancelledAt = new Date().toISOString();
        break;
      }
      job.current = i;
      await saveJob(job);
      const destination = path.join(job.outputDirectory, outputName(job.songs[i], i));
      try {
        let result;
        if (server) {
          try {
            result = await runServerSong(job.songs[i], destination, runtime, server, cancelController.signal);
          } catch (error) {
            if (!server.exited || error.code === 'GPU_SAFETY_STOP' || error.code === 'GPU_MEMORY_LOW') throw error;
            await stopYue2Server(server);
            server = null;
            job.engine = 'audiocpp_cli_fallback';
            job.warnings.push(`audiocpp_server s’est arrêté ; le morceau ${job.songs[i].id} et les suivants passent au CLI.`);
            result = await runCli(job.songs[i], destination, runtime, cancelController.signal);
          }
        } else {
          result = await runCli(job.songs[i], destination, runtime, cancelController.signal);
        }
        job.completed.push(result);
        job.warnings.push(...(result.warnings || []));
      } catch (error) {
        if (error.code === 'JOB_CANCELLED' || cancelController.signal.aborted) {
          job.state = 'cancelled';
          job.error = null;
          job.cancelledAt = new Date().toISOString();
          await saveJob(job);
          break;
        }
        if (error.code === 'GPU_SAFETY_STOP' || error.code === 'GPU_MEMORY_LOW') {
          job.state = 'paused_safety';
          job.error = String(error?.message || error);
          job.safetyStoppedAt = new Date().toISOString();
          await saveJob(job);
          break;
        }
        const failure = { songId: job.songs[i].id, title: job.songs[i].title,
          error: String(error?.message || error) };
        job.failures.push(failure);
        job.current = i + 1;
        job.state = 'paused_quality';
        job.reviewRequired = { index: i, ...failure, destination, quality: null };
        job.reviewWorkerActive = true;
        await saveJob(job);
        const resumed = await waitForReviewResume(id, cancelController.signal);
        if (!resumed) {
          job.reviewWorkerActive = false;
          await saveJob(job);
          break;
        }
        Object.assign(job, resumed);
        job.state = 'running';
        job.reviewWorkerActive = false;
        await saveJob(job);
        continue;
      }
      if (job.state === 'paused_safety') break;
      job.current = i + 1;
      const completedTrack = job.completed.at(-1);
      const qualityWarnings = completedTrack?.destination === destination
        ? completedTrack.quality?.warnings || []
        : [];
      if (qualityWarnings.length || (job.reviewBeforeNext && i + 1 < job.songs.length)) {
        job.state = qualityWarnings.length ? 'paused_quality' : 'paused_review';
        job.reviewRequired = {
          index: i,
          songId: job.songs[i].id,
          title: job.songs[i].title,
          destination,
          quality: completedTrack.quality,
        };
        job.reviewWorkerActive = true;
        await saveJob(job);
        const resumed = await waitForReviewResume(id, cancelController.signal);
        if (!resumed) {
          job.reviewWorkerActive = false;
          await saveJob(job);
          break;
        }
        Object.assign(job, resumed);
        job.state = 'running';
        job.reviewWorkerActive = false;
        await saveJob(job);
      }
      await saveJob(job);
    }
    if (existsSync(cancelPath)) {
      job.state = 'cancelled';
      job.error = null;
      job.cancelledAt ||= new Date().toISOString();
    } else if (job.state !== 'paused_safety' && job.state !== 'cancelled') {
      job.state = job.failures.length ? 'completed_with_errors' : 'completed';
    }
  } catch (error) {
    if (error.code === 'JOB_CANCELLED' || cancelController.signal.aborted) {
      job.state = 'cancelled';
      job.error = null;
      job.cancelledAt ||= new Date().toISOString();
    } else {
      job.state = 'failed';
      job.error = String(error?.message || error);
    }
  } finally {
    clearInterval(cancelMonitor);
    if (existsSync(cancelPath)) {
      job.state = 'cancelled';
      job.error = null;
      job.cancelledAt ||= new Date().toISOString();
    }
    job.finishedAt = new Date().toISOString();
    job.reviewWorkerActive = false;
    try { await stopYue2Server(server); }
    finally {
      try { await saveJob(job); }
      finally {
        try { await releaseGpuLock(id); }
        finally { await unlink(cancelPath).catch(() => {}); }
      }
    }
  }
}
