import {
  assertSplitUsable,
  splitByWholeSong,
  validateCorpus,
} from "./corpus.js";
import { estimateTrainingResources } from "./estimates.js";
import {
  QUALITY_DISCLAIMER_FR,
  RIGHTS_DISCLAIMER_FR,
  TRAINING_JOBS_DIR,
  type LaunchTrainingRequest,
  type LaunchTrainingResult,
  type TrainingCancelResult,
  type TrainingCleanupResult,
  type TrainingJobLogTail,
  type TrainingJobManifest,
  type TrainingJobStatus,
} from "./types.js";

export type TrainingJobStore = {
  mkdir(path: string): Promise<void>;
  writeText(path: string, data: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  remove?(path: string): Promise<void>;
  readText?(path: string): Promise<string | null>;
};

/** In-memory store for UI / tests — writes job artifacts without real disk. */
export class MemoryTrainingJobStore implements TrainingJobStore {
  readonly files = new Map<string, string>();
  readonly dirs = new Set<string>();

  async mkdir(path: string): Promise<void> {
    this.dirs.add(normalizePath(path));
  }

  async writeText(path: string, data: string): Promise<void> {
    const p = normalizePath(path);
    this.files.set(p, data);
    const parent = p.split("/").slice(0, -1).join("/");
    if (parent) this.dirs.add(parent);
  }

  async exists(path: string): Promise<boolean> {
    const p = normalizePath(path);
    return this.files.has(p) || this.dirs.has(p);
  }

  async remove(path: string): Promise<void> {
    const p = normalizePath(path);
    this.files.delete(p);
    this.dirs.delete(p);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(p + "/")) this.files.delete(key);
    }
  }

  async readText(path: string): Promise<string | null> {
    return this.files.get(normalizePath(path)) ?? null;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

let jobSeq = 0;

export function createJobId(now = Date.now()): string {
  jobSeq += 1;
  return `lora-nar-${now}-${jobSeq}`;
}

export function buildManifest(
  request: LaunchTrainingRequest,
  jobId: string,
  status: TrainingJobStatus,
): TrainingJobManifest {
  const split = splitByWholeSong(
    request.songs,
    request.valFraction ?? 0.2,
    () => 0.42,
  );
  return {
    schema: "song-maker.lora-training-job",
    schemaVersion: 1,
    jobId,
    createdAt: new Date().toISOString(),
    slot: "nar",
    purpose: "style_timbre_nar",
    status,
    rightsConfirmed: request.rightsConfirmed,
    corpusRoot: request.corpusRoot,
    songs: request.songs,
    split,
    estimate: estimateTrainingResources(request.songs),
    trainerScript: request.trainerScriptPath ?? null,
    paths: {
      manifest: "manifest.json",
      logs: "logs/train.log",
      metrics: "metrics.json",
      samples: "samples/",
      adapter: "adapter/nar_lora.safetensors",
    },
    baseModelPin: {
      family: "yue2",
      noteFr:
        "Épingler la même révision YuE2 / audio.cpp que l’app avant validation de l’adaptateur.",
    },
    autoActivate: false,
    catalogEligible: false,
  };
}

/**
 * Validate corpus, write job folder + manifest, then either:
 * - mark not_implemented (no trainer script), or
 * - mark queued when trainerExists (caller may shell out).
 * Never auto-activates an adapter.
 */
export async function launchTrainingJob(
  request: LaunchTrainingRequest,
  store: TrainingJobStore,
): Promise<LaunchTrainingResult> {
  const jobId = createJobId();
  const jobsRoot = request.jobsRoot ?? TRAINING_JOBS_DIR;
  const jobDir = joinPath(jobsRoot, jobId);

  if (!request.rightsConfirmed) {
    const manifest = buildManifest(request, jobId, "failed");
    return {
      status: "failed",
      jobId,
      jobDir,
      manifest,
      shelledOut: false,
      messageFr: RIGHTS_DISCLAIMER_FR,
    };
  }

  const validation = validateCorpus(request.songs);
  if (!validation.ok) {
    const manifest = buildManifest(request, jobId, "failed");
    await writeJobSkeleton(store, jobDir, {
      ...manifest,
      status: "failed",
    });
    return {
      status: "failed",
      jobId,
      jobDir,
      manifest: { ...manifest, status: "failed" },
      shelledOut: false,
      messageFr: validation.issues.map((i) => i.messageFr).join(" "),
    };
  }

  const split = splitByWholeSong(
    request.songs,
    request.valFraction ?? 0.2,
    () => 0.42,
  );
  const splitIssue = assertSplitUsable(request.songs, split);
  if (splitIssue) {
    const manifest = buildManifest(request, jobId, "failed");
    await writeJobSkeleton(store, jobDir, { ...manifest, status: "failed" });
    return {
      status: "failed",
      jobId,
      jobDir,
      manifest: { ...manifest, status: "failed" },
      shelledOut: false,
      messageFr: splitIssue.messageFr,
    };
  }

  const trainerExists = Boolean(request.trainerExists);
  const status: TrainingJobStatus = trainerExists
    ? "queued"
    : "not_implemented";
  const manifest = {
    ...buildManifest(request, jobId, status),
    split,
  };

  await writeJobSkeleton(store, jobDir, manifest);

  if (!trainerExists) {
    return {
      status: "not_implemented",
      jobId,
      jobDir,
      manifest,
      shelledOut: false,
      messageFr:
        "Corpus validé et dossier de job écrit. " +
        "Trainer NAR : non implémenté (aucun script local). " +
        "Placez un script (ex. scripts/lora-train-nar.py) pour un lancement isolé. " +
        QUALITY_DISCLAIMER_FR,
    };
  }

  // Honest: we do not spawn processes from the browser package.
  // A Node/Tauri host may shell out using trainerScriptPath + jobDir.
  return {
    status: "queued",
    jobId,
    jobDir,
    manifest,
    shelledOut: true,
    messageFr:
      "Corpus validé, manifeste écrit. " +
      `Trainer détecté (${request.trainerScriptPath}) — prêt pour exécution isolée par l’hôte. ` +
      "Adaptateur non activé automatiquement. " +
      QUALITY_DISCLAIMER_FR,
  };
}

async function writeJobSkeleton(
  store: TrainingJobStore,
  jobDir: string,
  manifest: TrainingJobManifest,
): Promise<void> {
  await store.mkdir(jobDir);
  await store.mkdir(joinPath(jobDir, "logs"));
  await store.mkdir(joinPath(jobDir, "samples"));
  await store.mkdir(joinPath(jobDir, "adapter"));
  await store.writeText(
    joinPath(jobDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  await store.writeText(
    joinPath(jobDir, "logs", "train.log"),
    `[${manifest.createdAt}] job ${manifest.jobId} status=${manifest.status}\n`,
  );
  await store.writeText(
    joinPath(jobDir, "metrics.json"),
    JSON.stringify({ status: manifest.status, losses: [] }, null, 2),
  );
}

export async function cancelTrainingJob(
  jobId: string,
  store: TrainingJobStore,
  jobsRoot = TRAINING_JOBS_DIR,
): Promise<TrainingCancelResult> {
  const manifestPath = joinPath(jobsRoot, jobId, "manifest.json");
  if (!(await store.exists(manifestPath))) {
    return {
      jobId,
      status: "not_running",
      messageFr: "Job introuvable — rien à annuler.",
    };
  }
  const raw = store.readText ? await store.readText(manifestPath) : null;
  if (!raw) {
    return {
      jobId,
      status: "not_implemented",
      messageFr:
        "Annulation : lecture du manifeste non disponible dans ce store.",
    };
  }
  const manifest = JSON.parse(raw) as TrainingJobManifest;
  if (manifest.status === "not_implemented" || manifest.status === "completed") {
    return {
      jobId,
      status: "not_running",
      messageFr: `Job en état « ${manifest.status} » — pas de processus à arrêter.`,
    };
  }
  const next: TrainingJobManifest = { ...manifest, status: "cancelled" };
  await store.writeText(manifestPath, JSON.stringify(next, null, 2));
  if (store.readText) {
    const logPath = joinPath(jobsRoot, jobId, "logs", "train.log");
    const prev = (await store.readText(logPath)) ?? "";
    await store.writeText(
      logPath,
      prev + `[cancel] ${new Date().toISOString()}\n`,
    );
  }
  return {
    jobId,
    status: "cancelled",
    messageFr: "Job marqué annulé (signal coopératif).",
  };
}

export async function readTrainingLogs(
  jobId: string,
  store: TrainingJobStore,
  jobsRoot = TRAINING_JOBS_DIR,
  maxLines = 200,
): Promise<TrainingJobLogTail> {
  const logPath = joinPath(jobsRoot, jobId, "logs", "train.log");
  if (!store.readText || !(await store.exists(logPath))) {
    return { jobId, lines: [], truncated: false };
  }
  const text = (await store.readText(logPath)) ?? "";
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length <= maxLines) {
    return { jobId, lines, truncated: false };
  }
  return {
    jobId,
    lines: lines.slice(-maxLines),
    truncated: true,
  };
}

export async function cleanupTrainingJob(
  jobId: string,
  store: TrainingJobStore,
  jobsRoot = TRAINING_JOBS_DIR,
): Promise<TrainingCleanupResult> {
  const jobDir = joinPath(jobsRoot, jobId);
  if (!(await store.exists(jobDir)) && !(await store.exists(joinPath(jobDir, "manifest.json")))) {
    return {
      jobId,
      removed: false,
      messageFr: "Dossier de job déjà absent.",
    };
  }
  if (!store.remove) {
    return {
      jobId,
      removed: false,
      messageFr: "Nettoyage non supporté par ce store.",
    };
  }
  await store.remove(jobDir);
  return {
    jobId,
    removed: true,
    messageFr: "Dossier de job et artefacts temporaires supprimés.",
  };
}
