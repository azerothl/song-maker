import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { importMidiToScoreDocument } from '@song-maker/score-engine';
import { insideWorkspace, publishExclusive, workspaceRoot as defaultWorkspaceRoot } from './runtime.mjs';

const execFile = promisify(execFileCallback);
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_MIDI_BYTES = 64 * 1024 * 1024;
const MIDI_TRACK_NAME = /^[^<>:"/\\|?*\x00-\x1f]+\.mid$/i;

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (
    relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  );
}

function midiFileName(value, sourcePath) {
  const base = path.basename(sourcePath, path.extname(sourcePath))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 174) || 'transcription';
  const fallback = `${base}.mid`;
  const name = value ?? fallback;
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() ||
      name === '.' || name === '..' || !MIDI_TRACK_NAME.test(name) || [...name].length > 180) {
    throw new Error('fileName doit être un nom de fichier MIDI simple en .mid (180 caractères maximum).');
  }
  return name;
}

async function resolveWorkspaceFile(userPath, workspace, label) {
  const absolute = insideWorkspace(userPath, workspace);
  const info = await lstat(absolute).catch(error => {
    if (error?.code === 'ENOENT') throw new Error(`${label} introuvable dans SONG_MAKER_WORKSPACE_ROOT.`);
    throw error;
  });
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} doit être un fichier régulier du workspace, sans lien symbolique.`);
  }
  const canonicalRoot = await realpath(workspace);
  const canonicalPath = await realpath(absolute);
  if (!isWithin(canonicalRoot, canonicalPath)) {
    throw new Error(`${label} doit rester dans SONG_MAKER_WORKSPACE_ROOT.`);
  }
  return { absolute, canonicalPath, info };
}

async function resolvePython(env) {
  const configured = env.SONG_MAKER_PYTHON?.trim();
  const candidates = configured ? [configured] : ['python3', 'python'];
  for (const executable of candidates) {
    try {
      await execFile(executable, ['-c', 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'], {
        windowsHide: true, timeout: 15_000, maxBuffer: 4096,
      });
      return executable;
    } catch (error) {
      if (configured) {
        throw new Error(`SONG_MAKER_PYTHON ne peut pas lancer Python 3.10+ : ${error?.message || error}`);
      }
    }
  }
  throw new Error('Python 3.10+ requis pour BasicPitch ONNX. Installe Python ou définis SONG_MAKER_PYTHON.');
}

function runBasicPitch(executable, script, source, destination, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [script, source, destination], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env,
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= 1024 * 1024) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on('data', chunk => {
      if (stderrBytes < 64 * 1024) {
        const accepted = chunk.subarray(0, 64 * 1024 - stderrBytes);
        stderr.push(accepted);
        stderrBytes += accepted.length;
      }
    });
    child.once('error', error => reject(new Error(`Lancement de BasicPitch impossible : ${error.message}`)));
    child.once('close', code => {
      const out = Buffer.concat(stdout).toString('utf8').trim();
      const err = Buffer.concat(stderr).toString('utf8').trim();
      if (stdoutBytes > 1024 * 1024) {
        reject(new Error('BasicPitch a produit une sortie de diagnostic trop volumineuse.'));
      } else if (code !== 0) {
        reject(new Error(`BasicPitch ONNX a échoué${err ? ` : ${err}` : ` (code ${code})`}`));
      } else {
        resolve(out);
      }
    });
  });
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** Transcribe a workspace audio file with the same ONNX script used by Song Maker. */
export async function transcribeAudioToMidi({
  sourcePath,
  outputDirectory,
  fileName,
  workspace = defaultWorkspaceRoot,
  env = process.env,
  transcriber = runBasicPitch,
  pythonResolver = resolvePython,
} = {}) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('sourcePath est requis.');
  if (typeof outputDirectory !== 'string' || !outputDirectory.trim()) throw new Error('outputDirectory est requis.');

  const source = await resolveWorkspaceFile(sourcePath, workspace, 'Le fichier audio source');
  if (source.info.size < 1 || source.info.size > MAX_SOURCE_BYTES) {
    throw new Error('Le fichier audio doit peser entre 1 octet et 256 Mio.');
  }

  const directory = insideWorkspace(outputDirectory, workspace);
  await mkdir(directory, { recursive: true });
  const directoryInfo = await lstat(directory);
  if (directoryInfo.isSymbolicLink() || !directoryInfo.isDirectory()) {
    throw new Error('outputDirectory doit être un dossier régulier du workspace, sans lien symbolique.');
  }
  const canonicalRoot = await realpath(workspace);
  const canonicalDirectory = await realpath(directory);
  if (!isWithin(canonicalRoot, canonicalDirectory)) {
    throw new Error('outputDirectory doit rester dans SONG_MAKER_WORKSPACE_ROOT.');
  }

  const name = midiFileName(fileName, source.absolute);
  const destination = path.join(canonicalDirectory, name);
  try {
    await lstat(destination);
    throw new Error(`Export déjà présent : ${name}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const temporaryDirectory = await mkdtemp(path.join(canonicalDirectory, '.song-maker-midi-'));
  const temporaryMidi = path.join(temporaryDirectory, 'transcription.mid');
  try {
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/basicpitch-product/transcribe.py');
    const executable = await pythonResolver(env);
    const stdout = await transcriber(executable, script, source.canonicalPath, temporaryMidi, env);
    const midiStat = await stat(temporaryMidi).catch(error => {
      if (error?.code === 'ENOENT') throw new Error('BasicPitch a terminé sans créer de fichier MIDI.');
      throw error;
    });
    if (!midiStat.isFile() || midiStat.size < 14 || midiStat.size > MAX_MIDI_BYTES) {
      throw new Error('Le fichier MIDI produit est vide, invalide ou dépasse 64 Mio.');
    }
    const midiBytes = await readFile(temporaryMidi);
    if (midiBytes.toString('ascii', 0, 4) !== 'MThd') {
      throw new Error('BasicPitch a produit un fichier qui ne respecte pas le format MIDI Standard.');
    }
    let parsed;
    try {
      parsed = importMidiToScoreDocument(midiBytes, { id: `mcp-basicpitch-${randomUUID()}` });
    } catch (error) {
      throw new Error(`Le MIDI produit ne peut pas être lu par l’éditeur de partition : ${error?.message || error}`);
    }
    const metadataLine = stdout.split(/\r?\n/).reverse().find(line => line.trim().startsWith('{'));
    let metadata;
    try { metadata = metadataLine ? JSON.parse(metadataLine) : null; }
    catch { metadata = null; }
    const model = typeof metadata?.model === 'string' ? path.basename(metadata.model) : '';
    if (metadata?.backend !== 'onnx' || !model.toLowerCase().endsWith('.onnx')) {
      throw new Error('BasicPitch n’a pas confirmé l’utilisation de son modèle ONNX.');
    }

    const sha256 = await hashFile(temporaryMidi);
    await publishExclusive(temporaryMidi, destination);
    return {
      sourcePath: path.relative(workspace, source.canonicalPath).split(path.sep).join('/'),
      midiPath: path.relative(workspace, destination).split(path.sep).join('/'),
      bytes: midiStat.size,
      sha256,
      noteCount: parsed.document.voices.reduce((total, voice) => total + voice.notes.length, 0),
      midiTrackCount: parsed.originalTracks.length,
      warnings: parsed.issues.map(issue => issue.code),
      backend: typeof metadata.backend === 'string' ? metadata.backend : 'onnx',
      tensorflowInstalled: metadata.tensorflowInstalled === true,
      model,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
