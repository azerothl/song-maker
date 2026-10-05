import { execFile as execFileCallback, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { link, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const execFile = promisify(execFileCallback);
export const workspaceRoot = path.resolve(process.env.SONG_MAKER_WORKSPACE_ROOT || process.cwd());
const jobsDir = path.join(workspaceRoot, '.song-maker-mcp', 'jobs');
const gpuLockPath = path.join(workspaceRoot, '.song-maker-mcp', 'gpu.lock');
const requiredSidecars = [
  'yue2-model-config.json', 'yue2-generation-config.json',
  'yue2-qwen.tiktoken', 'yue2-vae-config.json',
];

export function insideWorkspace(userPath) {
  const absolute = path.resolve(workspaceRoot, userPath);
  let existing = absolute;
  while (!existsSync(existing)) existing = path.dirname(existing);
  const canonical = path.resolve(realpathSync(existing), path.relative(existing, absolute));
  const relative = path.relative(realpathSync(workspaceRoot), canonical);
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
  const modelDir = path.join(cache, 'models', 'Yue2-3B-GGUF');
  const q8 = path.join(modelDir, 'yue2-3b-q8_0.gguf');
  const q4 = path.join(modelDir, 'yue2-3b-q4_0.gguf');
  const requested = process.env.SONG_MAKER_MODEL?.toLowerCase();
  const modelName = requested === 'q4' ? (existsSync(q4) ? path.basename(q4) : null)
    : requested === 'q8' ? (existsSync(q8) ? path.basename(q8) : null)
      : existsSync(q8) ? path.basename(q8) : existsSync(q4) ? path.basename(q4) : null;
  const missing = [
    ...(!binary ? ['audiocpp_cli'] : []),
    ...(!modelName ? ['YuE2 Q4 ou Q8'] : []),
    ...(!existsSync(path.join(modelDir, 'yue2-vae-f16.gguf')) ? ['YuE2 VAE'] : []),
    ...requiredSidecars.filter(name => !existsSync(path.join(modelDir, 'sidecars', name))),
  ];
  return { ready: missing.length === 0, binary, modelDir, modelName, missing, workspaceRoot };
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
    cot, preferFullLyrics: Boolean(preferFullLyrics), language: String(language || ''), tempo, key, meter, seed };
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
  const min = target * 25;
  if (!song.preferFullLyrics) return [200, min];
  const words = song.lyrics.split('\n').filter(line => !line.trim().startsWith('['))
    .join(' ').trim().split(/\s+/).filter(Boolean).length;
  const maxSeconds = Math.ceil(Math.min(900, Math.max(words + 30, target + Math.max(target / 4, 30))) / 30) * 30;
  return [min, Math.max(min, maxSeconds * 25)];
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

export function cliArgs(song, runtime, destination) {
  const [min, max] = semanticBudget(song);
  let style = song.style;
  const language = song.language === 'en' ? 'English' : song.language;
  if (language && !style.toLowerCase().includes(language.toLowerCase())) style = `${language}, ${style}`;
  if (song.tempo && !style.includes(`${song.tempo} BPM`)) style += `, ${song.tempo} BPM`;
  const tonalKey = song.key ? `key ${song.key.tonic} ${song.key.mode}` : null;
  if (tonalKey && !style.toLowerCase().includes(tonalKey.toLowerCase())) style += `, ${tonalKey}`;
  const meter = song.meter ? `${song.meter.numerator}/${song.meter.denominator}` : null;
  if (meter && !style.includes(meter)) style += `, ${meter}`;
  return ['--task', 'gen', '--family', 'yue2', '--model', runtime.modelDir, '--backend', 'cuda',
    '--threads', String(inferenceThreads()),
    '--session-option', `yue2.model_gguf=${runtime.modelName}`,
    '--request-option', `style=${style}`, '--request-option', `cot=${song.cot}`,
    '--request-option', `semantic_min_tokens=${min}`, '--request-option', `semantic_max_tokens=${max}`,
    '--lyrics', song.instrumental ? '[Instrumental]' : song.lyrics, '--seed', String(song.seed),
    '--out', destination];
}

export async function runCli(song, destination, runtime = runtimeStatus()) {
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
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(runtime.binary, cliArgs(song, runtime, temporary), { windowsHide: true, shell: false });
      let monitorBusy = false;
      let safetyError = null;
      const monitor = setInterval(() => {
        if (monitorBusy || safetyError) return;
        monitorBusy = true;
        readGpuTelemetry()
          .then(telemetry => assertGpuSafe(telemetry, limits, false))
          .catch(error => {
            safetyError = error.code === 'GPU_SAFETY_STOP' ? error : Object.assign(error, { code: 'GPU_SAFETY_STOP' });
            child.kill();
          })
          .finally(() => { monitorBusy = false; });
      }, 3000);
      monitor.unref();
      child.on('error', error => { clearInterval(monitor); reject(error); });
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        tail = (tail + chunk.toString()).slice(-6000);
      });
      child.on('close', code => {
        clearInterval(monitor);
        if (safetyError) reject(safetyError);
        else resolve(code);
      });
    });
    if (code !== 0) throw new Error(`YuE2 a échoué (code ${code}) : ${tail.slice(-1000)}`);
    const size = (await stat(temporary)).size;
    if (size < 1024) throw new Error('YuE2 n’a pas produit un WAV valide.');
    await publishExclusive(temporary, destination);
    return { destination, bytes: size };
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
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
    throw new Error('nvidia-smi ne retourne pas la température et la mémoire libre du GPU.');
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
      { code: 'GPU_SAFETY_STOP' });
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
  return JSON.parse(await readFile(path.join(jobsDir, `${id}.json`), 'utf8'));
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

