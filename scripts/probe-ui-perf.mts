#!/usr/bin/env node
/**
 * Probe Playwright — ouverture onglet Partition (issue #231).
 *
 * Usage : node --import tsx scripts/probe-ui-perf.mts
 *         pnpm bench:score-open
 *
 * Sortie JSON sur stdout uniquement (ne modifie pas les fichiers suivis sous bench/).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function runBench(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["bench:score-tab"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BENCH_SKIP_WRITE: "1" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `bench:score-tab exit ${code}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function extractJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("JSON bench introuvable dans la sortie");
  }
  return JSON.parse(stdout.slice(start, end + 1));
}

function phaseMs(
  report: {
    scorePanelOpen?: { phases?: { phase: string; durationMs: number }[] };
    scorePanelOpenLong?: { phases?: { phase: string; durationMs: number }[] };
  },
  key: "scorePanelOpen" | "scorePanelOpenLong",
  phaseName: string,
): number | null {
  const phases = report[key]?.phases ?? [];
  const hit = phases.find((p) => p.phase === phaseName);
  return hit ? hit.durationMs : null;
}

async function main() {
  const stdout = await runBench();
  const raw = extractJson(stdout) as Record<string, unknown>;

  const referenceOpenMs = phaseMs(
    raw as {
      scorePanelOpen?: { phases?: { phase: string; durationMs: number }[] };
      scorePanelOpenLong?: { phases?: { phase: string; durationMs: number }[] };
    },
    "scorePanelOpen",
    "ouverture → portée visible (total)",
  );
  const longOpenMs = phaseMs(
    raw as {
      scorePanelOpen?: { phases?: { phase: string; durationMs: number }[] };
      scorePanelOpenLong?: { phases?: { phase: string; durationMs: number }[] };
    },
    "scorePanelOpenLong",
    "ouverture → portée visible (total)",
  );

  const referenceHasSvg = (
    raw as {
      scorePanelOpen?: {
        phases?: { detail?: { hasSvg?: boolean } }[];
      };
    }
  ).scorePanelOpen?.phases?.find((p) => p.detail?.hasSvg != null)?.detail
    ?.hasSvg;

  const longHasSvg = (
    raw as {
      scorePanelOpenLong?: {
        phases?: { detail?: { hasSvg?: boolean } }[];
      };
    }
  ).scorePanelOpenLong?.phases?.find((p) => p.detail?.hasSvg != null)?.detail
    ?.hasSvg;

  const probe = {
    ...raw,
    probe: "score-open",
    issue: 231,
    command: "pnpm bench:score-open",
    summary: {
      referenceOpenMs,
      longOpenMs,
      referenceHasSvg,
      longHasSvg,
    },
  };

  console.log(JSON.stringify(probe, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
