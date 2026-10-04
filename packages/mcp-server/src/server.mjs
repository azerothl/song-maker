#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getJob, insideWorkspace, normalizeSong, parseBatch, runtimeStatus, startJob } from './runtime.mjs';

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
  },
}, call(async args => startJob([normalizeSong({ ...args, id: '01' })], args.outputDirectory)));

server.registerTool('start_batch', {
  description: 'Lit un lot Song Maker V1 du workspace et lance les chansons l’une après l’autre en arrière-plan. Les WAV sont nommés 01 - Titre.wav, etc. Ne remplace aucun export existant.',
  inputSchema: {
    batchFile: z.string().min(1),
    outputDirectory: z.string().min(1),
  },
}, call(async ({ batchFile, outputDirectory }) => {
  const songs = parseBatch(await readFile(insideWorkspace(batchFile), 'utf8'));
  return startJob(songs, outputDirectory);
}));

server.registerTool('job_status', {
  description: 'Lit l’avancement d’un lot YuE2, ses fichiers terminés et une éventuelle erreur. Ne lit pas les paroles.',
  inputSchema: { jobId: z.string().uuid() },
  annotations: { readOnlyHint: true },
}, call(async ({ jobId }) => {
  const job = await getJob(jobId);
  return { id: job.id, state: job.state, total: job.songs.length, current: job.current,
    completed: job.completed, error: job.error, outputDirectory: job.outputDirectory,
    createdAt: job.createdAt, finishedAt: job.finishedAt || null };
}));

await server.connect(new StdioServerTransport());
