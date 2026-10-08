#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { auditPromptDiversity, cancelJob, getJob, gpuStatus, insideWorkspace, normalizeSong, parseBatch, resumeJob, runtimeStatus, startJob } from './runtime.mjs';

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
