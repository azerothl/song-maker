import type {
  AudioFormat,
  CorpusSong,
  CorpusValidationIssue,
  CorpusValidationResult,
  SongSplit,
} from "./types.js";

export const MIN_DURATION_MS = 5_000;
export const MAX_DURATION_MS = 15 * 60_000;
export const SUPPORTED_FORMATS: readonly AudioFormat[] = [
  "wav",
  "flac",
  "mp3",
  "ogg",
];

export function formatFromPath(path: string): AudioFormat {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  const ext = m?.[1]?.toLowerCase();
  switch (ext) {
    case "wav":
      return "wav";
    case "flac":
      return "flac";
    case "mp3":
      return "mp3";
    case "ogg":
      return "ogg";
    default:
      return "unknown";
  }
}

/**
 * Validate formats, durations, and duplicates (by path and optional content hash).
 */
export function validateCorpus(songs: CorpusSong[]): CorpusValidationResult {
  const issues: CorpusValidationIssue[] = [];
  if (songs.length === 0) {
    return {
      ok: false,
      songs: [],
      issues: [
        {
          code: "empty_corpus",
          messageFr: "Corpus vide — ajoutez au moins un morceau audio.",
        },
      ],
      duplicateGroups: [],
    };
  }

  const byPath = new Map<string, string[]>();
  const byHash = new Map<string, string[]>();

  for (const song of songs) {
    if (!song.audioPath?.trim()) {
      issues.push({
        code: "missing_audio",
        songId: song.songId,
        messageFr: `Morceau « ${song.title} » : chemin audio manquant.`,
      });
      continue;
    }
    const format =
      song.format === "unknown" ? formatFromPath(song.audioPath) : song.format;
    if (!SUPPORTED_FORMATS.includes(format)) {
      issues.push({
        code: "unsupported_format",
        songId: song.songId,
        messageFr: `Format non supporté pour « ${song.title} » (${song.audioPath}). Accepte : wav, flac, mp3, ogg.`,
      });
    }
    if (song.durationMs < MIN_DURATION_MS) {
      issues.push({
        code: "duration_too_short",
        songId: song.songId,
        messageFr: `« ${song.title} » trop court (< ${MIN_DURATION_MS / 1000} s).`,
      });
    }
    if (song.durationMs > MAX_DURATION_MS) {
      issues.push({
        code: "duration_too_long",
        songId: song.songId,
        messageFr: `« ${song.title} » trop long (> ${MAX_DURATION_MS / 60000} min).`,
      });
    }
    const pathKey = song.audioPath.replace(/\\/g, "/").toLowerCase();
    const pathGroup = byPath.get(pathKey) ?? [];
    pathGroup.push(song.songId);
    byPath.set(pathKey, pathGroup);
    if (song.contentSha256) {
      const hash = song.contentSha256.toLowerCase();
      const hashGroup = byHash.get(hash) ?? [];
      hashGroup.push(song.songId);
      byHash.set(hash, hashGroup);
    }
  }

  const duplicateGroups: string[][] = [];
  for (const group of byPath.values()) {
    if (group.length > 1) {
      duplicateGroups.push(group);
      issues.push({
        code: "duplicate_path",
        messageFr: `Chemins audio en double : ${group.join(", ")}.`,
      });
    }
  }
  for (const group of byHash.values()) {
    if (group.length > 1) {
      duplicateGroups.push(group);
      issues.push({
        code: "duplicate_hash",
        messageFr: `Contenu audio en double (SHA-256) : ${group.join(", ")}.`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    songs,
    issues,
    duplicateGroups,
  };
}

/**
 * Split train/val by whole song ids. Never splits segments of the same song.
 */
export function splitByWholeSong(
  songs: CorpusSong[],
  valFraction = 0.2,
  rng: () => number = Math.random,
): SongSplit {
  const ids = songs.map((s) => s.songId);
  if (ids.length < 2) {
    return { trainSongIds: ids, valSongIds: [] };
  }
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  const valCount = Math.max(1, Math.min(ids.length - 1, Math.round(ids.length * valFraction)));
  const valSongIds = shuffled.slice(0, valCount);
  const valSet = new Set(valSongIds);
  const trainSongIds = shuffled.filter((id) => !valSet.has(id));
  return { trainSongIds, valSongIds };
}

/** Require at least one train and one val song when corpus has 2+ songs. */
export function assertSplitUsable(
  songs: CorpusSong[],
  split: SongSplit,
): CorpusValidationIssue | null {
  if (songs.length >= 2 && (split.trainSongIds.length === 0 || split.valSongIds.length === 0)) {
    return {
      code: "insufficient_for_split",
      messageFr:
        "Partition train/val invalide — il faut au moins un morceau entier en validation.",
    };
  }
  const all = new Set(songs.map((s) => s.songId));
  for (const id of [...split.trainSongIds, ...split.valSongIds]) {
    if (!all.has(id)) {
      return {
        code: "insufficient_for_split",
        songId: id,
        messageFr: `Morceau inconnu dans le split : ${id}.`,
      };
    }
  }
  const overlap = split.trainSongIds.filter((id) =>
    split.valSongIds.includes(id),
  );
  if (overlap.length > 0) {
    return {
      code: "insufficient_for_split",
      messageFr:
        "Un même morceau ne peut pas être à la fois en entraînement et en validation.",
    };
  }
  return null;
}
