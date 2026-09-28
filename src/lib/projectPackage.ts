/**
 * Portable project package planning (#99).
 * Pure helpers: relative paths only, exclude model weights / secrets.
 */

export type PackageArtifactKind =
  | "project"
  | "score"
  | "midi"
  | "mix"
  | "production"
  | "media"
  | "export-meta"
  | "other";

export type PackageArtifact = {
  relativePath: string;
  kind: PackageArtifactKind;
  byteLength: number;
  included: boolean;
  reason?: string;
};

export type PackageLicenseNote = {
  id: string;
  label: string;
  summary: string;
};

export type PortablePackagePlan = {
  schema: "song-maker.portable-package";
  schemaVersion: 1;
  projectId: string;
  title: string;
  artifacts: PackageArtifact[];
  estimatedBytes: number;
  excludedBytes: number;
  missing: string[];
  licenses: PackageLicenseNote[];
  notes: string[];
};

export type PackageInventoryEntry = {
  relativePath: string;
  byteLength: number;
  exists: boolean;
};

const INCLUDE_PREFIXES = [
  "project.json",
  "scores/",
  "generations/",
  "separations/",
  "mixes/",
  "user-audio/",
  "exports/",
];

const EXCLUDE_PATH_PARTS = [
  "/models/",
  "models/",
  "lora/",
  ".gguf",
  "cache/",
  "settings.json",
  "tokens",
  "credentials",
];

export const DEFAULT_PACKAGE_LICENSES: PackageLicenseNote[] = [
  {
    id: "yue2",
    label: "YuE2",
    summary:
      "Modèle CC BY-NC 4.0 — poids non inclus dans le paquet ; usage commercial interdit sans droits séparés.",
  },
  {
    id: "htdemucs",
    label: "HTDemucs",
    summary:
      "Séparateur de stems — poids ONNX/cache exclus du paquet portable.",
  },
  {
    id: "bs-roformer",
    label: "BS-RoFormer (optionnel)",
    summary:
      "Pack optionnel non commercial possible — jamais embarqué dans l’archive projet.",
  },
];

export function shouldIncludeInPortablePackage(relativePath: string): {
  include: boolean;
  reason?: string;
} {
  const norm = relativePath.replace(/\\/g, "/");
  for (const part of EXCLUDE_PATH_PARTS) {
    if (norm.includes(part)) {
      return {
        include: false,
        reason: "Poids / cache / secrets exclus (pas de chemins absolus ni modèles).",
      };
    }
  }
  if (norm === "project.json") return { include: true };
  if (INCLUDE_PREFIXES.some((p) => p !== "project.json" && norm.startsWith(p))) {
    return { include: true };
  }
  return {
    include: false,
    reason: "Hors inventaire projet (non requis pour réouvrir le morceau).",
  };
}

export function classifyArtifact(relativePath: string): PackageArtifactKind {
  const p = relativePath.replace(/\\/g, "/");
  if (p === "project.json") return "project";
  if (p.startsWith("scores/") && p.endsWith(".json")) return "score";
  if (p.endsWith(".mid") || p.endsWith(".midi")) return "midi";
  if (p.startsWith("mixes/") && p.endsWith(".production.json")) return "production";
  if (p.startsWith("mixes/")) return "mix";
  if (p.startsWith("exports/") && p.endsWith(".json")) return "export-meta";
  if (
    p.startsWith("generations/") ||
    p.startsWith("separations/") ||
    p.startsWith("user-audio/") ||
    /\.(wav|flac|mp3)$/i.test(p)
  ) {
    return "media";
  }
  return "other";
}

/**
 * Build a preflight plan from a flat inventory of project-relative files.
 * Does not read disk — host supplies sizes / existence.
 */
export function buildPortablePackagePlan(input: {
  projectId: string;
  title: string;
  inventory: PackageInventoryEntry[];
  licenses?: PackageLicenseNote[];
}): PortablePackagePlan {
  const artifacts: PackageArtifact[] = [];
  const missing: string[] = [];
  let estimatedBytes = 0;
  let excludedBytes = 0;

  for (const entry of input.inventory) {
    const rel = entry.relativePath.replace(/\\/g, "/");
    if (rel.includes("..") || rel.startsWith("/")) {
      missing.push(rel);
      continue;
    }
    if (!entry.exists) {
      missing.push(rel);
      continue;
    }
    const gate = shouldIncludeInPortablePackage(rel);
    const art: PackageArtifact = {
      relativePath: rel,
      kind: classifyArtifact(rel),
      byteLength: entry.byteLength,
      included: gate.include,
      reason: gate.reason,
    };
    artifacts.push(art);
    if (gate.include) estimatedBytes += entry.byteLength;
    else excludedBytes += entry.byteLength;
  }

  const notes = [
    "Chemins relatifs uniquement — le paquet s’ouvre sur une autre machine sans dépendre des chemins absolus source.",
    "Export non destructif : le projet ouvert n’est pas modifié.",
    "Les poids de modèles et le cache LoRA ne sont jamais inclus.",
  ];

  return {
    schema: "song-maker.portable-package",
    schemaVersion: 1,
    projectId: input.projectId,
    title: input.title,
    artifacts,
    estimatedBytes,
    excludedBytes,
    missing,
    licenses: input.licenses ?? DEFAULT_PACKAGE_LICENSES,
    notes,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Kio`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mio`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Gio`;
}
