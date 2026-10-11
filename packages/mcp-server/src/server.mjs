#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditPromptDiversity, cancelJob, getJob, gpuStatus, insideWorkspace, normalizeSong, parseBatch, resumeJob, runtimeStatus, startJob, uniqueBatchSongs } from './runtime.mjs';
import { addProjectMidiTrack, createProject, createProjectMidiTrack, deleteProject, editProjectScore, getProject, getProjectMix, getProjectScore, importProjectAudioTrack, importProjectGeneration, listProjectVersions, listProjects, renameProject, renameProjectGeneration, updateProject, updateProjectMix, useProjectGeneration, useProjectMix, useProjectScore, useProjectSeparation } from './projects.mjs';
import { exportProjectAudio, exportProjectStems, renderProjectMix } from './project-audio.mjs';
import { listLocalResources } from './resources.mjs';
import {
  addLibraryTrack, addTrackToPlaylist, createUserPlaylist, deleteUserPlaylist,
  listUserLibrary, removeLibraryTrack, removeProjectLibraryTracks, removeTrackFromPlaylist,
} from './library.mjs';

const server = new McpServer({ name: 'song-maker-yue2', version: '0.1.0' });
const reply = value => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const call = fn => async args => {
  try { return reply(await fn(args)); }
  catch (error) { return { isError: true, content: [{ type: 'text', text: String(error?.message || error) }] }; }
};