export async function startJob(songs, outputDirectory) {
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
    current: 0, completed: [], failures: [], error: null, createdAt: new Date().toISOString() };
  return launchJob(job);
}

export async function resumeJob(id) {
  const job = await getJob(id);
  if (job.state !== 'paused_safety') throw new Error('Seuls les jobs arrêtés par la protection GPU peuvent être repris.');
  const runtime = runtimeStatus();
  if (!runtime.ready) throw new Error(`Runtime incomplet : ${runtime.missing.join(', ')}`);
  inferenceThreads();
  if (process.env.SONG_MAKER_YUE2_NONCOMMERCIAL !== '1') {
    throw new Error('Accepte la licence non commerciale via SONG_MAKER_YUE2_NONCOMMERCIAL=1 avant de générer.');
  }
  assertGpuSafe(await readGpuTelemetry(), gpuLimits(runtime.modelName));
  job.state = 'queued';
  job.error = null;
  job.finishedAt = null;
  return launchJob(job);
}

export async function runJob(id) {
  const job = await getJob(id);
  job.state = 'running';
  job.pid = process.pid;
  await saveJob(job);
  try {
    const runtime = runtimeStatus();
    for (let i = job.current; i < job.songs.length; i++) {
      job.current = i;
      await saveJob(job);
      const destination = path.join(job.outputDirectory, outputName(job.songs[i], i));
      try {
        const result = await runCli(job.songs[i], destination, runtime);
        job.completed.push(result);
      } catch (error) {
        if (error.code === 'GPU_SAFETY_STOP' || error.code === 'GPU_MEMORY_LOW') {
          job.state = 'paused_safety';
          job.error = String(error?.message || error);
          job.safetyStoppedAt = new Date().toISOString();
          await saveJob(job);
          break;
        }
        job.failures.push({ songId: job.songs[i].id, title: job.songs[i].title,
          error: String(error?.message || error) });
      }
      if (job.state === 'paused_safety') break;
      job.current = i + 1;
      await saveJob(job);
    }
    if (job.state !== 'paused_safety') job.state = job.failures.length ? 'completed_with_errors' : 'completed';
  } catch (error) {
    job.state = 'failed';
    job.error = String(error?.message || error);
  } finally {
    job.finishedAt = new Date().toISOString();
    try { await saveJob(job); }
    finally { await releaseGpuLock(id); }
  }
}
