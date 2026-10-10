#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditPromptDiversity, cancelJob, getJob, gpuStatus, insideWorkspace, normalizeSong, parseBatch, resumeJob, runtimeStatus, startJob } from './runtime.mjs';
import { createProject, deleteProject, getProject, getProjectMix, getProjectScore, listProjectVersions, listProjects, renameProject, renameProjectGeneration, updateProject, updateProjectMix, useProjectGeneration, useProjectMix, useProjectScore, useProjectSeparation } from './projects.mjs';
import { exportProjectAudio } from './project-audio.mjs';
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
  description: 'Lit le mix actif ou une version de mix sauvegardée du profil actif, avec pistes, clips et réglages. Retourne mixRevision pour sécuriser une modification. Les chemins locaux de fichiers VST et les états propriétaires des plugins sont masqués ; les chemins de sources audio hors du projet sont masqués. Ne modifie ni ne rend le mix.',
  inputSchema: { projectId: z.string().min(1).max(128), mixId: z.string().regex(/^mix-v[0-9]+$/).optional() },
  annotations: { readOnlyHint: true },
}, call(async args => getProjectMix(args)));

server.registerTool('update_project_mix', {
  description: 'Modifie les niveaux master et de piste, le panoramique, mute et solo du mix actif. Passe mixRevision obtenu par get_project_mix ; l’outil refuse les changements périmés et ne rend pas l’audio.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    mixId: z.string().regex(/^mix-v[0-9]+$/).optional(),
    expectedMixRevision: z.string().regex(/^[a-f0-9]{64}$/),
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
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => updateProjectMix(args)));

server.registerTool('get_project_score', {
  description: 'Lit la partition active ou une version sauvegardée d’un projet du profil actif, avec ses voix et notes. Ne modifie ni ne convertit la partition.',
  inputSchema: { projectId: z.string().min(1).max(128), scoreId: z.string().regex(/^score-v[0-9]+$/).optional() },
  annotations: { readOnlyHint: true },
}, call(async args => getProjectScore(args)));

server.registerTool('export_project_audio', {
  description: 'Copie le WAV d’une génération terminée depuis le projet du profil Song Maker actif vers le workspace MCP. Vérifie le WAV et ne remplace jamais un fichier existant. Ne rend pas le mix et ne convertit pas en FLAC/MP3.',
  inputSchema: {
    projectId: z.string().min(1).max(128),
    generationId: z.string().regex(/^gen-[0-9]+$/),
    outputDirectory: z.string().min(1),
    fileName: z.string().min(1).max(180).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
}, call(async args => exportProjectAudio(args)));

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
  description: 'Lance une génération YuE2 locale en arrière-plan et retourne un job ID. La sortie WAV reste dans le workspace autorisé. Ne publie rien.',
  inputSchema: {
    title: z.string().min(1).max(120),
    style: z.string().min(1).max(4000),
    lyrics: z.string().max(4000),
    outputDirectory: z.string().min(1),
    targetDurationSec: z.number().int().min(30).max(360).default(180),
    cot: z.enum(['full', 'melody', 'off']).default('full'),
    instrumentalMode: z.boolean().default(false),
    seed: z.number().int().min(0).max(4294967295).optional(),
    creativeDirection: z.object({
      scene: z.string().max(240).optional(),
      groove: z.string().max(240).optional(),
      foreground: z.string().max(240).optional(),
      harmony: z.string().max(240).optional(),
      arrangement: z.string().max(240).optional(),
      motif: z.string().max(240).optional(),
    }).optional(),
  },
}, call(async args => startJob([normalizeSong({ ...args, id: '01' })], args.outputDirectory)));

server.registerTool('start_batch', {
  description: 'Lit un lot Song Maker V1 du workspace. Passe dryRun=true pour auditer les prompts sans utiliser le GPU. Par défaut, les lots doivent fournir scene, groove, foreground, harmony, arrangement et motif par titre; les doublons exacts sont refusés. Le job se met en pause après chaque piste pour son contrôle audio; resume_job confirme la validation et lance la piste suivante. Les exports suspects restent en pause qualité. Les WAV sont nommés 01 - Titre.wav, etc. Ne remplace aucun export existant.',
  inputSchema: {
    batchFile: z.string().min(1),
    outputDirectory: z.string().min(1).optional(),
    dryRun: z.boolean().default(false),
    reviewBeforeNext: z.boolean().default(true),
    requireCreativeDirection: z.boolean().default(true),
  },
}, call(async ({ batchFile, outputDirectory, dryRun, reviewBeforeNext, requireCreativeDirection }) => {
  const songs = parseBatch(await readFile(insideWorkspace(batchFile), 'utf8'));
  const promptAudit = auditPromptDiversity(songs);
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
  return startJob(songs, outputDirectory, { reviewBeforeNext });
}));

server.registerTool('job_status', {
  description: 'Lit l’avancement d’un lot YuE2, ses fichiers terminés et une éventuelle erreur. Ne lit pas les paroles.',
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: true },
}, call(async ({ jobId }) => {
  const job = await getJob(jobId);
  return { id: job.id, state: job.state, total: job.songs.length, current: job.current,
    completed: job.completed, failures: job.failures || [], error: job.error, outputDirectory: job.outputDirectory,
    engine: job.engine || null, warnings: job.warnings || [], promptAudit: job.promptAudit || null,
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