server.registerTool('runtime_status', {
  description: 'Vérifie la disponibilité du moteur local audio.cpp et des poids YuE2. Ne lance aucune génération.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, call(async () => runtimeStatus()));

server.registerTool('gpu_status', {
  description: 'Lit la température et la VRAM libre du GPU NVIDIA, puis indique si les limites de génération YuE2 sont respectées. Ne lance aucune génération.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, call(async () => gpuStatus()));

server.registerTool('list_local_resources', {
  description: 'Lit les réglages du profil Song Maker actif et vérifie les modèles, séparateurs et runtimes locaux connus. Masque les chemins absolus ; ne télécharge, n’installe, n’active et ne sélectionne aucune ressource.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, call(async () => listLocalResources()));

server.registerTool('list_projects', {
  description: 'Liste les projets du profil Song Maker actif. Lecture seule ; retourne les métadonnées du projet sans ses paroles.',
  inputSchema: { query: z.string().max(200).optional() },
  annotations: { readOnlyHint: true },
}, call(async args => listProjects(args)));

server.registerTool('get_project', {
  description: 'Lit une fiche du profil Song Maker actif, notamment son style et ses paroles. Ne modifie pas le projet.',
  inputSchema: { projectId: z.string().min(1).max(128) },
  annotations: { readOnlyHint: true },
}, call(async args => getProject(args)));

server.registerTool('list_project_versions', {
  description: 'Liste les générations, séparations, versions de mix et partitions enregistrées pour un projet du profil actif. Retourne leur état et métadonnées, les sélections actives et les chemins WAV relatifs au projet ; ne lit ni paroles ni données audio.',
  inputSchema: { projectId: z.string().min(1).max(128) },
  annotations: { readOnlyHint: true },
}, call(async args => listProjectVersions(args)));

server.registerTool('use_project_generation', {
  description: 'Sélectionne une génération WAV terminée comme prise active du projet, selon le comportement de Versions dans Song Maker. Relis le projet et passe son updatedAt comme expectedUpdatedAt ; la sélection efface la séparation et le mix actifs. Aucun audio n’est généré.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().regex(/^gen-[0-9]+$/),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => useProjectGeneration(args)));

server.registerTool('rename_project_generation', {
  description: 'Renomme une prise du projet ou retire son nom personnalisé si name est vide. Relis le projet et passe son updatedAt comme expectedUpdatedAt ; aucun fichier audio n’est modifié.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().regex(/^gen-[0-9]+$/),
    name: z.string().max(500),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => renameProjectGeneration(args)));

server.registerTool('use_project_separation', {
  description: 'Active une séparation sauvegardée et son mix associé, selon le comportement des versions dans Song Maker. Relis le projet et passe son updatedAt comme expectedUpdatedAt. Ne relance pas la séparation et ne supprime aucun artefact.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    separationId: z.string().regex(/^sep-[0-9]+$/),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => useProjectSeparation(args)));

server.registerTool('use_project_mix', {
  description: 'Sélectionne un mix sauvegardé comme mix actif et synchronise la séparation associée lorsqu’elle est disponible. Relis le projet et passe son updatedAt comme expectedUpdatedAt. Ne modifie aucun réglage et ne rend pas le mix.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    mixId: z.string().regex(/^mix-v[0-9]+$/),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => useProjectMix(args)));

server.registerTool('use_project_score', {
  description: 'Sélectionne une partition sauvegardée comme partition active du projet. Relis le projet et passe son updatedAt comme expectedUpdatedAt. Ne modifie pas le contenu de la partition.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    scoreId: z.string().regex(/^score-v[0-9]+$/),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => useProjectScore(args)));

server.registerTool('get_project_mix', {
  description: 'Lit le mix actif ou une version de mix sauvegardée du profil actif, avec pistes, clips et réglages. Retourne mixRevision et productionRevision pour sécuriser les modifications ; effectsByTrack expose les inserts DSP internes pris en charge. Les chemins locaux VST et les états propriétaires des plugins sont masqués. Ne modifie ni ne rend le mix.',
  inputSchema: { projectId: z.string().min(1).max(128), mixId: z.string().regex(/^mix-v[0-9]+$/).optional() },
  annotations: { readOnlyHint: true },
}, call(async args => getProjectMix(args)));

const mcpDspEffectSchema = z.object({
  id: z.string().trim().min(1).max(128),
  kind: z.enum(['limiter', 'compressor', 'gate', 'eq', 'parametricEq', 'filter', 'delay', 'reverb']),
  enabled: z.boolean(),
  params: z.record(z.string().min(1).max(128), z.union([
    z.number().finite(), z.string().max(2048), z.boolean(),
  ])).optional(),
}).strict();

server.registerTool('update_project_mix', {
  description: 'Modifie les niveaux master et de piste, l’arrangement, les clips et les chaînes d’effets DSP internes du mix actif. Pour les effets, passe effectsByTrack et productionRevision obtenus par get_project_mix ; chaque chaîne remplace celle de la piste ciblée et les effets sont écrits dans le fichier de production partagé avec l’application. Modifie les effets dans un appel distinct. Les plugins VST3 et les effets vocaux à consentement restent indisponibles via MCP. Les autres changements utilisent mixRevision ; les sources sont vérifiées lors des trims/scissions. Ne rend pas l’audio.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    mixId: z.string().regex(/^mix-v[0-9]+$/).optional(),
    expectedMixRevision: z.string().regex(/^[a-f0-9]{64}$/),
    expectedProductionRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    effectsByTrack: z.record(z.string().min(1).max(128), z.array(mcpDspEffectSchema).max(128)).optional(),
    masterGainDb: z.number().finite().min(-24).max(12).optional(),
    tracks: z.array(z.object({
      id: z.string().min(1).max(128),
      gainDb: z.number().finite().min(-24).max(12).optional(),
      pan: z.number().finite().min(-1).max(1).optional(),
      mute: z.boolean().optional(),
      solo: z.boolean().optional(),
    }).strict().refine(track => track.gainDb !== undefined || track.pan !== undefined ||
      track.mute !== undefined || track.solo !== undefined, {
      message: 'Chaque piste doit contenir au moins un réglage.',
    })).max(256).optional(),
    clipEdits: z.array(z.discriminatedUnion('operation', [
      z.object({
        operation: z.literal('move'), clipId: z.string().min(1).max(128),
        startMs: z.number().int().safe().min(0).max(86_400_000),
      }).strict(),
      z.object({
        operation: z.literal('trim'), clipId: z.string().min(1).max(128),
        offsetMs: z.number().int().safe().min(0).max(86_400_000),
        durationMs: z.number().int().safe().min(1).max(86_400_000),
      }).strict(),
      z.object({
        operation: z.literal('fade'), clipId: z.string().min(1).max(128),
        fadeInMs: z.number().int().safe().min(0).max(86_400_000).optional(),
        fadeOutMs: z.number().int().safe().min(0).max(86_400_000).optional(),
      }).strict().refine(edit => edit.fadeInMs !== undefined || edit.fadeOutMs !== undefined, {
        message: 'Renseigne fadeInMs ou fadeOutMs.',
      }),
      z.object({
        operation: z.literal('gain'), clipId: z.string().min(1).max(128),
        gainDb: z.number().finite().min(-24).max(12),
      }).strict(),
      z.object({
        operation: z.literal('processing'), clipId: z.string().min(1).max(128),
        enabled: z.boolean(),
      }).strict(),
      z.object({
        operation: z.literal('take_active'), clipId: z.string().min(1).max(128),
        active: z.boolean(),
      }).strict(),
      z.object({
        operation: z.literal('cut'), clipId: z.string().min(1).max(128),
        atMs: z.number().int().safe().min(0).max(86_400_000),
      }).strict(),
      z.object({
        operation: z.literal('duplicate'), clipId: z.string().min(1).max(128),
        startMs: z.number().int().safe().min(0).max(86_400_000),
      }).strict(),
    ])).min(1).max(1000).optional(),
    tempoMap: z.array(z.object({
      startMs: z.number().int().safe().min(0),
      quarterBpm: z.number().int().min(1).max(400),
    }).strict()).min(1).max(512).optional(),
    timeSignatures: z.array(z.object({
      startMs: z.number().int().safe().min(0),
      numerator: z.number().int().min(1).max(4_294_967_295),
      denominator: z.number().int().min(1).max(4_294_967_295),
    }).strict()).max(512).optional(),
    markers: z.array(z.object({
      id: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(120),
      kind: z.enum(['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'interlude', 'outro', 'other']),
      startMs: z.number().int().safe().min(0),
    }).strict()).max(512).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => updateProjectMix(args)));

server.registerTool('add_project_midi_track', {
  description: 'Ajoute au mix actif une voie MIDI reliée à une voix existante de la partition active. Appelle get_project_score et get_project_mix ; passe voiceId, scoreRevision et mixRevision. Refuse les révisions périmées et ne crée aucune note.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    voiceId: z.string().trim().min(1).max(128),
    expectedScoreRevision: z.string().regex(/^[a-f0-9]{64}$/),
    expectedMixRevision: z.string().regex(/^[a-f0-9]{64}$/),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => addProjectMidiTrack(args)));

server.registerTool('create_project_midi_track', {
  description: 'Crée une voix MIDI vide et sa piste liée au mix. Appelle get_project_score et get_project_mix pour fournir les révisions des documents déjà actifs ; dans un projet vierge, omets les révisions manquantes et le serveur initialise partition et mix comme le Studio. Une idempotencyKey stable permet de réessayer sans doublon.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120).optional(),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{1,96}$/),
    expectedScoreRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    expectedMixRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, call(async args => createProjectMidiTrack(args)));

server.registerTool('get_project_score', {
  description: 'Lit la partition active ou une version sauvegardée d’un projet du profil actif, avec ses voix et notes et scoreRevision pour sécuriser une édition. Les chemins locaux et états propriétaires VST sont masqués.',
  inputSchema: { projectId: z.string().min(1).max(128), scoreId: z.string().regex(/^score-v[0-9]+$/).optional() },
  annotations: { readOnlyHint: true },
}, call(async args => getProjectScore(args)));

const midiNoteSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  startTick: z.number().int().min(0).max(10_000_000),
  durationTick: z.number().int().min(1).max(10_000_000),
  pitch: z.number().int().min(0).max(127),
  velocity: z.number().int().min(1).max(127),
  tieStart: z.boolean().optional(),
  tieEnd: z.boolean().optional(),
}).strict();
const scoreEditSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add'), voiceId: z.string().min(1).max(128), note: midiNoteSchema }).strict(),
  z.object({ operation: z.literal('update'), voiceId: z.string().min(1).max(128), noteId: z.string().min(1).max(128),
    changes: z.object({ startTick: z.number().int().min(0).max(10_000_000).optional(),
      durationTick: z.number().int().min(1).max(10_000_000).optional(), pitch: z.number().int().min(0).max(127).optional(),
      velocity: z.number().int().min(1).max(127).optional() }).strict()
      .refine(changes => Object.keys(changes).length > 0, { message: 'Indique au moins un champ MIDI.' }) }).strict(),
  z.object({ operation: z.literal('delete'), voiceId: z.string().min(1).max(128), noteId: z.string().min(1).max(128) }).strict(),
]);

server.registerTool('edit_project_score', {
  description: 'Ajoute, modifie ou supprime des notes MIDI de la partition active. Passe scoreRevision de get_project_score. Chaque édition crée une nouvelle version de partition et conserve les versions précédentes. Les opérations sont limitées aux notes.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    expectedScoreRevision: z.string().regex(/^[a-f0-9]{64}$/),
    edits: z.array(scoreEditSchema).min(1).max(512),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => editProjectScore(args)));

server.registerTool('export_project_audio', {
  description: 'Exporte le WAV d’une génération terminée depuis le projet du profil Song Maker actif vers le workspace MCP. WAV conserve la source par défaut ; WAV et FLAC acceptent une profondeur de 16 ou 24 bits, MP3 un débit de 128, 192 ou 320 kbit/s. Les conversions nécessitent FFmpeg. Vérifie le résultat et ne remplace jamais un fichier existant. N’exporte pas le mix actif.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().regex(/^gen-[0-9]+$/),
    outputDirectory: z.string().min(1),
    format: z.enum(['wav', 'flac', 'mp3']).optional(),
    fileName: z.string().min(1).max(180).optional(),
    bitDepth: z.union([z.literal(16), z.literal(24)]).optional(),
    bitrateKbps: z.union([z.literal(128), z.literal(192), z.literal(320)]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => exportProjectAudio(args)));

server.registerTool('render_project_mix', {
  description: 'Rend le mix actif ou une version sauvegardée du profil Song Maker avec le moteur DSP partagé (clips, niveaux, automation, effets internes, sidechain et routage), puis exporte un WAV/FLAC/MP3 dans le workspace. Les sources doivent être des WAV PCM ou float32 mono/stéréo à la fréquence du mix ; les inserts VST3 master ne sont pas exécutés. Le rendu est borné à 256 Mio de sources et à une estimation de 512 Mio de mémoire. Refuse les révisions de mix périmées et ne remplace jamais un fichier existant.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    mixId: z.string().regex(/^mix-v[0-9]+$/).optional(),
    outputDirectory: z.string().min(1),
    fileName: z.string().min(1).max(180).optional(),
    format: z.enum(['wav', 'flac', 'mp3']).optional(),
    bitDepth: z.union([z.literal(16), z.literal(24)]).optional(),
    bitrateKbps: z.union([z.literal(128), z.literal(192), z.literal(320)]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => renderProjectMix(args)));

server.registerTool('export_project_stems', {
  description: 'Exporte un ou plusieurs WAV de stems depuis une séparation terminée du profil Song Maker actif vers SONG_MAKER_WORKSPACE_ROOT. Passe separationId depuis list_project_versions ; sans roles, exporte les stems disponibles. Vérifie les hashes et les WAV, refuse les liens symboliques, les révisions invalides et tout écrasement. Ne lance pas une nouvelle séparation.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    separationId: z.string().regex(/^sep-[0-9]+$/),
    outputDirectory: z.string().min(1),
    roles: z.array(z.enum(['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'])).min(1).max(6).refine(values => new Set(values).size === values.length).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => exportProjectStems(args)));

server.registerTool('import_project_audio_track', {
  description: 'Importe un WAV, MP3 ou FLAC depuis SONG_MAKER_WORKSPACE_ROOT dans une nouvelle piste audio du mix actif. Appelle get_project puis, si un mix est actif, get_project_mix pour fournir les révisions. Conserve l’original, normalise une copie en WAV float32 stéréo 48 kHz avec FFmpeg/libsoxr et retourne les chemins, la durée, le hash, la piste et la nouvelle mixRevision. Ne rend pas le mix.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    sourcePath: z.string().min(1).max(4096),
    name: z.string().trim().min(1).max(120).optional(),
    startMs: z.number().int().safe().min(0).max(86_400_000).optional(),
    muteExisting: z.boolean().optional(),
    expectedUpdatedAt: z.string().min(1).max(80),
    expectedMixRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => importProjectAudioTrack(args)));

server.registerTool('import_job_audio_track', {
  description: 'Importe dans le mix actif du projet un WAV terminé par start_song ou start_batch. Attend un job completed/completed_with_errors et choisit completedIndex parmi ses sorties validées. Appelle get_project et get_project_mix avant l’import pour fournir les révisions courantes. Le WAV doit toujours être dans SONG_MAKER_WORKSPACE_ROOT ; l’original est conservé et une copie normalisée est ajoutée au mix. Cette opération crée un clip audio du mix, pas une nouvelle version de génération YuE2.',
  inputSchema: {
    jobId: z.string().uuid(),
    completedIndex: z.number().int().safe().min(0).max(9999).default(0),
    projectId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120).optional(),
    startMs: z.number().int().safe().min(0).max(86_400_000).optional(),
    muteExisting: z.boolean().optional(),
    expectedUpdatedAt: z.string().min(1).max(80),
    expectedMixRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async ({ jobId, completedIndex, ...args }) => {
  const job = await getJob(jobId);
  if (!['completed', 'completed_with_errors'].includes(job.state)) {
    throw new Error('Le job doit être terminé avant l’import. Consulte job_status et réessaie lorsque son état est completed ou completed_with_errors.');
  }
  if (typeof job.outputDirectory !== 'string' || !job.outputDirectory.trim()) {
    throw new Error('Le job ne déclare pas de dossier de sortie valide.');
  }
  if (!Array.isArray(job.completed) || !job.completed[completedIndex]) {
    throw new Error(`Aucune sortie terminée à l’index ${completedIndex} dans ce job.`);
  }
  const completed = job.completed[completedIndex];
  if (typeof completed.destination !== 'string' || !completed.destination.trim()) {
    throw new Error('La sortie terminée ne contient pas de chemin WAV valide.');
  }
  const outputDirectory = insideWorkspace(job.outputDirectory);
  const sourcePath = insideWorkspace(completed.destination);
  const outputRelativePath = path.relative(outputDirectory, sourcePath);
  if (outputRelativePath === '..' || outputRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelativePath)) {
    throw new Error('Le WAV ne se trouve pas dans le dossier de sortie déclaré par ce job.');
  }
  const imported = await importProjectAudioTrack({ ...args, sourcePath });
  return {
    jobId,
    completedIndex,
    songId: completed.songId ?? null,
    title: completed.title ?? null,
    ...imported,
  };
}));

server.registerTool('import_job_generation', {
  description: 'Importe une sortie WAV terminée de start_song ou start_batch dans l’historique des versions du projet actif. Attends completed/completed_with_errors dans job_status et passe expectedUpdatedAt obtenu avec get_project. La génération importée est visible dans list_project_versions, conserve la sortie d’origine dans le projet et ne devient pas active automatiquement ; appelle use_project_generation après vérification si tu veux la sélectionner. Le job doit encore être dans SONG_MAKER_WORKSPACE_ROOT. Cette opération ne change pas le mix actif.',
  inputSchema: {
    jobId: z.string().uuid(),
    completedIndex: z.number().int().safe().min(0).max(9999).default(0),
    projectId: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120).optional(),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async ({ jobId, completedIndex, projectId, name, expectedUpdatedAt }) => {
  const job = await getJob(jobId);
  if (!['completed', 'completed_with_errors'].includes(job.state)) {
    throw new Error('Le job doit être terminé avant l’import. Consulte job_status et réessaie lorsque son état est completed ou completed_with_errors.');
  }
  if (typeof job.outputDirectory !== 'string' || !job.outputDirectory.trim()) {
    throw new Error('Le job ne déclare pas de dossier de sortie valide.');
  }
  if (!Array.isArray(job.completed) || !job.completed[completedIndex]) {
    throw new Error(`Aucune sortie terminée à l’index ${completedIndex} dans ce job.`);
  }
  const completed = job.completed[completedIndex];
  if (typeof completed.destination !== 'string' || !completed.destination.trim()) {
    throw new Error('La sortie terminée ne contient pas de chemin WAV valide.');
  }
  const outputDirectory = insideWorkspace(job.outputDirectory);
  const sourcePath = insideWorkspace(completed.destination);
  const outputRelativePath = path.relative(outputDirectory, sourcePath);
  if (outputRelativePath === '..' || outputRelativePath.startsWith(`..${path.sep}`) || path.isAbsolute(outputRelativePath)) {
    throw new Error('Le WAV ne se trouve pas dans le dossier de sortie déclaré par ce job.');
  }
  const imported = await importProjectGeneration({
    projectId,
    sourcePath,
    sourceDirectory: outputDirectory,
    name: name ?? completed.title,
    jobId,
    songId: completed.songId,
    engine: job.engine,
    modelId: job.modelId,
    seed: completed.seed,
    jobCreatedAt: job.createdAt,
    jobFinishedAt: job.finishedAt,
    expectedUpdatedAt,
  });
  return {
    jobId,
    completedIndex,
    songId: completed.songId ?? null,
    title: completed.title ?? null,
    ...imported,
  };
}));

server.registerTool('create_project', {
  description: 'Crée un projet vide dans le profil Song Maker actif. Le projet et ses dossiers sont enregistrés au format de l’application et deviennent visibles dans Projets.',
  inputSchema: { title: z.string().min(1).max(120) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => createProject(args)));

server.registerTool('rename_project', {
  description: 'Renomme un projet du profil actif. Utilise updatedAt renvoyé par get_project comme expectedUpdatedAt ; l’outil refuse une écriture fondée sur une fiche périmée.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    title: z.string().min(1).max(120),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => renameProject(args)));

server.registerTool('update_project', {
  description: 'Met à jour les champs fournis du formulaire d’un projet Song Maker. Relis d’abord le projet et passe son updatedAt comme expectedUpdatedAt. Les règles de validation du formulaire sont appliquées avant sauvegarde.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().min(1).max(80),
    title: z.string().min(1).max(120).optional(),
    style: z.string().optional(),
    lyrics: z.string().max(4000).optional(),
    cot: z.enum(['full', 'melody', 'off']).optional(),
    singingLanguage: z.string().max(4000).nullable().optional(),
    tempoBpm: z.number().int().min(40).max(220).nullable().optional(),
    key: z.object({
      tonic: z.enum(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']),
      mode: z.enum(['major', 'minor']),
    }).nullable().optional(),
    meter: z.object({
      numerator: z.number().int(), denominator: z.number().int(),
    }).nullable().optional(),
    targetDurationSec: z.number().int().min(30).max(360).refine(value => value % 30 === 0).optional(),
    preferFullLyrics: z.boolean().optional(),
    instrumentalMode: z.boolean().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => updateProject(args)));

server.registerTool('delete_project', {
  description: 'Supprime définitivement un projet du profil actif et retire ses titres de la Bibliothèque. Relis le projet, passe son updatedAt comme expectedUpdatedAt et confirme avec confirm=true.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().min(1).max(80),
    confirm: z.literal(true),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, call(async args => {
  const deleted = await deleteProject(args);
  try {
    const library = await removeProjectLibraryTracks({ projectId: args.projectId });
    return { ...deleted, removedLibraryTracks: library.removedCount, libraryUpdatedAt: library.updatedAt };
  } catch (error) {
    return {
      ...deleted,
      libraryCleanupWarning: `Projet supprimé, mais nettoyage de la Bibliothèque impossible : ${error?.message || error}`,
    };
  }
}));

server.registerTool('list_library', {
  description: 'Liste les titres explicitement conservés dans la Bibliothèque et ses playlists pour le profil actif. Aucun projet non sélectionné n’est ajouté.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, call(async args => listUserLibrary(args)));

server.registerTool('create_playlist', {
  description: 'Crée une playlist dans la Bibliothèque du profil actif. Passe updatedAt obtenu par list_library comme expectedUpdatedAt ; utilise null si la Bibliothèque n’a pas encore été créée.',
  inputSchema: {
    title: z.string().min(1).max(120),
    expectedUpdatedAt: z.string().max(80).nullable(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => createUserPlaylist(args)));

server.registerTool('delete_playlist', {
  description: 'Supprime une playlist et retire son identifiant des titres associés. Les titres restent dans la Bibliothèque. Requiert confirm=true et la révision issue de list_library.',
  inputSchema: {
    playlistId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().min(1).max(80),
    confirm: z.literal(true),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, call(async args => deleteUserPlaylist(args)));

server.registerTool('add_library_track', {
  description: 'Ajoute à la Bibliothèque une prise générée qui possède un WAV dans le projet du profil actif. La validation du fichier audio précède l’inscription.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().max(80).nullable(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => addLibraryTrack(args)));

server.registerTool('remove_library_track', {
  description: 'Retire un titre de la Bibliothèque sans supprimer le projet ni le fichier audio. Requiert confirm=true et la révision issue de list_library.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().min(1).max(80),
    confirm: z.literal(true),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
}, call(async args => removeLibraryTrack(args)));

server.registerTool('add_track_to_playlist', {
  description: 'Ajoute un titre déjà conservé dans la Bibliothèque à une playlist.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    playlistId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => addTrackToPlaylist(args)));

server.registerTool('remove_track_from_playlist', {
  description: 'Retire un titre d’une playlist sans le retirer de la Bibliothèque.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().min(1).max(128),
    playlistId: z.string().min(1).max(128),
    expectedUpdatedAt: z.string().min(1).max(80),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => removeTrackFromPlaylist(args)));

server.registerTool('start_song', {
  description: 'Lance une génération YuE2 locale et retourne un job ID. engineId est facultatif ; choisis-le parmi les moteurs marqués mcpGenerationSupported dans list_local_resources. YuE2 est actuellement le seul disponible. Le modèle actif dans Song Maker sert par défaut ; modelId permet de choisir q4 ou q8 explicitement. Le serveur vérifie le profil actif, le consentement et la présence du modèle. La sortie WAV reste dans le workspace autorisé. Ne publie rien.',
  inputSchema: {
    title: z.string().min(1).max(120),
    style: z.string().min(1).max(4000),
    lyrics: z.string().max(4000),
    outputDirectory: z.string().min(1),
    targetDurationSec: z.number().int().min(30).max(360).default(180),
    cot: z.enum(['full', 'melody', 'off']).default('full'),
    instrumentalMode: z.boolean().default(false),
    seed: z.number().int().min(0).max(4294967295).optional(),
    engineId: z.enum(['yue2']).optional(),
    modelId: z.enum(['q4', 'q8']).optional(),
    creativeDirection: z.object({
      scene: z.string().max(240).optional(),
      groove: z.string().max(240).optional(),
      foreground: z.string().max(240).optional(),
      harmony: z.string().max(240).optional(),
      arrangement: z.string().max(240).optional(),
      motif: z.string().max(240).optional(),
    }).optional(),
  },
}, call(async args => startJob([normalizeSong({ ...args, id: '01' })], args.outputDirectory,
  { engineId: args.engineId, modelId: args.modelId })));

server.registerTool('start_batch', {
  description: 'Lit un lot Song Maker V1 du workspace. Passe dryRun=true pour auditer les prompts sans utiliser le GPU. Choisis engineId parmi les moteurs marqués mcpGenerationSupported dans list_local_resources ; YuE2 est actuellement le seul disponible. modelId permet de choisir q4 ou q8 explicitement, sinon Song Maker fournit le modèle actif. Chaque titre peut demander 1 à 1000 prises, dans une limite de 10000 prises par lot. Les lots doivent fournir scene, groove, foreground, harmony, arrangement et motif par titre; les doublons exacts sont refusés. Par défaut, le job se met en pause après chaque prise pour son contrôle audio; resume_job confirme la validation et lance la suivante. Les exports suspects restent en pause qualité. Les WAV sont nommés 01 - Titre.wav, avec un suffixe de prise si un titre en comporte plusieurs. Ne remplace aucun export existant.',
  inputSchema: {
    batchFile: z.string().min(1),
    outputDirectory: z.string().min(1).optional(),
    engineId: z.enum(['yue2']).optional(),
    modelId: z.enum(['q4', 'q8']).optional(),
    dryRun: z.boolean().default(false),
    reviewBeforeNext: z.boolean().default(true),
    requireCreativeDirection: z.boolean().default(true),
  },
}, call(async ({ batchFile, outputDirectory, engineId, modelId, dryRun, reviewBeforeNext, requireCreativeDirection }) => {
  const songs = parseBatch(await readFile(insideWorkspace(batchFile), 'utf8'));
  const promptAudit = auditPromptDiversity(uniqueBatchSongs(songs));
  if (dryRun) return promptAudit;
  if (!outputDirectory) throw new Error('outputDirectory est requis pour lancer le lot.');
  if (requireCreativeDirection && promptAudit.underSpecified.length) {
    throw new Error(`Le lot doit préciser les six axes de creativeDirection pour chaque titre. Titres incomplets : ${promptAudit.underSpecified.map(song => `${song.id} (${song.title})`).join(', ')}.`);
  }
  if (requireCreativeDirection && promptAudit.exactDuplicates.length) {
    throw new Error(`Le lot contient des prompts de direction identiques : ${promptAudit.exactDuplicates.map(pair => `${pair.first}/${pair.second}`).join(', ')}.`);
  }
  if (requireCreativeDirection && promptAudit.similarPairs.length) {
    const examples = promptAudit.similarPairs.slice(0, 10).map(pair => `${pair.first}/${pair.second} (${pair.similarity})`);
    throw new Error(`Le lot contient ${promptAudit.similarPairs.length} paires de directions lexicalement proches (seuil 0,65), par exemple ${examples.join(', ')}. Varie les scènes, grooves, timbres, harmonies, arrangements et motifs avant de lancer.`);
  }
  return startJob(songs, outputDirectory, { reviewBeforeNext, engineId, modelId });
}));

server.registerTool('job_status', {
  description: 'Lit l’avancement d’un lot YuE2, ses fichiers terminés et une éventuelle erreur. Ne lit pas les paroles.',
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: true },
}, call(async ({ jobId }) => {
  const job = await getJob(jobId);
  return { id: job.id, state: job.state, total: job.songs.length,
    sourceSongs: job.sourceSongCount ?? uniqueBatchSongs(job.songs).length, current: job.current,
    completed: job.completed, failures: job.failures || [], error: job.error, outputDirectory: job.outputDirectory,
    engine: job.engine || null, modelId: job.modelId || null, warnings: job.warnings || [], promptAudit: job.promptAudit || null,
    reviewBeforeNext: job.reviewBeforeNext || false, reviewRequired: job.reviewRequired || null,
    reviewWorkerActive: job.reviewWorkerActive || false,
    reviewAcknowledgedAt: job.reviewAcknowledgedAt || null,
    createdAt: job.createdAt, finishedAt: job.finishedAt || null, safetyStoppedAt: job.safetyStoppedAt || null };
}));

server.registerTool('resume_job', {
  description: 'Reprend un job arrêté par les limites GPU, ou confirme la validation de la piste affichée dans reviewRequired avant de lancer la suivante. Consulte job_status et vérifie le WAV avant de reprendre.',
  inputSchema: { jobId: z.string().uuid() },
}, call(async ({ jobId }) => resumeJob(jobId)));

server.registerTool('cancel_job', {
  description: 'Annule un job YuE2 en cours. La piste en cours est arrêtée et les pistes déjà exportées sont conservées. job_status indique quand l’annulation est terminée.',
  inputSchema: { jobId: z.string().uuid() },
}, call(async ({ jobId }) => cancelJob(jobId)));

await server.connect(new StdioServerTransport());
