import type {
  GenerationSummary,
  MixVersionSummary,
  ProjectDoc,
  ScoreSummary,
  SeparationVersionSummary,
} from "../../../../src/lib/types";

export const PROJECT_ID = "demo-versions-133";

const STYLE_METAL =
  "Death-metal mélodique · 140 BPM · voix gutturales, cordes sombres";

function iso(day: string, time: string): string {
  return `${day}T${time}:00.000Z`;
}

type TakeSeed = {
  id: string;
  day: string;
  time: string;
  seed: number;
  parent?: string;
  state?: string;
  audio?: boolean;
  hasScore?: boolean;
  interrupted?: boolean;
};

const TAKE_ROWS: TakeSeed[] = [
  { id: "gen-013", day: "2026-09-29", time: "15:31", seed: 7710294, parent: "gen-012", interrupted: true },
  { id: "gen-012", day: "2026-09-29", time: "14:22", seed: 5528341, parent: "gen-011" },
  { id: "gen-011", day: "2026-09-29", time: "13:05", seed: 3391872, parent: "gen-009" },
  { id: "gen-010", day: "2026-09-29", time: "11:40", seed: 9904115, parent: "gen-009" },
  { id: "gen-009", day: "2026-09-28", time: "17:35", seed: 2246680, parent: "gen-008" },
  { id: "gen-008", day: "2026-09-28", time: "15:10", seed: 6183350, parent: "gen-007" },
  { id: "gen-007", day: "2026-09-28", time: "14:02", seed: 1470926, parent: "gen-006", interrupted: true },
  { id: "gen-006", day: "2026-09-28", time: "12:48", seed: 8052213, parent: "gen-004" },
  { id: "gen-005", day: "2026-09-28", time: "11:30", seed: 4419087 },
  { id: "gen-004", day: "2026-09-28", time: "10:05", seed: 3007718, parent: "gen-003" },
  { id: "gen-003", day: "2026-09-27", time: "18:40", seed: 5561904, parent: "gen-002" },
  { id: "gen-002", day: "2026-09-27", time: "17:12", seed: 1928845, parent: "gen-001" },
  { id: "gen-001", day: "2026-09-27", time: "16:30", seed: 6604271 },
];

export const generations: GenerationSummary[] = TAKE_ROWS.map((row) => {
  const interrupted = row.interrupted === true;
  return {
    id: row.id,
    createdAt: iso(row.day, row.time),
    seed: row.seed,
    cot: interrupted ? "melody" : "full",
    state: interrupted ? "interrupted" : "generated",
    hasScore: !interrupted,
    parentGenerationId: row.parent ?? null,
    audioPath: interrupted ? null : `/mock/${row.id}/audio.wav`,
    semanticTruncated: false,
    canContinue: false,
  };
});

export const project: ProjectDoc = {
  schema: "song-maker.project",
  schemaVersion: 1,
  id: PROJECT_ID,
  title: "test 3",
  createdAt: iso("2026-09-27", "16:00"),
  updatedAt: iso("2026-09-29", "14:22"),
  sampleRate: 48_000,
  channels: 2,
  bitDepth: 24,
  style: STYLE_METAL,
  lyrics: "Paroles de démonstration pour l’onglet Versions.",
  cot: "full",
  singingLanguage: null,
  tempoBpm: 140,
  key: null,
  meter: null,
  targetDurationSec: 180,
  preferFullLyrics: true,
  instrumentalMode: false,
  activeGenerationId: "gen-012",
  activeSeparationId: "sep-002",
  activeMixId: "mix-v3",
  activeScoreId: "score-v4",
  generationNames: {
    "gen-004": "Version démo",
    "gen-010": "Essai plus lumineux",
  },
};

export const separations: SeparationVersionSummary[] = [
  {
    separationId: "sep-002",
    mixId: "mix-v3",
    createdAt: iso("2026-09-29", "13:50"),
    isActive: true,
    generationId: "gen-012",
  },
  {
    separationId: "sep-001",
    mixId: "mix-v2",
    createdAt: iso("2026-09-28", "16:20"),
    isActive: false,
    generationId: "gen-009",
  },
];

export const scores: ScoreSummary[] = [
  { id: "score-v4", version: 4, source: "gen", noteCount: 120, createdAt: iso("2026-09-29", "14:31") },
  { id: "score-v3", version: 3, source: "gen", noteCount: 118, createdAt: iso("2026-09-29", "13:00") },
  { id: "score-v2", version: 2, source: "gen", noteCount: 100, createdAt: iso("2026-09-28", "13:05") },
  { id: "score-v1", version: 1, source: "gen", noteCount: 90, createdAt: iso("2026-09-27", "16:35") },
];

export const mixVersions: MixVersionSummary[] = [
  { id: "mix-v3", separationId: "sep-002", createdAt: iso("2026-09-29", "14:40"), isActive: true },
  { id: "mix-v2", separationId: "sep-001", createdAt: iso("2026-09-28", "17:50"), isActive: false },
  { id: "mix-v1", separationId: "sep-001", createdAt: iso("2026-09-28", "12:00"), isActive: false },
];
